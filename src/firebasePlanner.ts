import { doc, getDoc, getFirestore, onSnapshot } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import { firebaseApp } from './firebaseApp'
import type { PlannerStore } from './storage'

const db=getFirestore(firebaseApp)
const plannerRef=(uid:string)=>doc(db,'users',uid,'planner','current')
const firestoreData=(data:PlannerStore):PlannerStore=>{
 const value={...data,syncProtocolVersion:2}
 delete value.externalActivities
 delete value.activitiesSyncedAt
 return JSON.parse(JSON.stringify(value)) as PlannerStore
}
export interface CloudPlanner { data:PlannerStore; revision:number; deviceId?:string }
export type SaveResult={saved:true;revision:number}|{saved:false;current:CloudPlanner}
const envelope=(value:Record<string,unknown>):CloudPlanner=>({data:value.data as PlannerStore,revision:typeof value.revision==='number'?value.revision:0,deviceId:typeof value.deviceId==='string'?value.deviceId:undefined})

export function observePlanner(uid:string,onValue:(value:CloudPlanner|null)=>void,onError:(error:Error)=>void){return onSnapshot(plannerRef(uid),snapshot=>onValue(snapshot.exists()?envelope(snapshot.data()):null),onError)}
export const loadPlannerSnapshot=async(uid:string):Promise<CloudPlanner|null>=>{const snapshot=await getDoc(plannerRef(uid));return snapshot.exists()?envelope(snapshot.data()):null}
export const savePlanner=async(uid:string,data:PlannerStore,expectedRevision:number,deviceId:string):Promise<SaveResult>=>{
 const snapshot=await getDoc(plannerRef(uid))
 if(snapshot.exists()){
  const current=envelope(snapshot.data())
  if(current.revision!==expectedRevision)return {saved:false,current}
 }
 return {saved:true,revision:await replacePlanner(uid,data,deviceId)}
}
type RestValue={nullValue?:null;booleanValue?:boolean;integerValue?:string;doubleValue?:number;stringValue?:string;arrayValue?:{values:RestValue[]};mapValue?:{fields:Record<string,RestValue>}}
const restValue=(value:unknown):RestValue=>{
 if(value===null)return {nullValue:null}
 if(typeof value==='boolean')return {booleanValue:value}
 if(typeof value==='number')return Number.isInteger(value)?{integerValue:String(value)}:{doubleValue:value}
 if(typeof value==='string')return {stringValue:value}
 if(Array.isArray(value))return {arrayValue:{values:value.map(restValue)}}
 if(typeof value==='object')return {mapValue:{fields:Object.fromEntries(Object.entries(value).filter(([,item])=>item!==undefined).map(([key,item])=>[key,restValue(item)]))}}
 return {stringValue:String(value)}
}
const restFields=(value:Record<string,unknown>)=>Object.fromEntries(Object.entries(value).filter(([,item])=>item!==undefined).map(([key,item])=>[key,restValue(item)]))

export const replacePlanner=async(uid:string,data:PlannerStore,deviceId:string):Promise<number>=>{
 const revision=Date.now(),user=getAuth(firebaseApp).currentUser
 if(!user)throw new Error('You were signed out before the restore could be uploaded.')
 const token=await user.getIdToken()
 const document={data:firestoreData(data),revision,deviceId,updatedAt:new Date().toISOString()}
 const response=await fetch(`https://firestore.googleapis.com/v1/projects/stride-562d9/databases/(default)/documents/users/${encodeURIComponent(uid)}/planner/current`,{method:'PATCH',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({fields:restFields(document)})})
 if(!response.ok)throw new Error(`Firestore restore failed (${response.status}): ${await response.text()}`)
 return revision
}