import {getProfile} from '../sdk/v1.js'
export function loadProfile(id){return new Promise((resolve,reject)=>getProfile(id,(err,value)=>err?reject(err):resolve(value)))}
