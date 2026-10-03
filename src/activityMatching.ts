import { kind } from './data'
import { classifyStravaActivity } from './activityClassification'
import type { ActivityStats, Category, ExternalActivity, Intensity, Session, TrainingWeek } from './types'

const sportMatches=(activity:ExternalActivity,session:Session)=>activity.type==='run'?kind(session.category)==='run':activity.type==='cycle'?kind(session.category)==='bike':session.category==='Walk or mobility'
const score=(activity:ExternalActivity,session:Session)=>{
 const activityMinutes=activity.durationSeconds/60
 const distance=session.plannedDistanceKm?Math.abs(activity.distanceKm-session.plannedDistanceKm)/Math.max(session.plannedDistanceKm,1):.35
 const duration=session.plannedDurationMinutes?Math.abs(activityMinutes-session.plannedDurationMinutes)/Math.max(session.plannedDurationMinutes,1):.2
 return distance+duration+(session.completed?.15:0)
}
const tagsFor=(activity:ExternalActivity)=>activity.activityTags?.length?activity.activityTags:classifyStravaActivity(activity)
const categoryFor=(activity:ExternalActivity):Category=>activity.type==='run'?(tagsFor(activity).includes('quality')||tagsFor(activity).includes('race')?'Speed work':tagsFor(activity).includes('long')?'Long run':'Easy run'):activity.type==='cycle'?'Indoor bike':'Walk or mobility'
const intensityFor=(activity:ExternalActivity):Intensity=>tagsFor(activity).some(tag=>tag==='quality'||tag==='race')?'hard':tagsFor(activity).includes('hilly')?'moderate':'easy'
const statsFor=(activity:ExternalActivity):ActivityStats=>Object.fromEntries(Object.entries({elevationGainM:activity.elevationGainM,averagePowerWatts:activity.averagePowerWatts,weightedAveragePowerWatts:activity.weightedAveragePowerWatts,maxPowerWatts:activity.maxPowerWatts,averageHeartRate:activity.averageHeartRate,maxHeartRate:activity.maxHeartRate,averageCadence:activity.averageCadence,averageSpeedKph:activity.averageSpeedKph,calories:activity.calories,kilojoules:activity.kilojoules}).filter(([,value])=>value!==undefined))
const generatedId=(activity:ExternalActivity)=>`strava-${activity.id}`
const inWeek=(date:string,week:TrainingWeek)=>{
 const end=new Date(`${week.startDate}T12:00:00`)
 end.setDate(end.getDate()+6)
 const endDate=end.toISOString().slice(0,10)
 return date>=week.startDate&&date<=endDate
}
const sameSession=(a:Session,b:Session)=>JSON.stringify(a)===JSON.stringify(b)
const duplicateKey=(session:Session)=>session.stravaActivityId?`strava|${session.stravaActivityId}|${session.date}`:`plan|${session.date}|${session.category}|${session.title.trim().replace(/\s+/g,' ').toLowerCase()}`
export function dedupeWeekSessions(sessions:Session[]):Session[]{const result:Session[]=[],indexes=new Map<string,number>();for(const session of sessions){const key=duplicateKey(session),existing=indexes.get(key);if(existing===undefined){indexes.set(key,result.length);result.push(session);continue}const current=result[existing],currentScore=(!current.id.startsWith('strava-')?8:0)+(current.completed?4:0)+(current.locked?2:0)+(current.stravaActivityId?1:0),incomingScore=(!session.id.startsWith('strava-')?8:0)+(session.completed?4:0)+(session.locked?2:0)+(session.stravaActivityId?1:0);if(incomingScore>currentScore)result[existing]=session}return result}

export function findActivityMatch(activity:ExternalActivity,weeks:TrainingWeek[],preferredWeekId?:string):Session|undefined{
 return weeks.flatMap(week=>week.sessions.map(session=>({session,preferred:week.id===preferredWeekId}))).filter(({session})=>session.date===activity.date&&!session.stravaActivityId&&sportMatches(activity,session)).sort((a,b)=>Number(b.preferred)-Number(a.preferred)||score(activity,a.session)-score(activity,b.session))[0]?.session
}

export function applyActivityMatch(session:Session,activity:ExternalActivity):Session{
 const duration=Math.round(activity.durationSeconds/60),distance=Math.round(activity.distanceKm*100)/100
 return {...session,title:activity.title,completed:true,skipped:false,completedAt:session.completedAt??new Date().toISOString(),plannedDurationMinutes:duration||session.plannedDurationMinutes,plannedDistanceKm:distance||session.plannedDistanceKm,actualDurationMinutes:duration,actualDistanceKm:distance,stravaActivityId:activity.id,stravaTitle:activity.title,activityTags:tagsFor(activity),activityStats:statsFor(activity)}
}

export function refreshLinkedActivities(weeks:TrainingWeek[],activities:ExternalActivity[]):TrainingWeek[]{
 const byId=new Map(activities.map(activity=>[activity.id,activity]))
 return weeks.map(week=>{let changed=false;const sessions=week.sessions.map(session=>{const activity=session.stravaActivityId?byId.get(session.stravaActivityId):undefined;if(!activity||session.date!==activity.date||!sportMatches(activity,session))return session;const refreshed=applyActivityMatch(session,activity);if(sameSession(session,refreshed))return session;changed=true;return refreshed});return changed?{...week,sessions}:week})
}

