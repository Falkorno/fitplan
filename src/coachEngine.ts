import { iso, kind } from './data'
import { getTrainingLoadSummary } from './trainingLoad'
import type { ExternalActivity, HealthAdjustment, RecoveryEntry, Session, TrainingGoals, TrainingWeek } from './types'

export type CoachAction =
  | { type:'adapt_health'; adjustmentId:string }
  | { type:'shorten_session'; sessionId:string; multiplier:number }
  | { type:'update_run_target'; weeklyRunKm:number }
  | { type:'acknowledge' }
export interface CoachDecision { id:string; priority:'high'|'medium'|'low'; title:string; detail:string; evidence:string; actionLabel:string; action:CoachAction }

const parse=(value:string)=>new Date(`${value}T12:00:00`)
const plusDays=(value:string,days:number)=>{const date=parse(value);date.setDate(date.getDate()+days);return iso(date)}
const roundHalf=(value:number)=>Math.max(.5,Math.round(value*2)/2)
const nextEditable=(week:TrainingWeek,today:string,predicate:(session:Session)=>boolean)=>week.sessions.filter(session=>session.date>=today&&!session.completed&&!session.skipped&&!session.locked&&predicate(session)).sort((a,b)=>a.date.localeCompare(b.date))[0]

export function getCoachDecisions(input:{week:TrainingWeek;weeks:TrainingWeek[];activities:ExternalActivity[];recovery:RecoveryEntry[];goals?:TrainingGoals;healthAdjustment?:HealthAdjustment;today?:string}):CoachDecision[]{
 const today=input.today??iso(new Date()),decisions:CoachDecision[]=[],load=getTrainingLoadSummary(input.activities,input.recovery,today),adjustment=input.healthAdjustment
 if(adjustment&&adjustment.endDate>=today&&!adjustment.appliedAt){
  const labels={easy:'make affected sessions easy',shorten:'shorten affected endurance sessions by 20%',pause:'pause affected workouts'}
  decisions.push({id:`health:${adjustment.id}`,priority:'high',title:'Adapt while you are not feeling 100%',detail:`From ${adjustment.startDate} to ${adjustment.endDate}, ${labels[adjustment.mode]}.`,evidence:`Reason: ${adjustment.reason}. Return: ${adjustment.returnPace}.`,actionLabel:'Adapt plan',action:{type:'adapt_health',adjustmentId:adjustment.id}})
 }
 const recoverySession=nextEditable(input.week,today,session=>kind(session.category)==='run'||kind(session.category)==='bike')
 if(!adjustment&&load.status==='recover'&&recoverySession)decisions.push({id:`recover:${recoverySession.id}:${today}`,priority:'high',title:`Shorten ${recoverySession.title}`,detail:'Reduce the next endurance session by 20% and keep the effort easy.',evidence:`Recent recovery is ${load.energy??'–'}/5 energy and ${load.soreness??'–'}/5 soreness.`,actionLabel:'Shorten session',action:{type:'shorten_session',sessionId:recoverySession.id,multiplier:.8}})
 else if(!adjustment&&load.status==='watch'){
  const session=nextEditable(input.week,today,item=>item.intensity==='hard'&&(kind(item.category)==='run'||kind(item.category)==='bike'))
  if(session)decisions.push({id:`load:${session.id}:${load.changePct}`,priority:'medium',title:'Hold back on the next hard session',detail:`Shorten ${session.title} by 15% and change it to moderate effort.`,evidence:`Training time is ${load.changePct}% above the previous seven days.`,actionLabel:'Reduce session',action:{type:'shorten_session',sessionId:session.id,multiplier:.85}})
 }
 const recent=input.weeks.filter(week=>week.startDate<input.week.startDate).sort((a,b)=>b.startDate.localeCompare(a.startDate)).slice(0,4)
 const completedRun=recent.map(week=>week.sessions.filter(session=>session.completed&&!session.skipped&&kind(session.category)==='run').reduce((sum,session)=>sum+(session.actualDistanceKm??session.plannedDistanceKm??0),0)).filter(value=>value>0)
 if(input.goals?.weeklyRunKm&&completedRun.length>=2){const baseline=completedRun.reduce((sum,value)=>sum+value,0)/completedRun.length;if(input.goals.weeklyRunKm>baseline*1.2){const suggested=roundHalf(baseline*1.08);decisions.push({id:`target:${input.week.startDate}:${suggested}`,priority:'medium',title:'Bring the running target closer to recent training',detail:`Change the weekly target from ${input.goals.weeklyRunKm} km to ${suggested} km.`,evidence:`Your recent completed average is ${baseline.toFixed(1)} km per week.`,actionLabel:`Use ${suggested} km`,action:{type:'update_run_target',weeklyRunKm:suggested}})}}
 const skipped=input.week.sessions.filter(session=>session.skipped&&session.date<=today)
 if(skipped.length)decisions.push({id:`missed:${input.week.startDate}:${skipped.map(item=>item.id).sort().join('-')}`,priority:'low',title:'Leave missed work behind',detail:`Do not add the ${skipped.length} missed workout${skipped.length===1?'':'s'} to later days. Continue with the next planned session.`,evidence:'Carrying missed volume forward creates an avoidable load spike.',actionLabel:'Keep plan as is',action:{type:'acknowledge'}})
 return decisions
}

