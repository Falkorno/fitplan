import type { PlannerStore } from './storage'
import type { Session, TrainingWeek } from './types'

export interface PlannerHealth { duplicateWeeks:number;duplicateSessionIds:number;duplicateStravaLinks:number;outOfRangeSessions:number;activeWeekValid:boolean }
const parse=(value:string)=>new Date(value+'T12:00:00')
const iso=(value:Date)=>{const date=new Date(value);date.setMinutes(date.getMinutes()-date.getTimezoneOffset());return date.toISOString().slice(0,10)}
export const weekStartForDate=(value:string)=>{const date=parse(value),day=date.getDay()||7;date.setDate(date.getDate()-day+1);return iso(date)}
export const weekContainsDate=(week:TrainingWeek,date:string)=>week.startDate===weekStartForDate(date)
const sessionScore=(session:Session)=>(session.completed?40:0)+(session.locked?30:0)+(session.stravaActivityId?20:0)+Object.values(session).filter(value=>value!==undefined&&value!==false&&value!=='').length
const weekScore=(week:TrainingWeek,active:string)=>(week.id===active?10000:0)+week.sessions.reduce((sum,session)=>sum+sessionScore(session),0)
const semanticKey=(session:Session)=>`${session.date}|${session.category}|${session.title.trim().replace(/\s+/g,' ').toLowerCase()}`
const isGenerated=(session:Session,id:string)=>session.id==='strava-'+id

export function inspectPlannerStore(store:PlannerStore):PlannerHealth{
 const weekStarts=new Map<string,number>(),sessionIds=new Map<string,number>(),stravaIds=new Map<string,number>()
 let outOfRangeSessions=0
 for(const week of store.weeks){
  weekStarts.set(week.startDate,(weekStarts.get(week.startDate)??0)+1)
  for(const session of week.sessions){sessionIds.set(week.startDate+'|'+session.id,(sessionIds.get(week.startDate+'|'+session.id)??0)+1);if(session.stravaActivityId)stravaIds.set(session.stravaActivityId,(stravaIds.get(session.stravaActivityId)??0)+1);if(!weekContainsDate(week,session.date))outOfRangeSessions++}
 }
 return {duplicateWeeks:[...weekStarts.values()].reduce((sum,count)=>sum+Math.max(0,count-1),0),duplicateSessionIds:[...sessionIds.values()].reduce((sum,count)=>sum+Math.max(0,count-1),0),duplicateStravaLinks:[...stravaIds.values()].reduce((sum,count)=>sum+Math.max(0,count-1),0),outOfRangeSessions,activeWeekValid:store.weeks.some(week=>week.id===store.active)}
}

export function canonicalWeekForStart(weeks:TrainingWeek[],startDate:string,preferredId?:string):TrainingWeek|undefined{return weeks.filter(week=>week.startDate===startDate).sort((a,b)=>weekScore(b,preferredId??'')-weekScore(a,preferredId??''))[0]}

export function repairPlannerStore(store:PlannerStore,referenceStart=weekStartForDate(iso(new Date()))):PlannerStore{
 store={...store,weeks:store.weeks.map(week=>({...week,sessions:week.sessions.filter(session=>session.category!=='Rest')}))}
 if(!store.weeks.length)return store
 const today=referenceStart,past=store.weeks.filter(week=>week.startDate<today),mutable=store.weeks.filter(week=>week.startDate>=today)
 if(past.length){
  if(!mutable.length)return store
  const mutableActive=mutable.some(week=>week.id===store.active)?store.active:mutable[0].id,repaired=repairPlannerStore({...store,weeks:mutable,active:mutableActive},referenceStart)
  return {...repaired,weeks:[...past,...repaired.weeks].sort((a,b)=>a.startDate.localeCompare(b.startDate)),active:store.weeks.some(week=>week.id===store.active)?store.active:repaired.active}
 }
 const activeSource=store.weeks.find(week=>week.id===store.active),activeStart=activeSource?.startDate,starts=new Set(store.weeks.map(week=>week.startDate))
 for(const week of store.weeks)if(!week.archivedAt)for(const session of week.sessions)starts.add(weekStartForDate(session.date))
 const output=new Map<string,TrainingWeek>()
 for(const start of starts){const source=canonicalWeekForStart(store.weeks,start,store.active);output.set(start,source?{...source,sessions:source.archivedAt?source.sessions.map(session=>({...session})):[]}:{id:'recovered-'+start,startDate:start,createdAt:new Date().toISOString(),sessions:[]})}
 const addRaw=(target:TrainingWeek,incoming:Session)=>{let session={...incoming};if(target.sessions.some(item=>item.id===session.id)){let suffix=2;while(target.sessions.some(item=>item.id===session.id+'-'+suffix))suffix++;session.id=session.id+'-'+suffix}target.sessions.push(session)}
 const mergeSecondary=(target:TrainingWeek,incoming:Session)=>{
  const stravaIndex=incoming.stravaActivityId?target.sessions.findIndex(item=>item.stravaActivityId===incoming.stravaActivityId):-1
  const match=stravaIndex>=0?stravaIndex:target.sessions.findIndex(item=>(item.id===incoming.id&&item.date===incoming.date)||((!item.stravaActivityId||!incoming.stravaActivityId||item.stravaActivityId===incoming.stravaActivityId)&&semanticKey(item)===semanticKey(incoming)))
  if(match<0){addRaw(target,incoming);return}
  const existing=target.sessions[match],id=incoming.stravaActivityId
  if(id&&isGenerated(existing,id)&&!isGenerated(incoming,id)){target.sessions[match]={...incoming};return}
  if(sessionScore(incoming)>sessionScore(existing))target.sessions[match]={...incoming}
 }
 for(const start of [...starts].sort()){
  const group=store.weeks.filter(week=>week.startDate===start),canonical=canonicalWeekForStart(group,start,store.active)
  if(!canonical)continue
  if(canonical.archivedAt)continue
  for(const session of canonical.sessions){const target=output.get(weekStartForDate(session.date));if(target)mergeSecondary(target,session)}
  for(const source of group)if(source!==canonical)for(const session of source.sessions){const target=output.get(weekStartForDate(session.date));if(target)mergeSecondary(target,session)}
 }
 const links=new Map<string,{week:TrainingWeek;session:Session}[]>()
 for(const week of output.values())if(!week.archivedAt)for(const session of week.sessions)if(session.stravaActivityId){const values=links.get(session.stravaActivityId)??[];values.push({week,session});links.set(session.stravaActivityId,values)}
 for(const [id,values] of links)if(values.length>1){const keep=[...values].sort((a,b)=>Number(isGenerated(a.session,id))-Number(isGenerated(b.session,id))||sessionScore(b.session)-sessionScore(a.session))[0];for(const value of values)if(value!==keep){if(isGenerated(value.session,id))value.week.sessions=value.week.sessions.filter(session=>session!==value.session);else value.session.stravaActivityId=undefined}}

 for(const week of output.values())if(!week.archivedAt)week.sessions.sort((a,b)=>a.date.localeCompare(b.date)||a.title.localeCompare(b.title))

 const weeks=[...output.values()].sort((a,b)=>a.startDate.localeCompare(b.startDate)),active=activeStart?output.get(activeStart)?.id:undefined
 return {...store,weeks,active:active??weeks[0].id}
}