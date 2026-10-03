import type { AiReviewCacheEntry, ExternalActivity, Habit, HealthAdjustment, NotificationPrefs, RecoveryEntry, TrainingGoals, TrainingWeek } from './types'
import type { WorkoutPreset } from './presets'

export type AppTheme='light'|'dark'|'leaf'
export interface PlannerStore { weeks:TrainingWeek[]; active:string; dark:boolean; theme?:AppTheme; syncProtocolVersion?:number; habits:Habit[]; goals?:TrainingGoals; recovery?:RecoveryEntry[]; notifications?:NotificationPrefs; externalActivities?:ExternalActivity[]; activitiesSyncedAt?:string; customWorkouts?:WorkoutPreset[]; healthAdjustment?:HealthAdjustment; dismissedCoachDecisionIds?:string[]; aiReviewCache?:Record<string,AiReviewCacheEntry> }

const invalidLegacyValue=(value:unknown)=>value===null||value===undefined||(typeof value==='string'&&['undefined','<undefined>','null','nan'].includes(value.trim().toLowerCase()))
const metricKeys=['plannedDurationMinutes','plannedDistanceKm','actualDurationMinutes','actualDistanceKm','perceivedEffort'] as const
export function sanitizePlannerStore(value:PlannerStore):PlannerStore{const weeks=value.weeks.map(week=>({...week,sessions:week.sessions.map(source=>{const session={...source};for(const key of metricKeys){const metric=session[key];if(invalidLegacyValue(metric)||typeof metric!=='number'||!Number.isFinite(metric))delete session[key]}if(invalidLegacyValue(session.stravaActivityId))delete session.stravaActivityId;if(invalidLegacyValue(session.notes))delete session.notes;if(invalidLegacyValue(session.title)||!String(session.title).trim())session.title=session.category;return session})}));return {...value,weeks,theme:value.theme??(value.dark?'dark':'light'),syncProtocolVersion:2}}
export function createDefaultHabits():Habit[]{return [
 {id:'habit-running',name:'Running',color:'#14b8a6',completedDates:[]},
 {id:'habit-cycling',name:'Cycling',color:'#3b82f6',completedDates:[]},
 {id:'habit-strength',name:'Strength',color:'#8b5cf6',completedDates:[]},
]}

export function dedupeHabits(habits:Habit[]):Habit[]{
 const result:Habit[]=[],byName=new Map<string,Habit>()
 for(const habit of habits){
  const key=habit.name.trim().replace(/\s+/g,' ').toLowerCase(),existing=byName.get(key)
  if(existing){existing.completedDates=[...new Set([...existing.completedDates,...habit.completedDates])].sort();continue}
  const clean={...habit,name:habit.name.trim().replace(/\s+/g,' '),completedDates:[...new Set(habit.completedDates)].sort()}
  byName.set(key,clean);result.push(clean)
 }
 return result
}

const DB_NAME='stride-training-planner'
const STORE_NAME='planner-data'
const RECORD_KEY='current'
export const LEGACY_KEY='stride-training-planner-v1'

function openDb():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(DB_NAME,1)
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE_NAME))request.result.createObjectStore(STORE_NAME)}
  request.onsuccess=()=>resolve(request.result)
  request.onerror=()=>reject(request.error)
 })
}

export async function readStore():Promise<PlannerStore|null>{
 try{
  const db=await openDb()
  const value=await new Promise<PlannerStore|undefined>((resolve,reject)=>{const tx=db.transaction(STORE_NAME,'readonly');const request=tx.objectStore(STORE_NAME).get(RECORD_KEY);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})
  db.close()
  if(value)return value
  const legacy=localStorage.getItem(LEGACY_KEY)
  if(legacy){const parsed=JSON.parse(legacy) as PlannerStore;await writeStore(parsed);localStorage.removeItem(LEGACY_KEY);return parsed}
 }catch(error){console.warn('Could not read planner data',error)}
 return null
}

export async function writeStore(value:PlannerStore):Promise<void>{
 const db=await openDb()
 await new Promise<void>((resolve,reject)=>{const tx=db.transaction(STORE_NAME,'readwrite');tx.objectStore(STORE_NAME).put(value,RECORD_KEY);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})
 db.close()
}

export async function clearStore():Promise<void>{
 const db=await openDb()
 await new Promise<void>((resolve,reject)=>{const tx=db.transaction(STORE_NAME,'readwrite');tx.objectStore(STORE_NAME).clear();tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})
 db.close()
}

export function validateBackup(value:unknown):PlannerStore{
 if(!value||typeof value!=='object')throw new Error('This is not a Stride backup.')
 const candidate=value as Partial<PlannerStore>
 if(!Array.isArray(candidate.weeks)||!candidate.weeks.length||typeof candidate.active!=='string')throw new Error('The backup is missing its training history.')
 for(const week of candidate.weeks){if(!week||typeof week.id!=='string'||typeof week.startDate!=='string'||!Array.isArray(week.sessions))throw new Error('The backup contains an invalid week.');for(const session of week.sessions){if(!session||typeof session.id!=='string'||typeof session.date!=='string'||typeof session.category!=='string')throw new Error('The backup contains an invalid session.')}}
 if(!candidate.weeks.some(w=>w.id===candidate.active))throw new Error('The backup has no active week.')
 return sanitizePlannerStore({weeks:candidate.weeks,active:candidate.active,dark:Boolean(candidate.dark),theme:candidate.theme==='leaf'||candidate.theme==='dark'||candidate.theme==='light'?candidate.theme:(candidate.dark?'dark':'light'),habits:dedupeHabits(Array.isArray(candidate.habits)?candidate.habits:createDefaultHabits()),goals:candidate.goals??{},recovery:Array.isArray(candidate.recovery)?candidate.recovery:[],notifications:candidate.notifications??{enabled:false,time:'08:00',workout:true,habits:true,weeklyReview:true},externalActivities:Array.isArray(candidate.externalActivities)?candidate.externalActivities:[],activitiesSyncedAt:candidate.activitiesSyncedAt,customWorkouts:Array.isArray(candidate.customWorkouts)?candidate.customWorkouts:[],healthAdjustment:candidate.healthAdjustment,dismissedCoachDecisionIds:Array.isArray(candidate.dismissedCoachDecisionIds)?candidate.dismissedCoachDecisionIds:[],aiReviewCache:candidate.aiReviewCache??{}}) 
}

