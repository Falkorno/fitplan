import { useMemo, useState } from 'react'
import { AlertTriangle, ShieldCheck, X } from 'lucide-react'
import { getFatigueWarnings, iso, kind } from './data'
import { getTrainingLoadSummary } from './trainingLoad'
import type { ExternalActivity, Habit, RecoveryEntry, TrainingWeek } from './types'

const parse=(value:string)=>new Date(`${value}T12:00:00`)
const plusDays=(value:string,days:number)=>{const date=parse(value);date.setDate(date.getDate()+days);return iso(date)}

interface WeeklyInsightsProps { week:TrainingWeek; weeks:TrainingWeek[]; habits:Habit[]; activities:ExternalActivity[]; recovery:RecoveryEntry[] }

export function WeeklyInsights(props:WeeklyInsightsProps){
 const [open,setOpen]=useState(false),metrics=useMemo(()=>reviewMetrics(props.week,props.habits),[props.week,props.habits]),load=useMemo(()=>getTrainingLoadSummary(props.activities,props.recovery),[props.activities,props.recovery]),attention=load.status==='watch'||load.status==='recover'
 return <section className={`insights-drawer panel mb-6 ${attention?'has-attention':''}`}><div className="insights-drawer-head"><span className={`insights-status ${attention?'attention':''}`}>{attention?<AlertTriangle size={18}/>:<ShieldCheck size={18}/>}</span><div><p className="eyebrow">WEEKLY INSIGHTS</p><h2 className="section-title">{load.title}</h2><small>{metrics.done} of {metrics.total} workouts · {metrics.minutes} minutes</small></div><button className="secondary insights-open" onClick={()=>setOpen(true)}>View details</button></div>{open&&<div className="modal-bg insights-modal-bg" onMouseDown={event=>event.target===event.currentTarget&&setOpen(false)}><div className="modal insights-modal"><div className="insights-modal-head"><div><p className="eyebrow">WEEKLY INSIGHTS</p><h2 className="section-title">Progress and training load</h2></div><button className="icon-btn" onClick={()=>setOpen(false)} aria-label="Close weekly insights"><X size={18}/></button></div><div className="insights-drawer-body"><WeeklyReview week={props.week} weeks={props.weeks} habits={props.habits}/><FatiguePanel week={props.week} weeks={props.weeks} activities={props.activities} recovery={props.recovery}/></div></div></div>}</section>
}
function reviewMetrics(week:TrainingWeek,habits:Habit[]){
 const workouts=week.sessions.filter(session=>session.category!=='Walk or mobility'&&!session.skipped)
 const done=workouts.filter(session=>session.completed)
 const minutes=done.reduce((sum,session)=>sum+(session.actualDurationMinutes??session.plannedDurationMinutes??0),0)
 const runKm=done.filter(session=>kind(session.category)==='run').reduce((sum,session)=>sum+(session.actualDistanceKm??session.plannedDistanceKm??0),0)
 const bikeKm=done.filter(session=>kind(session.category)==='bike').reduce((sum,session)=>sum+(session.actualDistanceKm??session.plannedDistanceKm??0),0)
 const efforts=done.flatMap(session=>session.perceivedEffort?[session.perceivedEffort]:[])
 const effort=efforts.length?efforts.reduce((sum,value)=>sum+value,0)/efforts.length:0
 const elevationM=done.reduce((sum,session)=>sum+(session.activityStats?.elevationGainM??0),0)
 const ridePowers=done.filter(session=>kind(session.category)==='bike').flatMap(session=>session.activityStats?.averagePowerWatts!==undefined?[session.activityStats.averagePowerWatts]:[])
 const averageRidePower=ridePowers.length?ridePowers.reduce((sum,value)=>sum+value,0)/ridePowers.length:0
 const runHeartRates=done.filter(session=>kind(session.category)==='run').flatMap(session=>session.activityStats?.averageHeartRate!==undefined?[session.activityStats.averageHeartRate]:[])
 const averageRunHeartRate=runHeartRates.length?runHeartRates.reduce((sum,value)=>sum+value,0)/runHeartRates.length:0
 const today=iso(new Date()),weekEnd=plusDays(week.startDate,6),through=today<week.startDate?week.startDate:today>weekEnd?weekEnd:today
 const days=today<week.startDate?0:Math.max(0,Math.round((parse(through).getTime()-parse(week.startDate).getTime())/86400000)+1)
 const habitDone=habits.reduce((sum,habit)=>sum+habit.completedDates.filter(date=>date>=week.startDate&&date<=through).length,0),habitTotal=habits.length*days
 return {done:done.length,total:workouts.length,pct:workouts.length?Math.round(done.length/workouts.length*100):0,minutes,runKm,bikeKm,effort,elevationM,averageRidePower,averageRunHeartRate,habitPct:habitTotal?Math.round(habitDone/habitTotal*100):0,habitDone,habitTotal}
}

