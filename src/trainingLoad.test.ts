import { describe,expect,it } from 'vitest'
import { getTrainingLoadSummary } from './trainingLoad'
import type { ExternalActivity } from './types'

const activity=(id:string,date:string,minutes:number,type:ExternalActivity['type']='run',distanceKm=5):ExternalActivity=>({id,date,title:id,type,distanceKm,durationSeconds:minutes*60,stravaUrl:''})

describe('training load guidance',()=>{
 it('asks for a baseline without recent evidence',()=>expect(getTrainingLoadSummary([],[],'2026-08-05').status).toBe('baseline'))
 it('uses distinct current and previous seven-day windows',()=>{const result=getTrainingLoadSummary([activity('old','2026-07-22',30),activity('previous','2026-07-28',80),activity('recent','2026-08-03',100)],[],'2026-08-05');expect(result).toMatchObject({recentMinutes:100,previousMinutes:80,runKm:5,changePct:25,status:'balanced'})})
 it('warns when recent training time rises by more than 25 percent',()=>expect(getTrainingLoadSummary([activity('previous','2026-07-28',60),activity('recent','2026-08-03',90)],[],'2026-08-05').status).toBe('watch'))
 it('prioritises poor recovery signals over load change',()=>expect(getTrainingLoadSummary([activity('previous','2026-07-28',60),activity('recent','2026-08-03',100)],[{date:'2026-08-04',energy:2,soreness:4}],'2026-08-05').status).toBe('recover'))
})