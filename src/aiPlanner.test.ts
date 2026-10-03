import { describe,expect,it } from 'vitest'
import { applyAiWeekReview,summarizeTrainingHistory,validateAiWeek,type AiWeekReview } from './aiPlanner'
import { makeWfhWeek } from './data'

const draft=()=>makeWfhWeek(new Date('2026-08-24T12:00:00'),[1,3],false)
const review=(week= draft()):AiWeekReview=>({trainingSummary:'Completion was consistent.',weeklyFocus:'Keep easy work easy.',runDistanceMultiplier:.9,cycleDistanceMultiplier:.95,scheduleObservations:['Runs are spaced around the weekend long run.'],targetFeedback:['Targets are achievable.'],availabilityTip:'Use the weekend for the longest session.'})

describe('adaptive AI week validation',()=>{
 it('summarizes the latest four weeks in compact trend metrics',()=>{
  const starts=['2026-07-20','2026-07-27','2026-08-03','2026-08-10','2026-08-17'],weeks=starts.map(value=>{const week=makeWfhWeek(new Date(value+'T12:00:00'),[1,3]);return {...week,sessions:week.sessions.map(session=>({...session,completed:true}))}})
  const history=summarizeTrainingHistory(weeks,'2026-08-24')
  expect(history).toHaveLength(4);expect(history.map(item=>item.startDate)).toEqual(['2026-08-17','2026-08-10','2026-08-03','2026-07-27'])
  expect(history[0]).toMatchObject({adherencePercent:100,plannedRunKm:22,completedRunKm:22,completedCycleKm:55,longestRunKm:8,hardSessions:2,completedStrengthSessions:5,wfhDays:[1,3]})
 })
 it('accepts a valid constrained plan and safely scales load',()=>{const week=draft(),value={...review(week),reviewModel:'gpt-5.6-luna',cached:true},result=applyAiWeekReview(week,value);expect(validateAiWeek(result)).toEqual([]);expect(result.generationExplanation?.[0]).toContain('luna, cached');const originalRun=week.sessions.find(session=>session.category==='Easy run')!,adapted=result.sessions.find(session=>session.id===originalRun.id)!;expect(adapted.plannedDistanceKm).toBe(Math.round(originalRun.plannedDistanceKm!*.9*10)/10);const originalRide=week.sessions.find(session=>session.category==='Indoor bike')!,adaptedRide=result.sessions.find(session=>session.id===originalRide.id)!;expect(adaptedRide.plannedDistanceKm).toBe(Math.round(originalRide.plannedDistanceKm!*.95*10)/10)})
 it('keeps every locally scheduled workout on its original date',()=>{const week=draft(),dates=new Map(week.sessions.map(session=>[session.id,session.date])),result=applyAiWeekReview(week,review(week));expect(result.sessions.every(session=>session.date===dates.get(session.id))).toBe(true)})
 it('rejects load changes outside the safe range',()=>{const week=draft(),value=review(week);value.runDistanceMultiplier=1.5;expect(()=>applyAiWeekReview(week,value)).toThrow('outside the safe range')})
 it('keeps explicit targets fixed when the review recommends lower load',()=>{const week=draft(),result=applyAiWeekReview(week,review(week),{weeklyRunKm:22,weeklyCycleKm:55});expect(result.sessions).toEqual(week.sessions);expect(result.generationExplanation?.at(-1)).toContain('Explicit targets remained fixed')})
})
