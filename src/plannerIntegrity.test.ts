import { describe, expect, it } from 'vitest'
import { inspectPlannerStore, repairPlannerStore, weekStartForDate } from './plannerIntegrity'
import type { PlannerStore } from './storage'
import type { Session, TrainingWeek } from './types'

const session=(id:string,date:string,overrides:Partial<Session>={}):Session=>({id,date,category:'Easy run',title:'Easy run',intensity:'easy',completed:false,skipped:false,...overrides})
const week=(id:string,startDate:string,sessions:Session[]):TrainingWeek=>({id,startDate,sessions,createdAt:'2026-08-01'})
const store=(weeks:TrainingWeek[],active=weeks[0].id):PlannerStore=>({weeks,active,dark:false,habits:[]})

describe('planner integrity',()=>{
 it('uses Monday boundaries across Sunday and Monday',()=>{
  expect(weekStartForDate('2026-08-09')).toBe('2026-08-03')
  expect(weekStartForDate('2026-08-10')).toBe('2026-08-10')
  expect(weekStartForDate('2026-10-25')).toBe('2026-10-19')
  expect(weekStartForDate('2026-10-26')).toBe('2026-10-26')
 })
 it('consolidates duplicate weeks and keeps protected data',()=>{
  const first=week('first','2026-08-03',[session('planned','2026-08-04')])
  const second=week('second','2026-08-03',[session('done','2026-08-05',{completed:true,actualDistanceKm:8})])
  const repaired=repairPlannerStore(store([first,second],'second'),'2026-08-03')
  expect(repaired.weeks).toHaveLength(1)
  expect(repaired.active).toBe('second')
  expect(repaired.weeks[0].sessions.map(item=>item.id)).toEqual(expect.arrayContaining(['planned','done']))
 })
 it('moves sessions into the calendar week containing their date',()=>{
  const repaired=repairPlannerStore(store([week('first','2026-08-03',[session('moved','2026-08-11')])]),'2026-08-03')
  expect(repaired.weeks.find(item=>item.startDate==='2026-08-10')?.sessions[0].id).toBe('moved')
 })
 it('keeps a planned Strava match and removes its generated duplicate',()=>{
  const planned=session('planned','2026-08-05',{stravaActivityId:'123',completed:true})
  const generated=session('strava-123','2026-08-05',{title:'Lunch Run',stravaActivityId:'123',completed:true})
  const repaired=repairPlannerStore(store([week('week','2026-08-03',[generated,planned])]),'2026-08-03')
  expect(repaired.weeks[0].sessions).toHaveLength(1)
  expect(repaired.weeks[0].sessions[0].id).toBe('planned')
  expect(inspectPlannerStore(repaired).duplicateStravaLinks).toBe(0)
 })
 it('removes rest markers that conflict with a real workout',()=>{
  const repaired=repairPlannerStore(store([week('week','2026-08-03',[session('run','2026-08-07'),session('rest','2026-08-07',{category:'Rest',title:'Full rest'})])]),'2026-08-03')
  expect(repaired.weeks[0].sessions.map(item=>item.id)).toEqual(['run'])
 })
 it('collapses semantic duplicates already inside the canonical week',()=>{const first=session('first','2026-08-05',{title:'Easy run',plannedDistanceKm:5}),duplicate=session('duplicate','2026-08-05',{title:'Easy run',plannedDistanceKm:5});expect(repairPlannerStore(store([week('week','2026-08-03',[first,duplicate])]),'2026-08-03').weeks[0].sessions).toHaveLength(1)})
 it('keeps separate same-day Strava activities with different IDs',()=>{
  const first=session('strava-1','2026-08-05',{title:'Morning Run',stravaActivityId:'1',completed:true})
  const second=session('strava-2','2026-08-05',{title:'Morning Run',stravaActivityId:'2',completed:true})
  const repaired=repairPlannerStore(store([week('week','2026-08-03',[first,second])]),'2026-08-03')
  expect(repaired.weeks[0].sessions).toHaveLength(2)
 })
 it('preserves reused session IDs in different calendar weeks',()=>{
  const past=week('past','2026-08-03',[session('shared-id','2026-08-04',{completed:true,actualDistanceKm:8})])
  const current=week('current','2026-08-10',[session('shared-id','2026-08-11',{plannedDistanceKm:10})])
  const repaired=repairPlannerStore(store([past,current],'current'),'2026-08-03')
  expect(repaired.weeks.find(item=>item.id==='past')?.sessions[0]).toMatchObject({date:'2026-08-04',actualDistanceKm:8})
  expect(repaired.weeks.find(item=>item.id==='current')?.sessions[0]).toMatchObject({date:'2026-08-11',plannedDistanceKm:10})
 })
 it('does not alter any past week during automatic repair',()=>{const past=week('past','2026-08-03',[session('first','2026-08-04'),session('duplicate','2026-08-04')]);expect(repairPlannerStore(store([past]),'2026-08-10')).toEqual(store([past]))})
 it('removes legacy Rest markers from archived and active weeks during migration',()=>{const archived={...week('past','2026-08-03',[session('run','2026-08-11'),session('rest','2026-08-11',{category:'Rest',title:'Full rest'})]),archivedAt:'2026-08-10T12:00:00.000Z'},repaired=repairPlannerStore(store([archived]),'2026-08-03');expect(repaired.weeks[0].sessions.map(item=>item.id)).toEqual(['run'])})
})