export function applyCoachDecision(store:{weeks:TrainingWeek[];goals?:TrainingGoals;healthAdjustment?:HealthAdjustment},weekId:string,decision:CoachDecision){
 let healthAdjustment=store.healthAdjustment,goals=store.goals,weeks=store.weeks
 if(decision.action.type==='adapt_health'&&healthAdjustment?.id===decision.action.adjustmentId){const adjustment=healthAdjustment;weeks=weeks.map(week=>({...week,sessions:week.sessions.map(session=>{if(session.date<adjustment.startDate||session.date>adjustment.endDate||session.completed||session.locked)return session;if(adjustment.mode==='pause')return {...session,skipped:true,completed:false};if(adjustment.mode==='easy')return {...session,intensity:'easy'};if(kind(session.category)==='run'||kind(session.category)==='bike')return {...session,intensity:'easy',plannedDistanceKm:session.plannedDistanceKm?roundHalf(session.plannedDistanceKm*.8):undefined,plannedDurationMinutes:session.plannedDurationMinutes?Math.max(10,Math.round(session.plannedDurationMinutes*.8)):undefined};return {...session,intensity:'easy'}})}));healthAdjustment={...adjustment,appliedAt:new Date().toISOString()}}
 if(decision.action.type==='shorten_session'){const action=decision.action;weeks=weeks.map(week=>week.id!==weekId?week:{...week,sessions:week.sessions.map(session=>session.id!==action.sessionId?session:{...session,intensity:'easy',plannedDistanceKm:session.plannedDistanceKm?roundHalf(session.plannedDistanceKm*action.multiplier):undefined,plannedDurationMinutes:session.plannedDurationMinutes?Math.max(10,Math.round(session.plannedDurationMinutes*action.multiplier)):undefined})})}
 if(decision.action.type==='update_run_target'){const action=decision.action;goals={...(goals??{}),weeklyRunKm:action.weeklyRunKm};weeks=weeks.map(week=>week.id===weekId?{...week,targets:{...(week.targets??goals),weeklyRunKm:action.weeklyRunKm}}:week)}
 return {weeks,goals,healthAdjustment}
}

const pace=(minutes:number,km:number)=>{const totalSeconds=Math.round(minutes/km*60),whole=Math.floor(totalSeconds/60),seconds=totalSeconds%60;return `${whole}:${String(seconds).padStart(2,'0')} min/km`}
const average=(values:number[])=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:undefined
const completionKey=(session:Session)=>session.completedAt??`${session.date}T12:00:00`

