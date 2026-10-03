import { describe, expect, it } from 'vitest'
import { applyActivityMatch, dedupeWeekSessions, findActivityMatch, matchActivitiesToWeeks, refreshLinkedActivities } from './activityMatching'
import type { ExternalActivity, Session, TrainingWeek } from './types'

const session=(overrides:Partial<Session>={}):Session=>({id:'session',date:'2026-08-05',category:'Easy run',title:'Easy run',plannedDistanceKm:5,intensity:'easy',completed:false,skipped:false,...overrides})
const activity=(overrides:Partial<ExternalActivity>={}):ExternalActivity=>({id:'strava-1',date:'2026-08-05',title:'Morning Run',type:'run',distanceKm:5.08,durationSeconds:1800,stravaUrl:'https://strava.test/1',...overrides})
const week=(sessions:Session[]):TrainingWeek=>({id:'week',startDate:'2026-08-03',createdAt:'2026-08-03',sessions})

describe('Strava activity matching',()=>{
 it('removes exact plan and Strava duplicates idempotently',()=>{const planned=session(),plannedCopy={...planned,id:'copy',plannedDistanceKm:999,actualDistanceKm:999},linked=session({id:'linked',stravaActivityId:'strava-1',completed:true}),linkedCopy={...linked,id:'linked-copy'};const once=dedupeWeekSessions([planned,plannedCopy,linked,linkedCopy]);expect(once).toHaveLength(2);expect(dedupeWeekSessions(once)).toEqual(once)})
 it('matches the closest same-day session of the same sport',()=>{
  const easy=session(),long=session({id:'long',category:'Long run',title:'Long run',plannedDistanceKm:12})
  expect(findActivityMatch(activity(),[week([long,easy])])?.id).toBe('session')
 })
 it('does not match a different date or sport',()=>{
  expect(findActivityMatch(activity(),[week([session({date:'2026-08-06'}),session({id:'bike',category:'Indoor bike'})])])).toBeUndefined()
 })
 it('does not reuse a session already linked to Strava',()=>{
  expect(findActivityMatch(activity(),[week([session({stravaActivityId:'older'})])])).toBeUndefined()
 })
 it('matches a real activity even when the planned session was marked skipped',()=>{
  expect(findActivityMatch(activity(),[week([session({skipped:true})])])?.id).toBe('session')
 })
 it('completes the session and records actual metrics',()=>{
  expect(applyActivityMatch(session({plannedDistanceKm:10}),activity({distanceKm:14,durationSeconds:4200}))).toMatchObject({title:'Morning Run',completed:true,skipped:false,plannedDurationMinutes:70,plannedDistanceKm:14,actualDurationMinutes:70,actualDistanceKm:14,stravaActivityId:'strava-1'})
 })
 it('copies rich Strava metrics and tags onto a planned workout',()=>{
  const result=applyActivityMatch(session(),activity({elevationGainM:185,averageHeartRate:148,averagePowerWatts:242,activityTags:['hilly','power recorded']}))
  expect(result).toMatchObject({stravaTitle:'Morning Run',activityTags:['hilly','power recorded'],activityStats:{elevationGainM:185,averageHeartRate:148,averagePowerWatts:242}})
 })
 it('automatically tags a same-day planned run',()=>{
  const tuesday=session({id:'tuesday-run',date:'2026-08-04',plannedDistanceKm:5})
  const result=matchActivitiesToWeeks([week([tuesday])],[activity({date:'2026-08-04',id:'aug-4-run'})])
  expect(result.matched).toBe(1)
  expect(result.weeks[0].sessions[0]).toMatchObject({id:'tuesday-run',completed:true,stravaActivityId:'aug-4-run'})
 })
 it('moves a stale match onto the same-day session in the preferred visible week',()=>{
  const stale={...week([session({id:'old-run',stravaActivityId:'strava-1'})]),id:'old-week'}
  const visible={...week([session({id:'visible-run'})]),id:'visible-week'}
  const result=matchActivitiesToWeeks([stale,visible],[activity()],'visible-week')
  expect(result.weeks[0].sessions[0].stravaActivityId).toBeUndefined()
  expect(result.weeks[1].sessions[0]).toMatchObject({id:'visible-run',stravaActivityId:'strava-1',completed:true})
 })
 it('never applies a 4 August activity to a repeated session id on 7 August',()=>{
  const fourth={...week([session({id:'repeated',date:'2026-08-04'})]),id:'fourth'}
  const seventh={...week([session({id:'repeated',date:'2026-08-07'})]),id:'seventh'}
  const result=matchActivitiesToWeeks([fourth,seventh],[activity({date:'2026-08-04'})])
  expect(result.weeks[0].sessions[0].stravaActivityId).toBe('strava-1')
  expect(result.weeks[1].sessions[0].stravaActivityId).toBeUndefined()
 })
 it('repairs an existing activity link stored against the wrong date',()=>{
  const affected={...week([session({id:'repeated',date:'2026-08-04'}),session({id:'repeated',date:'2026-08-07',stravaActivityId:'strava-1'})]),id:'visible'}
  const result=matchActivitiesToWeeks([affected],[activity({date:'2026-08-04'})],'visible')
  expect(result.weeks[0].sessions[0].stravaActivityId).toBe('strava-1')
  expect(result.weeks[0].sessions[1].stravaActivityId).toBeUndefined()
 })
 it('persists cleanup when both the correct and a future session carry the activity id',()=>{
  const affected={...week([session({id:'correct',date:'2026-08-04',stravaActivityId:'strava-1'}),session({id:'repeated',date:'2026-08-07',stravaActivityId:'strava-1'})]),id:'visible'}
  const result=matchActivitiesToWeeks([affected],[activity({date:'2026-08-04'})],'visible')
  expect(result.matched).toBeGreaterThan(0)
  expect(result.weeks[0].sessions[0].stravaActivityId).toBe('strava-1')
  expect(result.weeks[0].sessions[1].stravaActivityId).toBeUndefined()
 })
 it('adds an unmatched Strava activity to the correct existing week',()=>{
  const result=matchActivitiesToWeeks([week([])],[activity({title:'Lunch Run',date:'2026-08-04'})])
  expect(result.added).toBe(1)
  expect(result.weeks[0].sessions[0]).toMatchObject({id:'strava-strava-1',date:'2026-08-04',title:'Lunch Run',category:'Easy run',completed:true,stravaActivityId:'strava-1'})
 })
 it('names and categorises an unmatched hilly long run from its metrics',()=>{
  const result=matchActivitiesToWeeks([week([])],[activity({title:'Morning Run',date:'2026-08-04',distanceKm:16,elevationGainM:360})])
  expect(result.weeks[0].sessions[0]).toMatchObject({title:'Morning Run',category:'Long run',intensity:'moderate',activityTags:['long','hilly']})
 })
 it('recognises an interval run as hard speed work',()=>{
  const result=matchActivitiesToWeeks([week([])],[activity({title:'Track intervals',date:'2026-08-04'})])
  expect(result.weeks[0].sessions[0]).toMatchObject({title:'Track intervals',category:'Speed work',intensity:'hard',activityTags:['quality']})
 })
 it('refreshes the Strava title on an already linked planner workout',()=>{
  const linked=session({title:'Steady aerobic ride',category:'Indoor bike',stravaActivityId:'strava-1'})
  const updated=refreshLinkedActivities([week([linked])],[activity({type:'cycle',title:'Zwift - Coast Crusher',distanceKm:32})])
  expect(updated[0].sessions[0]).toMatchObject({title:'Zwift - Coast Crusher',stravaTitle:'Zwift - Coast Crusher',stravaActivityId:'strava-1'})
 })
 it('refreshes an already linked session when Strava data changes',()=>{
  const linked=session({stravaActivityId:'strava-1',actualDistanceKm:5,actualDurationMinutes:30})
  const result=matchActivitiesToWeeks([week([linked])],[activity({distanceKm:5.25,durationSeconds:1740})])
  expect(result.updated).toBe(1)
  expect(result.weeks[0].sessions[0]).toMatchObject({actualDistanceKm:5.25,actualDurationMinutes:29})
 })
 it('does not create planner weeks for historical activities',()=>{
  const result=matchActivitiesToWeeks([week([])],[activity({date:'2026-07-01'})])
  expect(result.added).toBe(0)
  expect(result.weeks[0].sessions).toHaveLength(0)
 })
 it('moves a hidden generated match into the visible week even without a planned target',()=>{
  const hidden={...week([{...session({id:'strava-strava-1',title:'Morning Run',stravaActivityId:'strava-1'}),plannedDistanceKm:14,actualDistanceKm:14}]),id:'hidden'}
  const visible={...week([]),id:'visible'}
  const result=matchActivitiesToWeeks([hidden,visible],[activity({distanceKm:14})],'visible')
  expect(result.weeks[0].sessions).toHaveLength(0)
  expect(result.weeks[1].sessions).toHaveLength(1)
  expect(result.weeks[1].sessions[0]).toMatchObject({id:'strava-strava-1',date:'2026-08-05',actualDistanceKm:14,stravaActivityId:'strava-1'})
 })
 it('removes a generated duplicate when the planned workout already has the same Strava match',()=>{
  const planned=session({id:'planned-run',plannedDistanceKm:14,actualDistanceKm:14,stravaActivityId:'strava-1'})
  const imported=session({id:'strava-strava-1',title:'Morning Run',plannedDistanceKm:14,actualDistanceKm:14,stravaActivityId:'strava-1'})
  const result=matchActivitiesToWeeks([week([imported,planned])],[activity({distanceKm:14})],'week')
  expect(result.weeks[0].sessions).toHaveLength(1)
  expect(result.weeks[0].sessions[0]).toMatchObject({id:'planned-run',plannedDistanceKm:14,actualDistanceKm:14,stravaActivityId:'strava-1'})
 })
 it('does not add activities to completed past weeks when a current week is preferred',()=>{
  const past={...week([session({id:'past-done',date:'2026-08-04',completed:true,actualDistanceKm:5})]),id:'past',startDate:'2026-08-03'}
  const current={...week([session({id:'current-plan',date:'2026-08-11',plannedDistanceKm:10})]),id:'current',startDate:'2026-08-10'}
  const pastBefore=JSON.stringify(past)
  const result=matchActivitiesToWeeks([past,current],[activity({id:'past-new',date:'2026-08-06'}),activity({id:'current-run',date:'2026-08-11',distanceKm:14})],'current')
  expect(JSON.stringify(result.weeks[0])).toBe(pastBefore)
  expect(result.weeks[1].sessions[0]).toMatchObject({id:'current-plan',plannedDistanceKm:14,actualDistanceKm:14,stravaActivityId:'current-run'})
 })
 it('is idempotent when the same Strava activity is processed repeatedly',()=>{
  const planned=session({id:'planned-run',plannedDistanceKm:10})
  const first=matchActivitiesToWeeks([week([planned])],[activity({distanceKm:14})],'week')
  const second=matchActivitiesToWeeks(first.weeks,[activity({distanceKm:14})],'week')
  expect(second.weeks).toEqual(first.weeks)
  expect(second.weeks[0].sessions.filter(item=>item.stravaActivityId==='strava-1')).toHaveLength(1)
 })
})
