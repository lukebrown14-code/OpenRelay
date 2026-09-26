import {loadProfile} from '../profileAdapter.js'
export async function adminUser(id){try{return (await loadProfile(id)).name}catch{return 'User missing'}}
