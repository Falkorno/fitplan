import { createUserWithEmailAndPassword, getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth'
import { firebaseApp } from './firebaseApp'
const auth=getAuth(firebaseApp)
export const observeAuth=(callback:(user:User|null)=>void)=>onAuthStateChanged(auth,callback)
export const logIn=(email:string,password:string)=>signInWithEmailAndPassword(auth,email,password)
export const register=(email:string,password:string)=>createUserWithEmailAndPassword(auth,email,password)
export const logOut=()=>signOut(auth)