function ReviewStat({value,label,detail}:{value:string;label:string;detail?:string}){return <div className="review-stat"><strong>{value}</strong><span>{label}</span>{detail&&<small>{detail}</small>}</div>}

export function WeeklyReview({week,weeks,habits}:{week:TrainingWeek;weeks:TrainingWeek[];habits:Habit[]}){
 const metrics=useMemo(()=>reviewMetrics(week,habits),[week,habits])
 const previous=useMemo(()=>[...weeks].filter(item=>item.startDate<week.startDate).sort((a,b)=>b.startDate.localeCompare(a.startDate))[0],[weeks,week.startDate])
 const before=useMemo(()=>previous?reviewMetrics(previous,habits):null,[previous,habits])
 const delta=(value:number,prior:number,suffix='')=>`${value-prior>0?'+':''}${Math.round((value-prior)*10)/10}${suffix}`
 return <section className="panel review mb-6"><div className="flex flex-wrap items-end justify-between gap-2"><div><p className="eyebrow">REVIEW</p><h2 className="section-title">Weekly review</h2></div><p className="text-xs text-[var(--muted)]">{metrics.done} of {metrics.total} workouts completed</p></div><div className="review-grid"><ReviewStat value={`${metrics.pct}%`} label="Completion"/><ReviewStat value={`${metrics.minutes} min`} label="Training time"/><ReviewStat value={`${metrics.runKm.toFixed(1)} km`} label="Running"/><ReviewStat value={`${metrics.bikeKm.toFixed(1)} km`} label="Cycling"/><ReviewStat value={metrics.effort?metrics.effort.toFixed(1):'—'} label="Average effort"/><ReviewStat value={metrics.elevationM?`${Math.round(metrics.elevationM)} m`:'—'} label="Elevation"/><ReviewStat value={metrics.averageRidePower?`${Math.round(metrics.averageRidePower)} W`:'—'} label="Bike avg power"/><ReviewStat value={metrics.averageRunHeartRate?`${Math.round(metrics.averageRunHeartRate)} bpm`:'—'} label="Run avg heart rate"/><ReviewStat value={`${metrics.habitPct}%`} label="Habit consistency" detail={metrics.habitTotal?`${metrics.habitDone} of ${metrics.habitTotal} check-ins`:'No elapsed days'}/></div><div className="review-compare"><b>{previous?'Compared with previous week':'Your baseline week'}</b>{before?<div><span>{delta(metrics.pct,before.pct,'%')} completion</span><span>{delta(metrics.minutes,before.minutes,' min')} training</span><span>{delta(metrics.runKm,before.runKm,' km')} running</span><span>{delta(metrics.habitPct,before.habitPct,'%')} habits</span></div>:<p>Complete this week to establish your first comparison.</p>}</div></section>
}

export function FatiguePanel({week,weeks,activities,recovery}:{week:TrainingWeek;weeks:TrainingWeek[];activities:ExternalActivity[];recovery:RecoveryEntry[]}){
 const warnings=useMemo(()=>getFatigueWarnings(week,weeks),[week,weeks]),load=useMemo(()=>getTrainingLoadSummary(activities,recovery),[activities,recovery]),attention=warnings.length||load.status==='watch'||load.status==='recover'
 return <section className={`load-panel mb-6 ${attention?'has-warnings':'is-balanced'}`}><div className="load-heading">{attention?<AlertTriangle size={19}/>:<ShieldCheck size={19}/>}<div><p className="eyebrow">TRAINING LOAD</p><h2 className="section-title">{load.title}</h2></div></div><div className="load-metrics"><div><strong>{load.recentMinutes}</strong><span>minutes · last 7 days</span></div><div><strong>{load.runKm.toFixed(1)}</strong><span>run km · last 7 days</span></div><div><strong>{load.changePct===undefined?'—':`${load.changePct>0?'+':''}${load.changePct}%`}</strong><span>vs previous 7 days</span></div><div><strong>{load.energy===undefined?'—':`${load.energy}/5`}</strong><span>average energy</span></div><div><strong>{load.soreness===undefined?'—':`${load.soreness}/5`}</strong><span>average soreness</span></div></div><div className={`load-guidance ${load.status}`}><b>{load.title}</b><p>{load.guidance}</p></div>{warnings.length?<div className="load-warnings">{warnings.map(warning=><article key={warning.id} className={warning.severity}><b>{warning.title}</b><p>{warning.detail}</p></article>)}</div>:<p className="load-ok">No consecutive hard days, concentrated leg stress, or sharp planned running-volume increase detected.</p>}<p className="load-note">Based on imported activity time and your recovery check-ins. Planning guidance only; your schedule is never changed automatically.</p></section>
}
