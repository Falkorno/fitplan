import { describe,expect,it } from 'vitest'
import { moveSessionToDate, toggleSessionCompletion, updateWeekById, updateWeekSession } from './scheduleState'
import type { Session, TrainingWeek } from './types'

const session=(overrides:Partial<Session>={}):Session=>({id:'run',date:'2026-08-04',category:'Easy run',title:'Run',intensity:'easy',completed:true,skipped:false,stravaActivityId:'strava-run',...overrides})
const week=(sessions:Session[]):TrainingWeek=>({id:'week',startDate:'2026-08-03',createdAt:'now',sessions})

describe('stable workout movement',()=>{
 it('updates only the explicitly targeted week',()=>{const current=week([]),next={...week([]),id:'next',startDate:'2026-08-10'};const result=updateWeekById([current,next],'next',value=>({...value,createdAt:'changed'}));expect(result[0]).toBe(current);expect(result[1].createdAt).toBe('changed')})
 it('leaves the original day empty and preserves the chosen date',()=>{const result=moveSessionToDate(week([session()]),'run','2026-08-06');expect(result.sessions[0]).toMatchObject({date:'2026-08-06',stravaActivityId:'strava-run'})})
 it('toggles completion atomically from the latest stored session',()=>{const current=week([session({completed:false,skipped:true,notes:'latest state'})]),result=toggleSessionCompletion(current,'run');expect(result.sessions[0]).toMatchObject({completed:true,skipped:false,notes:'latest state'});expect(result.sessions[0].completedAt).toBeTruthy()})
})

