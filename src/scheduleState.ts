import type { Session, TrainingWeek } from './types'

export function updateWeekById(weeks:TrainingWeek[],weekId:string,update:(week:TrainingWeek)=>TrainingWeek):TrainingWeek[]{
 return weeks.map(week=>week.id===weekId?update(week):week)
}

export function updateWeekSession(week:TrainingWeek,session:Session):TrainingWeek{
 const sessions=week.sessions.map(item=>item.id===session.id?session:item)
 return {...week,sessions}
}

export function toggleSessionCompletion(week:TrainingWeek,id:string):TrainingWeek{
 const current=week.sessions.find(session=>session.id===id)
 if(!current)return week
 const completed=!current.completed
 return updateWeekSession(week,{...current,completed,skipped:false,completedAt:completed?new Date().toISOString():undefined})
}

export function moveSessionToDate(week:TrainingWeek,id:string,date:string):TrainingWeek{
 const source=week.sessions.find(session=>session.id===id)
 if(!source||source.date===date)return week
 return updateWeekSession(week,{...source,date})
}

