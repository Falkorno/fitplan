import { kind } from './data'
import type { RecoveryEntry, TrainingGoals, TrainingWeek } from './types'
import type { TrainingWeekSummary } from './aiPlanner'

export type BlockPhase='foundation'|'build'|'peak'|'consolidate'
export interface LocalLoadDecision { week:TrainingWeek; phase:BlockPhase; runMultiplier:number; cycleMultiplier:number; reasons:string[] }

const phaseFor=(startDate:string):BlockPhase=>{
 const epoch=Date.parse('2026-01-05T12:00:00Z'),week=Math.round((Date.parse(startDate+'T12:00:00Z')-epoch)/604800000)
 return (['foundation','build','peak','consolidate'] as const)[((week%4)+4)%4]
}
const weightedAverage=(values:number[])=>{const usable=values.filter(value=>value>0);if(!usable.length)return 0;const weights=[4,3,2,1].slice(0,usable.length);return usable.reduce((sum,value,index)=>sum+value*weights[index],0)/weights.reduce((sum,value)=>sum+value,0)}
const scaleDistances=(week:TrainingWeek,type:'run'|'bike',multiplier:number)=>({...week,sessions:week.sessions.map(session=>kind(session.category)===type&&!session.completed&&!session.locked&&session.plannedDistanceKm?{...session,plannedDistanceKm:Math.round(session.plannedDistanceKm*multiplier*10)/10}:session)})

export function applyLocalLoadGuard(draft:TrainingWeek,history:TrainingWeekSummary[],recovery:RecoveryEntry[]=[],goals?:TrainingGoals):LocalLoadDecision{
 const phase=phaseFor(draft.startDate),recent=history.slice(0,4),reasons:string[]=[]
 const adherence=recent.length?weightedAverage(recent.map(item=>item.adherencePercent))/100:1
 const runBaseline=weightedAverage(recent.map(item=>item.completedRunKm)),cycleBaseline=weightedAverage(recent.map(item=>item.completedCycleKm))
 const planned=(type:'run'|'bike')=>draft.sessions.filter(session=>kind(session.category)===type).reduce((sum,session)=>sum+(session.plannedDistanceKm??0),0)
 const phaseCap={foundation:1,build:1.05,peak:1.08,consolidate:.88}[phase]
 const recentRecovery=recovery.slice(-7),lowRecovery=recentRecovery.length>=2&&(recentRecovery.reduce((sum,item)=>sum+item.energy,0)/recentRecovery.length<2.5||recentRecovery.reduce((sum,item)=>sum+item.soreness,0)/recentRecovery.length>3.5)
 let readiness=adherence<.65?.85:adherence<.8?.93:1
 if(lowRecovery)readiness=Math.min(readiness,.9)
 const multiplier=(baseline:number,target:number)=>baseline>=5&&target>0?Math.min(1,Math.max(.8,baseline*phaseCap*readiness/target)):1
 const suggestedRun=multiplier(runBaseline,planned('run')),suggestedCycle=multiplier(cycleBaseline,planned('bike'))
 const runMultiplier=goals?.weeklyRunKm!==undefined?1:suggestedRun,cycleMultiplier=goals?.weeklyCycleKm!==undefined?1:suggestedCycle
 if(phase==='consolidate')reasons.push('This is the consolidation week in the four-week block, so recent sustainable load takes priority over progression.')
 else reasons.push(`This is the ${phase} week in the four-week training block.`)
 if(adherence<.8)reasons.push(`Recent weighted adherence was ${Math.round(adherence*100)}%, so unfinished training was not carried forward.`)
 if(lowRecovery)reasons.push('Recent energy or soreness entries reduced the local load ceiling.')
 if(goals?.weeklyRunKm!==undefined&&suggestedRun<.995)reasons.push('The running target was retained as entered; recent load suggests treating it cautiously rather than silently reducing it.')
 else if(runMultiplier<.995)reasons.push(`Running was capped at ${Math.round(runMultiplier*100)}% of the requested draft using completed-volume history.`)
 if(goals?.weeklyCycleKm!==undefined&&suggestedCycle<.995)reasons.push('The cycling target was retained as entered; recent load suggests treating it cautiously rather than silently reducing it.')
 else if(cycleMultiplier<.995)reasons.push(`Cycling was capped at ${Math.round(cycleMultiplier*100)}% of the requested draft using completed-volume history.`)
 let week=scaleDistances(draft,'run',runMultiplier);week=scaleDistances(week,'bike',cycleMultiplier)
 week={...week,generationExplanation:[...reasons,...(week.generationExplanation??[])]}
 return {week,phase,runMultiplier,cycleMultiplier,reasons}
}
