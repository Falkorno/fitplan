import { describe,expect,it } from 'vitest'
import { makeWfhWeek } from './data'
import { applyLocalLoadGuard } from './plannerLoad'
import type { TrainingWeekSummary } from './aiPlanner'

const summary=(run:number,cycle:number,adherence=100):TrainingWeekSummary=>({startDate:'2026-08-17',plannedSessions:11,completedSessions:10,skippedSessions:0,adherencePercent:adherence,plannedRunKm:run,completedRunKm:run,completedCycleKm:cycle,longestRunKm:12,hardSessions:1,completedStrengthSessions:4,averageEffort:6,wfhDays:[1,3]})

describe('local load guard',()=>{
 it('does not inflate a safe draft',()=>{const draft=makeWfhWeek(new Date('2026-08-24T12:00:00'),[1,3],false),result=applyLocalLoadGuard(draft,[summary(40,80)]);expect(result.runMultiplier).toBe(1);expect(result.cycleMultiplier).toBe(1)})
 it('caps an unrealistic jump from completed load',()=>{const draft=makeWfhWeek(new Date('2026-08-24T12:00:00'),[1,3],false);draft.sessions.filter(session=>session.category.includes('run')||session.category==='Long run').forEach(session=>session.plannedDistanceKm=15);const result=applyLocalLoadGuard(draft,[summary(25,50)]);expect(result.runMultiplier).toBeLessThan(1);expect(result.week.sessions.filter(session=>session.category.includes('run')||session.category==='Long run').reduce((sum,session)=>sum+(session.plannedDistanceKm??0),0)).toBeLessThan(60)})
 it('reduces the ceiling when adherence and recovery are poor',()=>{const draft=makeWfhWeek(new Date('2026-08-24T12:00:00'),[1,3],false),result=applyLocalLoadGuard(draft,[summary(15,35,50)],[{date:'2026-08-19',energy:2,soreness:4},{date:'2026-08-20',energy:2,soreness:4}]);expect(result.runMultiplier).toBeLessThan(1);expect(result.reasons.join(' ')).toContain('soreness')})
 it('never silently reduces explicit weekly distance targets',()=>{const draft=makeWfhWeek(new Date('2026-08-24T12:00:00'),[1,3],false),result=applyLocalLoadGuard(draft,[summary(10,20,50)],[],{weeklyRunKm:22,weeklyCycleKm:55});expect(result.runMultiplier).toBe(1);expect(result.cycleMultiplier).toBe(1);expect(result.reasons.join(' ')).toContain('retained as entered')})
})
