import { initializeApp } from 'firebase/app'
import { createUserWithEmailAndPassword, getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth'
import { doc, getFirestore, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import type { PlannerStore } from './storage'

const firebaseConfig={
 apiKey:'AIzaSyBdrqbNw6o3LWkBALlX2t6B1Z8O_NCdY8Q',
 authDomain:'stride-562d9.firebaseapp.com',
 projectId:'stride-562d9',
 storageBucket:'stride-562d9.firebasestorage.app',
 messagingSenderId:'609974998361',
 appId:'1:609974998361:web:aafc9986b9ea47460fe848',
 measurementId:'G-62LDC3VTVT',
}

const app=initializeApp(firebaseConfig)
export const auth=getAuth(app)
const db=getFirestore(app)
const plannerRef=(uid:string)=>doc(db,'users',uid,'planner','current')

export const observeAuth=(callback:(user:User|null)=>void)=>onAuthStateChanged(auth,callback)
export const logIn=(email:string,password:string)=>signInWithEmailAndPassword(auth,email,password)
export const register=(email:string,password:string)=>createUserWithEmailAndPassword(auth,email,password)
export const logOut=()=>signOut(auth)
export function observePlanner(uid:string,onValue:(value:PlannerStore|null)=>void,onError:(error:Error)=>void){return onSnapshot(plannerRef(uid),snapshot=>onValue(snapshot.exists()?snapshot.data().data as PlannerStore:null),onError)}
export const savePlanner=(uid:string,data:PlannerStore)=>{
 const firestoreSafe=JSON.parse(JSON.stringify(data)) as PlannerStore
 return setDoc(plannerRef(uid),{data:firestoreSafe,updatedAt:serverTimestamp()})
}
export type { User }