export function createActivitySession(activity:ExternalActivity):Session{
 const minutes=Math.round(activity.durationSeconds/60),distance=Math.round(activity.distanceKm*100)/100
 return {id:generatedId(activity),date:activity.date,category:categoryFor(activity),title:activity.title,plannedDurationMinutes:minutes||undefined,plannedDistanceKm:distance||undefined,intensity:intensityFor(activity),completed:true,skipped:false,completedAt:new Date().toISOString(),actualDurationMinutes:minutes,actualDistanceKm:distance,stravaActivityId:activity.id,stravaTitle:activity.title,activityTags:tagsFor(activity),activityStats:statsFor(activity)}
}

export function matchActivitiesToWeeks(weeks:TrainingWeek[],activities:ExternalActivity[],preferredWeekId?:string):{weeks:TrainingWeek[];matched:number;added:number;updated:number}{
 let next=weeks.map(week=>week.id===preferredWeekId?{...week,sessions:dedupeWeekSessions(week.sessions)}:week),matched=0,added=0,updated=next.some((week,index)=>week.sessions.length!==weeks[index].sessions.length)?1:0
 const preferredWeek=preferredWeekId?weeks.find(week=>week.id===preferredWeekId):undefined,relevantStarts=new Set(preferredWeek?[preferredWeek.startDate]:weeks.map(week=>week.startDate)),activityWeekStart=(date:string)=>{const value=new Date(date+'T12:00:00'),day=value.getDay()||7;value.setDate(value.getDate()-day+1);return value.toISOString().slice(0,10)}
 for(const activity of activities.filter(activity=>relevantStarts.has(activityWeekStart(activity.date))).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id))){
  let changed=false
  next=next.map(week=>({...week,sessions:week.sessions.map(session=>{
   if(session.stravaActivityId!==activity.id||(session.date===activity.date&&sportMatches(activity,session)))return session
   changed=true
   return {...session,stravaActivityId:undefined}
  })}))
  if(changed)updated++

  const preferred=preferredWeekId?next.find(week=>week.id===preferredWeekId):undefined
  const validLinks=next.flatMap(week=>week.sessions.map(session=>({week,session}))).filter(({session})=>session.stravaActivityId===activity.id&&session.date===activity.date&&sportMatches(activity,session)).sort((a,b)=>Number(b.week.id===preferredWeekId)-Number(a.week.id===preferredWeekId)||Number(a.session.id===generatedId(activity))-Number(b.session.id===generatedId(activity)))
  let linked=validLinks[0]
  if(linked&&validLinks.length>1){
   const duplicates=new Set(validLinks.slice(1).map(item=>item.session))
   next=next.map(week=>({...week,sessions:week.sessions.flatMap(session=>!duplicates.has(session)?[session]:session.id===generatedId(activity)?[]:[{...session,stravaActivityId:undefined}])}))
   updated++
  }
  const preferredTarget=preferred&&inWeek(activity.date,preferred)?findActivityMatch(activity,[preferred],preferredWeekId):undefined
  if(linked&&preferred&&inWeek(activity.date,preferred)&&linked.week.id!==preferredWeekId){
   next=next.map(week=>{
    if(week.id===linked!.week.id){
     const sessions=week.sessions.flatMap(session=>session===linked!.session?(session.id===generatedId(activity)?[]:[{...session,stravaActivityId:undefined}]):[session])
     return {...week,sessions}
    }
    if(week.id===preferredWeekId){
     const sessions=week.sessions.filter(session=>session.id!==generatedId(activity))
     return {...week,sessions:preferredTarget?sessions.map(session=>session===preferredTarget?applyActivityMatch(session,activity):session):[...sessions,createActivitySession(activity)]}
    }
    return week
   })
   matched++
   if(!preferredTarget)added++
   continue
  }
  if(linked){
   const refreshed=applyActivityMatch(linked.session,activity)
   if(linked.session.id===generatedId(activity))Object.assign(refreshed,{title:activity.title,category:categoryFor(activity),intensity:intensityFor(activity),plannedDurationMinutes:refreshed.actualDurationMinutes,plannedDistanceKm:refreshed.actualDistanceKm})
   if(!sameSession(linked.session,refreshed)){
    next=next.map(week=>week.id===linked.week.id?{...week,sessions:week.sessions.map(session=>session===linked.session?refreshed:session)}:week)
    updated++
   }
   continue
  }

  const target=preferredTarget??findActivityMatch(activity,next,preferredWeekId)
  if(target){
   next=next.map(week=>week.sessions.includes(target)?{...week,sessions:week.sessions.map(session=>session===target?applyActivityMatch(session,activity):session)}:week)
   matched++
   continue
  }

  const targetWeek=(preferred&&inWeek(activity.date,preferred)?preferred:undefined)??next.find(week=>inWeek(activity.date,week))
  if(!targetWeek)continue
  const created=createActivitySession(activity)
  next=next.map(week=>week.id===targetWeek.id?{...week,sessions:[...week.sessions,created]}:week)
  added++
 }
 return {weeks:next,matched:matched+added+updated,added,updated}
}
