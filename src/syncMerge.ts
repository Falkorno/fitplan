import { dedupeHabits, type PlannerStore } from './storage'
import type { TrainingWeek } from './types'

const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b)
const choose=<T>(base:T|undefined,local:T|undefined,remote:T|undefined):T|undefined=>{
 // On the first connection there is no shared baseline. Prefer the existing
 // cloud value for conflicts so a freshly generated device store cannot erase
 // established plans or habit completion history. Collection-only local items
 // are still retained by mergeBy.
 if(base===undefined&&!same(local,remote))return remote??local
 return same(local,base)?remote:same(remote,base)?local:same(local,remote)?local:local??remote
}
const mergeObject=<T extends object>(base:T|undefined,local:T,remote:T):T=>{
 const output:Record<string,unknown>={}
 for(const key of new Set([...Object.keys(base??{}),...Object.keys(local),...Object.keys(remote)]))output[key]=choose((base as any)?.[key],(local as any)[key],(remote as any)[key])
 return output as T
}
const mergeBy=<T>(base:T[]|undefined,local:T[]|undefined,remote:T[]|undefined,key:(item:T)=>string,merge?:(base:T|undefined,local:T,remote:T)=>T):T[]=>{
 const b=new Map((base??[]).map(item=>[key(item),item])),l=new Map((local??[]).map(item=>[key(item),item])),r=new Map((remote??[]).map(item=>[key(item),item])),result:T[]=[]
 for(const id of new Set([...b.keys(),...l.keys(),...r.keys()])){
  const before=b.get(id),left=l.get(id),right=r.get(id)
  if(left&&right)result.push(merge?merge(before,left,right):(choose(before,left,right) as T))
  else if(left&&!right){if(!before||!same(left,before))result.push(left)}
  else if(right&&!left){if(!before||!same(right,before))result.push(right)}
 }
 return result
}
const mergeWeek=(base:TrainingWeek|undefined,local:TrainingWeek,remote:TrainingWeek):TrainingWeek=>{
 const localArchive=local.archivedAt??'',remoteArchive=remote.archivedAt??''
 const localReplacement=local.replacedAt??'',remoteReplacement=remote.replacedAt??''
 if(localReplacement!==remoteReplacement)return localReplacement>remoteReplacement?local:remote
 if(localArchive||remoteArchive){
  if(localArchive!==remoteArchive)return localArchive>remoteArchive?local:remote
  return local
 }
 return {...mergeObject(base,local,remote),sessions:mergeBy(base?.sessions,local.sessions,remote.sessions,item=>item.id,(before,left,right)=>mergeObject(before,left,right))}
}

export function mergePlannerStores(base:PlannerStore|null,local:PlannerStore,remote:PlannerStore):PlannerStore{
 const merged=mergeObject(base??undefined,local,remote)
 merged.weeks=mergeBy(base?.weeks,local.weeks,remote.weeks,item=>item.id,mergeWeek).sort((a,b)=>a.startDate.localeCompare(b.startDate))
 merged.habits=dedupeHabits(mergeBy(base?.habits,local.habits,remote.habits,item=>item.id,(before,left,right)=>mergeObject(before,left,right)))
 merged.recovery=mergeBy(base?.recovery,local.recovery,remote.recovery,item=>item.date,(before,left,right)=>mergeObject(before,left,right))
 merged.externalActivities=mergeBy(base?.externalActivities,local.externalActivities,remote.externalActivities,item=>item.id,(before,left,right)=>mergeObject(before,left,right))
 merged.customWorkouts=mergeBy(base?.customWorkouts,local.customWorkouts,remote.customWorkouts,item=>item.name.toLowerCase(),(before,left,right)=>mergeObject(before,left,right))
 if(!merged.weeks.some(week=>week.id===merged.active))merged.active=remote.weeks.some(week=>week.id===remote.active)?remote.active:merged.weeks[0]?.id
 return merged
}