export function getLatestWorkoutInsight(week:TrainingWeek,weeks:TrainingWeek[]=[]){
 const all=(weeks.length?weeks:[week]).flatMap(item=>item.sessions),completed=[...week.sessions].filter(item=>item.completed&&!item.skipped).sort((a,b)=>completionKey(b).localeCompare(completionKey(a)))
 const session=completed[0]
 if(!session)return undefined
 const sport=kind(session.category),actualKm=session.actualDistanceKm,plannedKm=session.plannedDistanceKm,actualMinutes=session.actualDurationMinutes,plannedMinutes=session.plannedDurationMinutes,effort=session.perceivedEffort
 const stats=session.activityStats
 const resultParts=[`Completed ${session.title}.`]
 if(actualKm!==undefined)resultParts.push(`${actualKm.toFixed(1)} km${plannedKm!==undefined?` against ${plannedKm.toFixed(1)} km planned`:''}.`)
 if(actualMinutes!==undefined)resultParts.push(`${Math.round(actualMinutes)} minutes${plannedMinutes!==undefined?` against ${plannedMinutes} planned`:''}.`)
 if(effort!==undefined)resultParts.push(`Effort ${effort}/10.`)
 if(stats?.elevationGainM!==undefined)resultParts.push(`${Math.round(stats.elevationGainM)} m elevation.`)
 if(stats?.averagePowerWatts!==undefined)resultParts.push(`${Math.round(stats.averagePowerWatts)} W average power.`)
 if(stats?.averageHeartRate!==undefined)resultParts.push(`${Math.round(stats.averageHeartRate)} bpm average heart rate.`)
 if(sport==='strength'&&session.exercises?.length){const done=session.exercises.filter(item=>item.completed).length;resultParts.push(`${done} of ${session.exercises.length} exercises checked off.`)}
 if(actualKm===undefined&&actualMinutes===undefined&&effort===undefined&&!(sport==='strength'&&session.exercises?.length))resultParts.push('No actual duration, distance or effort was recorded.')
 const comparable=all.filter(item=>item.id!==session.id&&item.completed&&!item.skipped&&item.category===session.category&&completionKey(item)<completionKey(session)).sort((a,b)=>completionKey(b).localeCompare(completionKey(a))).slice(0,3)
 const currentPace=sport==='run'&&actualKm&&actualMinutes?actualMinutes/actualKm:undefined,currentSpeed=sport==='bike'&&actualKm&&actualMinutes?actualKm/(actualMinutes/60):undefined,previousPaces=sport==='run'?comparable.flatMap(item=>item.actualDistanceKm&&item.actualDurationMinutes?[item.actualDurationMinutes/item.actualDistanceKm]:[]):[],previousSpeeds=sport==='bike'?comparable.flatMap(item=>item.actualDistanceKm&&item.actualDurationMinutes?[item.actualDistanceKm/(item.actualDurationMinutes/60)]:[]):[],previousEfforts=comparable.flatMap(item=>item.perceivedEffort!==undefined?[item.perceivedEffort]:[]),previousDistances=comparable.flatMap(item=>item.actualDistanceKm!==undefined?[item.actualDistanceKm]:[])
 const avgPace=average(previousPaces),avgSpeed=average(previousSpeeds),avgEffort=average(previousEfforts),avgDistance=average(previousDistances)
 let comparison='Not enough comparable completed workouts yet to establish a trend.'
 if(sport==='strength'&&comparable.length)comparison=`Compared with ${comparable.length} recent ${session.title} session${comparable.length===1?'':'s'}; exercise weights and completed sets are not yet tracked as actual performance.`
 else if(currentPace!==undefined&&avgPace!==undefined)comparison=`Pace was ${pace(actualMinutes!,actualKm!)} versus ${pace(avgPace,1)} across ${previousPaces.length} recent comparable workout${previousPaces.length===1?'':'s'}${effort!==undefined&&avgEffort!==undefined?`, with effort ${effort}/10 versus ${avgEffort.toFixed(1)}/10`:''}.`
 else if(currentSpeed!==undefined&&avgSpeed!==undefined)comparison=`Average speed was ${currentSpeed.toFixed(1)} km/h versus ${avgSpeed.toFixed(1)} km/h across ${previousSpeeds.length} recent comparable ride${previousSpeeds.length===1?'':'s'}.`
 else if(actualKm!==undefined&&avgDistance!==undefined)comparison=`Distance was ${actualKm.toFixed(1)} km versus a ${avgDistance.toFixed(1)} km average across ${previousDistances.length} recent comparable workout${previousDistances.length===1?'':'s'}.`
 else if(effort!==undefined&&avgEffort!==undefined)comparison=`Effort was ${effort}/10 versus ${avgEffort.toFixed(1)}/10 across ${previousEfforts.length} recent comparable workout${previousEfforts.length===1?'':'s'}.`
 const distanceRatio=actualKm!==undefined&&plannedKm?actualKm/plannedKm:undefined,durationRatio=actualMinutes!==undefined&&plannedMinutes?actualMinutes/plannedMinutes:undefined
 const harderThanUsual=currentPace!==undefined&&avgPace!==undefined&&currentPace>avgPace*1.05&&effort!==undefined&&avgEffort!==undefined&&effort>=avgEffort
 const improving=currentPace!==undefined&&avgPace!==undefined&&currentPace<avgPace*.97&&effort!==undefined&&avgEffort!==undefined&&effort<=avgEffort
 const highEffort=effort!==undefined&&(session.category==='Speed work'?effort>=9:sport==='strength'?effort>=9:effort>=8),underCompleted=(distanceRatio!==undefined&&distanceRatio<.85)||(durationRatio!==undefined&&durationRatio<.8),strain=highEffort||underCompleted||harderThanUsual
 let interpretation=comparable.length===1&&effort===undefined?'Only one comparable workout is available and perceived effort was not recorded, so the difference may reflect intensity rather than improved fitness. Keep the plan unchanged until the pattern repeats.':'This workout is consistent with the current plan and does not provide a reason to change the next session.'
 if(strain)interpretation=underCompleted?'The session was substantially shorter than planned, so the missing work should not be carried into another day.':'The session was harder than intended or harder than comparable workouts, which is a useful fatigue signal.'
 else if(improving)interpretation='You moved faster than recent comparable sessions without reporting more effort. That is a positive trend, but one workout is not enough to increase the plan.'
 else if(distanceRatio!==undefined&&distanceRatio>=.95&&distanceRatio<=1.1&&effort!==undefined&&effort<=6)interpretation='You completed the planned distance at a controlled effort, which supports keeping the current load steady.'
 else if(sport==='strength')interpretation=session.exercises?.length?'Completion is recorded, but meaningful strength progression needs actual sets, reps or weights from comparable sessions.':'Completion alone is not enough to assess strength progress.'
 const next=[...week.sessions].filter(item=>!item.completed&&!item.skipped&&item.date>=session.date).sort((a,b)=>a.date.localeCompare(b.date))[0]
 let nextAction=next?`Continue with ${next.title} as planned.`:'No later workout is scheduled in this week.'
 if(strain&&next)nextAction=kind(next.category)==='run'||kind(next.category)==='bike'?`Keep ${next.title} easy and shorten it if energy or soreness is still poor.`:`Complete ${next.title} conservatively and avoid adding missed volume.`
 else if(improving&&next)nextAction=`Continue with ${next.title} as planned; wait for the trend to repeat before increasing pace or distance.`
 const evidenceCount=[actualKm!==undefined,actualMinutes!==undefined,effort!==undefined,comparable.length>=2].filter(Boolean).length,confidence=evidenceCount>=4?'High':evidenceCount>=2?'Medium':'Low'
 const confidenceReason=confidence==='High'?'distance, duration, effort and comparable history are available':confidence==='Medium'?(comparable.length===1&&effort===undefined?'only one comparable workout is available and perceived effort was not recorded':'some performance context is available, but effort or comparable history is incomplete'):'there is not enough comparable performance data yet'
 const metrics:string[]=[]
 if(actualKm!==undefined)metrics.push(`${actualKm.toFixed(1)} km`)
 if(actualMinutes!==undefined)metrics.push(`${Math.round(actualMinutes)} min`)
 if(sport==='run'&&currentPace!==undefined)metrics.push(pace(actualMinutes!,actualKm!))
 if(sport==='bike'&&currentSpeed!==undefined)metrics.push(`${currentSpeed.toFixed(1)} km/h`)
 if(effort!==undefined)metrics.push(`RPE ${effort}/10`)
 if(stats?.elevationGainM!==undefined)metrics.push(`${Math.round(stats.elevationGainM)} m climb`)
 if(stats?.averagePowerWatts!==undefined)metrics.push(`${Math.round(stats.averagePowerWatts)} W avg`)
 if(stats?.weightedAveragePowerWatts!==undefined)metrics.push(`${Math.round(stats.weightedAveragePowerWatts)} W weighted`)
 if(stats?.averageHeartRate!==undefined)metrics.push(`${Math.round(stats.averageHeartRate)} bpm`)
 if(session.activityTags?.length)metrics.push(...session.activityTags.filter(tag=>tag!=='power recorded').slice(0,2))
 const limited=actualKm===undefined&&actualMinutes===undefined&&effort===undefined&&!(sport==='strength'&&session.exercises?.length),status=limited?'limited':strain?'watch':improving?'progress':'on-track'
 const headline=limited?'Add workout results to unlock a useful review':strain?'This session needs recovery attention':improving?'A positive trend is forming':distanceRatio!==undefined&&distanceRatio>=.95&&distanceRatio<=1.1&&effort!==undefined&&effort<=6?'Completed as planned at controlled effort':'Completed without a required plan change'
 return {sessionId:session.id,title:session.title,date:session.date,result:resultParts.join(' '),comparison,interpretation,nextAction,confidence,confidenceReason,metrics,status,headline,limited,hasComparison:comparable.length>0}
}
export const healthAdjustmentEnd=(startDate:string,days:number)=>plusDays(startDate,Math.max(1,days)-1)





