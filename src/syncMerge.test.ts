import { describe,expect,it } from 'vitest'
import { mergePlannerStores } from './syncMerge'
import { sanitizePlannerStore, type PlannerStore } from './storage'

const store=():PlannerStore=>({active:'week',dark:false,habits:[],weeks:[{id:'week',startDate:'2026-08-03',createdAt:'now',sessions:[{id:'a',date:'2026-08-03',category:'Easy run',title:'Run',intensity:'easy',completed:false,skipped:false},{id:'b',date:'2026-08-04',category:'Indoor bike',title:'Bike',intensity:'easy',completed:false,skipped:false}]}]})

describe('multi-device merge',()=>{
 it('removes legacy undefined metrics before they can sync',()=>{const value=store(),bad=value.weeks[0].sessions[0] as unknown as Record<string,unknown>;bad.plannedDistanceKm='<Undefined>';bad.actualDurationMinutes='undefined';bad.stravaActivityId='<Undefined>';const clean=sanitizePlannerStore(value).weeks[0].sessions[0];expect(clean.plannedDistanceKm).toBeUndefined();expect(clean.actualDurationMinutes).toBeUndefined();expect(clean.stravaActivityId).toBeUndefined();expect(sanitizePlannerStore(value).syncProtocolVersion).toBe(2)})
 it('uses established cloud values on first connection while retaining local-only items',()=>{
  const local=store(),remote=store()
  local.weeks[0].sessions=[...local.weeks[0].sessions,{id:'local-only',date:'2026-08-05',category:'Core and accessories',title:'Core',intensity:'easy',completed:false,skipped:false}]
  local.habits=[{id:'habit-running',name:'Running',color:'#14b8a6',completedDates:[]}]
  remote.weeks[0].sessions[0].title='Cloud planned run'
  remote.habits=[{id:'habit-running',name:'Running',color:'#14b8a6',completedDates:['2026-08-04']}]
  const result=mergePlannerStores(null,local,remote)
  expect(result.weeks[0].sessions.find(item=>item.id==='a')?.title).toBe('Cloud planned run')
  expect(result.weeks[0].sessions.some(item=>item.id==='local-only')).toBe(true)
  expect(result.habits[0].completedDates).toEqual(['2026-08-04'])
 })
 it('keeps independent session changes from both devices',()=>{const base=store(),local=structuredClone(base),remote=structuredClone(base);local.weeks[0].sessions[0].completed=true;remote.weeks[0].sessions[1].completed=true;const result=mergePlannerStores(base,local,remote);expect(result.weeks[0].sessions.map(item=>item.completed)).toEqual([true,true])})
 it('preserves a deletion when the other device left the item unchanged',()=>{const base=store(),local=structuredClone(base),remote=structuredClone(base);local.weeks[0].sessions=local.weeks[0].sessions.filter(item=>item.id!=='a');expect(mergePlannerStores(base,local,remote).weeks[0].sessions.map(item=>item.id)).toEqual(['b'])})
 it('combines new personal workouts created on separate devices',()=>{const base=store(),local=structuredClone(base),remote=structuredClone(base);local.customWorkouts=[{name:'Push',category:'Upper-body strength'}];remote.customWorkouts=[{name:'Core plus',category:'Core and accessories'}];expect(mergePlannerStores(base,local,remote).customWorkouts?.map(item=>item.name).sort()).toEqual(['Core plus','Push'])})
 it('keeps a newly replaced week instead of merging stale sessions back',()=>{const base=store(),local=structuredClone(base),remote=structuredClone(base);local.weeks[0]={...local.weeks[0],replacedAt:'2026-08-10T15:00:00.000Z',sessions:[local.weeks[0].sessions[0]]};remote.weeks[0].sessions.push({id:'stale',date:'2026-08-05',category:'Easy run',title:'Stale run',intensity:'easy',completed:false,skipped:false});expect(mergePlannerStores(base,local,remote).weeks[0]).toEqual(local.weeks[0])})
 it('keeps the newest archived week snapshot intact',()=>{const base=store(),local=structuredClone(base),remote=structuredClone(base);local.weeks[0]={...local.weeks[0],archivedAt:'2026-08-10T12:00:00.000Z',sessions:[local.weeks[0].sessions[0]]};remote.weeks[0].sessions.push({id:'corrupt',date:'2026-08-03',category:'Easy run',title:'Undefined',intensity:'easy',completed:false,skipped:false});expect(mergePlannerStores(base,local,remote).weeks[0]).toEqual(local.weeks[0])})
 it('consolidates duplicate habits and preserves all completed dates',()=>{
  const base=store(),local=structuredClone(base),remote=structuredClone(base)
  local.habits=[{id:'local-running',name:'Running',color:'#14b8a6',completedDates:['2026-08-01']}]
  remote.habits=[{id:'remote-running',name:' running ',color:'#14b8a6',completedDates:['2026-08-02']}]
  const result=mergePlannerStores(base,local,remote)
  expect(result.habits).toHaveLength(1)
  expect(result.habits[0].completedDates).toEqual(['2026-08-01','2026-08-02'])
 })
})
