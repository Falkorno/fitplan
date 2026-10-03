import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { extname, join, normalize, resolve } from 'node:path'

const root = resolve('dist')
const port = Number(process.env.PORT || 5173)
const host = process.env.HOST || '0.0.0.0'
const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
}

if (!existsSync(join(root, 'index.html'))) {
  console.error('The dist folder is missing. Run "npm run build" first.')
  process.exit(1)
}

const readBody = request => new Promise((resolveBody, reject) => {
  const chunks = []
  let size = 0
  request.on('data', chunk => {
    size += chunk.length
    if (size > 65536) reject(new Error('Webhook payload is too large.'))
    else chunks.push(chunk)
  })
  request.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')))
  request.on('error', reject)
})

const relayWebhook = async (request, response, url) => {
  if (request.method === 'GET') {
    const challenge = url.searchParams.get('hub.challenge')
    if (!challenge) { response.statusCode = 400; response.end('Missing challenge.'); return }
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.end(JSON.stringify({'hub.challenge': challenge}))
    return
  }
  if (request.method !== 'POST') { response.statusCode = 405; response.end('Method not allowed.'); return }
  try {
    const body = await readBody(request)
    const forward = new URL(url.searchParams.get('forward') || '')
    if (forward.protocol !== 'https:' || forward.hostname !== 'script.google.com' || !forward.pathname.startsWith('/macros/s/')) throw new Error('Invalid webhook relay target.')
    response.statusCode = 200
    response.end('OK')
    fetch(forward, {method:'POST', headers:{'Content-Type':'application/json'}, body, redirect:'follow'}).catch(error => console.error('Strava webhook relay failed:', error))
  } catch (error) {
    response.statusCode = 400
    response.end('Invalid webhook request.')
    console.error(error)
  }
}


