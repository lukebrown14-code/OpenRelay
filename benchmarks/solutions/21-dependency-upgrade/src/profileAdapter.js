import {fetchProfile} from '../sdk/v2.js'
export function loadProfile(id){return fetchProfile({userId:id})}
