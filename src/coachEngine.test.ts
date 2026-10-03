import {describe,expect,it} from 'vitest'
import {applyCoachDecision,getCoachDecisions,getLatestWorkoutInsight} from './coachEngine'
import {makeWfhWeek} from './data'

describe('local adaptive coach',()=>{
 it('proposes and applies a recovery reduction without moving a workout',()=>{const week=makeWfhWeek(new Date('2026-10-05T12:00:00'),[1,3],false),decisions=getCoachDecisions({week,weeks:[week],activities:[],recovery:[{date:'2026-10-04',energy:2,soreness:4},{date:'2026-10-05',energy:2,soreness:4}],today:'2026-10-05'}),decision=decisions.find(item=>item.action.type==='shorten_session')!;expect(decision).toBeTruthy();if(decision.action.type!=='shorten_session')return;const action=decision.action,original=week.sessions.find(item=>item.id===action.sessionId)!,result=applyCoachDecision({weeks:[week]},week.id,decision),changed=result.weeks[0].sessions.find(item=>item.id===original.id)!;expect(changed.date).toBe(original.date);expect(changed.intensity).toBe('easy');expect(changed.plannedDistanceKm).toBeLessThan(original.plannedDistanceKm!)})
 it('applies a temporary pause only inside its date range',()=>{const week=makeWfhWeek(new Date('2026-10-05T12:00:00'),[1,3],false),healthAdjustment={id:'pause',startDate:'2026-10-06',endDate:'2026-10-08',reason:'illness' as const,mode:'pause' as const,returnPace:'conservative' as const},decision=getCoachDecisions({week,weeks:[week],activities:[],recovery:[],healthAdjustment,today:'2026-10-06'})[0],result=applyCoachDecision({weeks:[week],healthAdjustment},week.id,decision);expect(result.weeks[0].sessions.filter(item=>item.date>='2026-10-06'&&item.date<='2026-10-08').every(item=>item.skipped)).toBe(true);expect(result.weeks[0].sessions.filter(item=>item.date<'2026-10-06'||item.date>'2026-10-08').some(item=>!item.skipped)).toBe(true)})
 it('compares a completed run with recent similar sessions and gives a next action',()=>{
  const starts=['2026-09-14','2026-09-21','2026-09-28','2026-10-05'],weeks=starts.map(value=>makeWfhWeek(new Date(`${value}T12:00:00`),[1,3],false))
  weeks.forEach((week,index)=>{const run=week.sessions.find(item=>item.category==='Easy run')!;run.completed=true;run.completedAt=`2026-10-0${index+1}T12:00:00.000Z`;run.actualDistanceKm=6;run.actualDurationMinutes=36-index;run.perceivedEffort=6})
  const insight=getLatestWorkoutInsight(weeks[3],weeks)!
  expect(insight.result).toContain('against');expect(insight.comparison).toContain('recent comparable');expect(insight.interpretation).toContain('positive trend');expect(insight.nextAction).toContain('planned');expect(insight.confidence).toBe('High')
  expect(insight.metrics).toContain('6.0 km');expect(insight.metrics).toContain('33 min');expect(insight.metrics.every(metric=>!metric.includes(' / '))).toBe(true)
 })
 it('states low confidence when a completed workout has no actual metrics',()=>{const week=makeWfhWeek(new Date('2026-10-05T12:00:00'),[1,3],false),first=week.sessions[0];first.completed=true;first.completedAt='2026-10-05T12:00:00.000Z';const insight=getLatestWorkoutInsight(week,[week])!;expect(insight.result).toContain('No actual duration');expect(insight.confidence).toBe('Low')})
})

 it('uses speed rather than running pace for bike insights',()=>{const first=makeWfhWeek(new Date('2026-09-28T12:00:00'),[1,3],false),second=makeWfhWeek(new Date('2026-10-05T12:00:00'),[1,3],false),oldRide=first.sessions.find(item=>item.category==='Indoor bike')!,ride=second.sessions.find(item=>item.category==='Indoor bike')!;oldRide.completed=true;oldRide.completedAt='2026-09-30T12:00:00.000Z';oldRide.actualDistanceKm=18;oldRide.actualDurationMinutes=45;ride.completed=true;ride.completedAt='2026-10-07T12:00:00.000Z';ride.actualDistanceKm=20;ride.actualDurationMinutes=40;const insight=getLatestWorkoutInsight(second,[first,second])!;expect(insight.metrics).toContain('30.0 km/h');expect(insight.metrics.some(metric=>metric.includes('min/km'))).toBe(false);expect(insight.comparison).toContain('Average speed');})


