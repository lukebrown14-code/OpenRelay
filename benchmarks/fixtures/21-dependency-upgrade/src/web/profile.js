import {loadProfile} from '../profileAdapter.js'
export async function profilePage(id){try{const p=await loadProfile(id); return `${p.name} (${p.id})`}catch{return 'Profile unavailable'}}
