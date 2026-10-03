import type { ExternalActivity } from './types'

export function classifyStravaActivity(activity:ExternalActivity):string[]{
 const title=activity.title.toLowerCase(),tags:string[]=[]
 if(activity.type==='run'&&(activity.distanceKm>=12||activity.durationSeconds>=5400))tags.push('long')
 if(/interval|repetition|track|speed|tempo|threshold|fartlek/.test(title)||activity.workoutType===3)tags.push('quality')
 if(/race|parkrun|event/.test(title)||activity.workoutType===1)tags.push('race')
 if(activity.distanceKm>0&&(activity.elevationGainM??0)/activity.distanceKm>=15)tags.push('hilly')
 if(activity.trainer)tags.push('indoor')
 if(activity.commute)tags.push('commute')
 if((activity.averagePowerWatts??0)>0)tags.push('power recorded')
 return [...new Set(tags)]
}