const firebaseApiKey = 'AIzaSyBdrqbNw6o3LWkBALlX2t6B1Z8O_NCdY8Q'
const aiRateLimits = new Map()
const aiReviewCache = new Map()
const sendJson = (response,status,value) => { response.statusCode=status; response.setHeader('Content-Type','application/json; charset=utf-8'); response.setHeader('Cache-Control','no-store'); response.end(JSON.stringify(value)) }
const verifyFirebaseUser = async request => {
  const authorization=request.headers.authorization||''
  if(!authorization.startsWith('Bearer '))throw Object.assign(new Error('Sign in before using AI planning.'),{statusCode:401})
  const result=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:authorization.slice(7)})})
  if(!result.ok)throw Object.assign(new Error('Your sign-in has expired. Sign in again and retry.'),{statusCode:401})
  const user=(await result.json()).users?.[0]
  if(!user?.localId)throw Object.assign(new Error('No signed-in user was found.'),{statusCode:401})
  return user
}
const checkAiRateLimit = uid => { const now=Date.now(),recent=(aiRateLimits.get(uid)||[]).filter(value=>value>now-3600000); if(recent.length>=10)throw Object.assign(new Error('AI planning limit reached. Try again later.'),{statusCode:429}); recent.push(now); aiRateLimits.set(uid,recent) }
const compactSession = session => ({id:String(session.id||''),date:String(session.date||''),title:String(session.title||'').slice(0,80),category:String(session.category||'').slice(0,40),intensity:String(session.intensity||''),completed:Boolean(session.completed),skipped:Boolean(session.skipped),locked:Boolean(session.locked),plannedMinutes:Number(session.plannedDurationMinutes)||null,plannedKm:Number(session.plannedDistanceKm)||null,actualMinutes:Number(session.actualDurationMinutes)||null,actualKm:Number(session.actualDistanceKm)||null,effort:Number(session.perceivedEffort)||null,notes:typeof session.notes==='string'?session.notes.slice(0,240):null,stravaMatched:Boolean(session.stravaActivityId),activityTags:Array.isArray(session.activityTags)?session.activityTags.slice(0,8):[],activityStats:session.activityStats&&typeof session.activityStats==='object'?session.activityStats:{}})
const outputText = result => result.output_text||result.output?.flatMap(item=>item.content||[]).find(item=>item.type==='output_text')?.text
const aiPlanSchema={
  type:'object',
  additionalProperties:false,
  required:['trainingSummary','weeklyFocus','runDistanceMultiplier','cycleDistanceMultiplier','scheduleObservations','targetFeedback','availabilityTip'],
  properties:{
    trainingSummary:{type:'string',minLength:1,maxLength:320},
    weeklyFocus:{type:'string',minLength:1,maxLength:240},
    runDistanceMultiplier:{type:'number',minimum:.8,maximum:1.1},
    cycleDistanceMultiplier:{type:'number',minimum:.8,maximum:1.1},
    scheduleObservations:{type:'array',maxItems:5,items:{type:'string',maxLength:240}},
    targetFeedback:{type:'array',maxItems:4,items:{type:'string',maxLength:240}},
    availabilityTip:{type:'string',minLength:1,maxLength:320}
  }
}
const validAiReview=value=>value&&typeof value.trainingSummary==='string'&&typeof value.weeklyFocus==='string'&&Number.isFinite(value.runDistanceMultiplier)&&value.runDistanceMultiplier>=.8&&value.runDistanceMultiplier<=1.1&&Number.isFinite(value.cycleDistanceMultiplier)&&value.cycleDistanceMultiplier>=.8&&value.cycleDistanceMultiplier<=1.1&&Array.isArray(value.scheduleObservations)&&value.scheduleObservations.length<=5&&Array.isArray(value.targetFeedback)&&value.targetFeedback.length<=4&&typeof value.availabilityTip==='string'
const callAiReviewer=async(model,input,instructions)=>{
 const apiResponse=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model,store:false,reasoning:{effort:'low',context:'current_turn'},instructions,input:JSON.stringify(input),max_output_tokens:700,text:{verbosity:'low',format:{type:'json_schema',name:'stride_week_review',strict:true,schema:aiPlanSchema}}})})
 const result=await apiResponse.json();if(!apiResponse.ok)throw new Error(result?.error?.message||`${model} could not review the plan.`)
 const text=outputText(result);if(!text)throw new Error(`${model} returned no review.`)
 const review=JSON.parse(text);if(!validAiReview(review))throw new Error(`${model} returned an invalid review.`)
 return {...review,__usage:{inputTokens:Number(result.usage?.input_tokens)||0,outputTokens:Number(result.usage?.output_tokens)||0}}
}
let bankHolidayCache={at:0,data:null}
const getBankHolidays=async()=>{if(bankHolidayCache.data&&Date.now()-bankHolidayCache.at<86400000)return bankHolidayCache.data;const result=await fetch('https://www.gov.uk/bank-holidays.json');if(!result.ok)throw new Error('Bank holidays unavailable');const data=await result.json();bankHolidayCache={at:Date.now(),data};return data}
const serveBankHolidays=async(response,url)=>{try{const start=String(url.searchParams.get('start')||''),end=String(url.searchParams.get('end')||'');const data=await getBankHolidays(),events=data?.['england-and-wales']?.events||[];sendJson(response,200,events.filter(item=>item.date>=start&&item.date<=end).map(item=>({date:item.date,title:item.title})))}catch{sendJson(response,200,[])}}
const createAiWeekPlan = async (request,response) => {
  try{
    if(request.method!=='POST'){sendJson(response,405,{error:'Method not allowed.'});return}
    if(!process.env.OPENAI_API_KEY){sendJson(response,503,{error:'The OpenAI API key is not configured on the server.'});return}
    const [user,holidayData]=await Promise.all([verifyFirebaseUser(request),getBankHolidays().catch(()=>null)])
    const raw=JSON.parse(await readBody(request))
    if(!raw?.draftWeek?.startDate||!Array.isArray(raw.draftWeek.sessions)||raw.draftWeek.sessions.length<1||raw.draftWeek.sessions.length>20)throw Object.assign(new Error('The draft week is invalid.'),{statusCode:400})
    const draft={startDate:String(raw.draftWeek.startDate),sessions:raw.draftWeek.sessions.map(compactSession)}
    const trainingHistory=Array.isArray(raw.trainingHistory)?raw.trainingHistory.slice(0,4).map(week=>({startDate:String(week.startDate||''),plannedSessions:Number(week.plannedSessions)||0,completedSessions:Number(week.completedSessions)||0,skippedSessions:Number(week.skippedSessions)||0,adherencePercent:Number(week.adherencePercent)||0,plannedRunKm:Number(week.plannedRunKm)||0,completedRunKm:Number(week.completedRunKm)||0,completedCycleKm:Number(week.completedCycleKm)||0,longestRunKm:Number(week.longestRunKm)||0,hardSessions:Number(week.hardSessions)||0,completedStrengthSessions:Number(week.completedStrengthSessions)||0,averageEffort:Number.isFinite(Number(week.averageEffort))?Number(week.averageEffort):null,totalElevationM:Number(week.totalElevationM)||0,averageRunHeartRate:Number.isFinite(Number(week.averageRunHeartRate))?Number(week.averageRunHeartRate):null,averageRidePowerWatts:Number.isFinite(Number(week.averageRidePowerWatts))?Number(week.averageRidePowerWatts):null,poweredRideCount:Number(week.poweredRideCount)||0,activityTags:Array.isArray(week.activityTags)?week.activityTags.slice(0,8):[],wfhDays:Array.isArray(week.wfhDays)?week.wfhDays.filter(day=>Number.isInteger(day)&&day>=0&&day<=4):[]})):[]
    const recovery=Array.isArray(raw.recovery)?raw.recovery.slice(-14).map(entry=>({date:String(entry.date||''),energy:Number(entry.energy)||0,soreness:Number(entry.soreness)||0})):[]
    const targetWeekEnd=new Date(draft.startDate+'T12:00:00');targetWeekEnd.setDate(targetWeekEnd.getDate()+6)
    const endDate=targetWeekEnd.toISOString().slice(0,10),bankHolidays=(holidayData?.['england-and-wales']?.events??[]).filter(item=>item.date>=draft.startDate&&item.date<=endDate).map(item=>({date:item.date,title:item.title}))
    const goals=raw.goals&&typeof raw.goals==='object'?raw.goals:{}
    const input={targetWeekStart:draft.startDate,wfhDays:Array.isArray(raw.wfhDays)?raw.wfhDays.filter(day=>Number.isInteger(day)&&day>=0&&day<=4):[],previousWfhDays:Array.isArray(raw.previousWfhDays)?raw.previousWfhDays:[],bankHolidays,speedWorkAllowed:Boolean(raw.includeSpeedWork),goals,recentTrainingHistory:trainingHistory,recentRecovery:recovery,draftSessions:draft.sessions}
    const instructions='Review this locally generated running, cycling and strength week. Do not add, remove, rename, move or reschedule sessions. Judge actual completed load, adherence and recovery before planned load. Use elevation, heart rate, cycling power and activity tags when present, but do not infer power zones without an FTP or heart-rate zones without athlete thresholds. Return only the requested report. Keep both multipliers within 0.8 to 1.1; use 1.0 unless a change is clearly justified, reduce for poor completion or recovery, and never compensate for missed work. When weeklyRunKm or weeklyCycleKm is explicitly provided, set that discipline multiplier to 1.0 and discuss realism in targetFeedback instead of changing the entered target. Flag material target, spacing or availability concerns concisely. The local scheduler owns all hard constraints.'
    const cacheInput={...input,draftSessions:input.draftSessions.map(({id,...session})=>session)},cacheKey=createHash('sha256').update(JSON.stringify(cacheInput)).digest('hex'),cached=aiReviewCache.get(cacheKey)
    if(cached&&cached.at>Date.now()-604800000){sendJson(response,200,{...cached.review,reviewModel:cached.model,cached:true});return}
    checkAiRateLimit(user.localId)
    const model='gpt-6-luna'
    let rawReview
    try{rawReview=await callAiReviewer(model,input,instructions)}catch(error){console.error('AI reviewer failed:',error);throw Object.assign(new Error('The coaching review failed validation. The local plan is still available.'),{statusCode:502})}
    const {__usage,...review}=rawReview,inputTokens=rawReview.__usage?.inputTokens??0,outputTokens=rawReview.__usage?.outputTokens??0,estimatedUsd=Math.round((inputTokens*.1/1000000+outputTokens*.5/1000000)*1000000)/1000000
    const result={...review,reviewModel:model,inputTokens,outputTokens,estimatedUsd}
    aiReviewCache.set(cacheKey,{at:Date.now(),review:result,model});if(aiReviewCache.size>100)aiReviewCache.delete(aiReviewCache.keys().next().value)
    sendJson(response,200,{...result,cached:false})
  }catch(error){if(!error.statusCode||error.statusCode>=500)console.error('AI weekly planning failed:',error);sendJson(response,error.statusCode||500,{error:error.statusCode?error.message:'AI planning is temporarily unavailable. The standard planner can still be used.'})}
}

createServer((request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
  const pathname = decodeURIComponent(url.pathname)
  if (pathname === '/api/strava-webhook') { relayWebhook(request, response, url); return }
  if (pathname === '/api/ai-week-plan') { createAiWeekPlan(request, response); return }
  if (pathname === '/api/bank-holidays') { serveBankHolidays(response, url); return }

  const requested = normalize(pathname).replace(/^([/\\])+/, '')
  let file = resolve(root, requested)

  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
    file = join(root, 'index.html')
  }

  response.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream')
  const freshShell = file.endsWith('index.html') || file.endsWith('sw.js') || file.endsWith('manifest.webmanifest')
  const hashedAsset = file.includes(join(root, 'assets'))
  response.setHeader('Cache-Control', freshShell ? 'no-store, no-cache, must-revalidate' : hashedAsset ? 'public, max-age=31536000, immutable' : 'public, max-age=3600')
  createReadStream(file).on('error', () => {
    response.statusCode = 500
    response.end('Unable to read the application file.')
  }).pipe(response)
}).listen(port, host, () => {
  console.log(`Stride is running at http://${host}:${port}`)
})



