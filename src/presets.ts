import type { Category } from './types'

export interface WorkoutPreset { name:string; category:Category }

export const workoutPresets:WorkoutPreset[]=[
 {name:'Back & Biceps',category:'Upper-body strength'},
 {name:'Chest & Triceps',category:'Upper-body strength'},
 {name:'Arms',category:'Upper-body strength'},
 {name:'Legs',category:'Lower-body strength'},
 {name:'Legs & Core',category:'Lower-body strength'},
 {name:'Light Legs',category:'Lower-body strength'},
 {name:'Core',category:'Core and accessories'},
]