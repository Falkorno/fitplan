import { describe,expect,it } from 'vitest'
import { autoCompleteTrainingHabits } from './habitAutomation'
import { makeWfhWeek } from './data'
import type { ExternalActivity, Habit } from './types'

const habits:Habit[]=[
 {id:'run',name:'Running',color:'#14b8a6',completedDates:[]},
 {id:'bike',name:'Cycling',color:'#3b82f6',completedDates:[]},
 {id:'strength',name:'Strength',color:'#8b5cf6',completedDates:[]},
 {id:'reading',name:'Reading',color:'#22c55e',completedDates:[]}
]

describe('training habit automation',()=>{
 it('ticks matching habits from completed planned sessions',()=>{const week=makeWfhWeek(new Date('2026-08-24T12:00:00'),[],false),run=week.sessions.find(session=>session.category==='Easy run')!,strength=week.sessions.find(session=>session.category.includes('strength'))!;run.completed=true;strength.completed=true;const result=autoCompleteTrainingHabits(habits,[week],[]);expect(result.find(item=>item.id==='run')?.completedDates).toContain(run.date);expect(result.find(item=>item.id==='strength')?.completedDates).toContain(strength.date);expect(result.find(item=>item.id==='reading')?.completedDates).toEqual([])})
 it('ticks running and cycling directly from imported activities',()=>{const activities=[{id:'1',date:'2026-08-20',title:'Lunch Run',type:'run',distanceKm:5,durationSeconds:1500,stravaUrl:''},{id:'2',date:'2026-08-21',title:'Ride',type:'cycle',distanceKm:30,durationSeconds:3600,stravaUrl:''}] satisfies ExternalActivity[];const result=autoCompleteTrainingHabits(habits,[],activities);expect(result.find(item=>item.id==='run')?.completedDates).toEqual(['2026-08-20']);expect(result.find(item=>item.id==='bike')?.completedDates).toEqual(['2026-08-21'])})
 it('returns the same array when nothing needs changing',()=>{expect(autoCompleteTrainingHabits(habits,[],[])).toBe(habits)})
})
