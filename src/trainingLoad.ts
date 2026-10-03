import type { ExternalActivity, RecoveryEntry } from './types'

export type LoadStatus='baseline'|'balanced'|'watch'|'recover'
export interface TrainingLoadSummary { recentMinutes:number; previousMinutes:number; runKm:number; changePct?:number; energy?:number; soreness?:number; status:LoadStatus; title:string; guidance:string }

const shiftDate=(value:string,days:number)=>{const date=new Date(`${value}T12:00:00`);date.setDate(date.getDate()+days);return date.toISOString().slice(0,10)}
const average=(values:number[])=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:undefined

export function getTrainingLoadSummary(activities:ExternalActivity[],recovery:RecoveryEntry[],today=new Date().toISOString().slice(0,10)):TrainingLoadSummary{
 const recentStart=shiftDate(today,-6),previousStart=shiftDate(today,-13),previousEnd=shiftDate(today,-7)
 const recent=activities.filter(activity=>activity.date>=recentStart&&activity.date<=today)
 const previous=activities.filter(activity=>activity.date>=previousStart&&activity.date<=previousEnd)
 const recentMinutes=Math.round(recent.reduce((sum,activity)=>sum+activity.durationSeconds/60,0))
 const previousMinutes=Math.round(previous.reduce((sum,activity)=>sum+activity.durationSeconds/60,0))
 const runKm=Math.round(recent.filter(activity=>activity.type==='run').reduce((sum,activity)=>sum+activity.distanceKm,0)*10)/10
 const changePct=previousMinutes>=30?Math.round((recentMinutes-previousMinutes)/previousMinutes*100):undefined
 const checkIns=recovery.filter(entry=>entry.date>=recentStart&&entry.date<=today)
 const energy=average(checkIns.map(entry=>entry.energy)),soreness=average(checkIns.map(entry=>entry.soreness))
 const rounded={energy:energy===undefined?undefined:Math.round(energy*10)/10,soreness:soreness===undefined?undefined:Math.round(soreness*10)/10}
 if((energy!==undefined&&energy<=2)||(soreness!==undefined&&soreness>=4))return {recentMinutes,previousMinutes,runKm,changePct,...rounded,status:'recover',title:'Prioritise recovery',guidance:'Your recent check-ins show low energy or high soreness. Keep the next session easy, shorten it if needed, or take a rest day.'}
 if(changePct!==undefined&&changePct>25)return {recentMinutes,previousMinutes,runKm,changePct,...rounded,status:'watch',title:'Load has risen quickly',guidance:`Training time is ${changePct}% above the previous seven days. Avoid adding more intensity until energy and soreness remain steady.`}
 if(!recent.length&&!checkIns.length)return {recentMinutes,previousMinutes,runKm,changePct,...rounded,status:'baseline',title:'Build your baseline',guidance:'Complete or import activities and add recovery check-ins to unlock useful seven-day guidance.'}
 return {recentMinutes,previousMinutes,runKm,changePct,...rounded,status:'balanced',title:'Load looks manageable',guidance:'Your recent load and recovery signals look steady. Continue as planned and use your next check-in to catch any change.'}
}