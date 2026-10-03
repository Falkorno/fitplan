import { kind } from './data'
import type { ExternalActivity, Habit, TrainingWeek } from './types'

type TrainingHabit='run'|'bike'|'strength'

const habitKind=(name:string):TrainingHabit|undefined=>{
 const value=name.trim().toLowerCase()
 if(/\b(run|running)\b/.test(value))return 'run'
 if(/\b(cycle|cycling|bike|biking)\b/.test(value))return 'bike'
 if(/\b(strength|weights|gym)\b/.test(value))return 'strength'
}

export function autoCompleteTrainingHabits(habits:Habit[],weeks:TrainingWeek[],activities:ExternalActivity[]):Habit[]{
 const dates:Record<TrainingHabit,Set<string>>={run:new Set(),bike:new Set(),strength:new Set()}
 for(const week of weeks)for(const session of week.sessions)if(session.completed&&!session.skipped){
  const type=kind(session.category)
  if(type==='run'||type==='bike'||type==='strength')dates[type].add(session.date)
 }
 for(const activity of activities){
  if(activity.type==='run')dates.run.add(activity.date)
  if(activity.type==='cycle')dates.bike.add(activity.date)
 }
 let changed=false
 const next=habits.map(habit=>{
  const type=habitKind(habit.name)
  if(!type)return habit
  const additions=[...dates[type]].filter(date=>!habit.completedDates.includes(date))
  if(!additions.length)return habit
  changed=true
  return {...habit,completedDates:[...habit.completedDates,...additions].sort()}
 })
 return changed?next:habits
}
