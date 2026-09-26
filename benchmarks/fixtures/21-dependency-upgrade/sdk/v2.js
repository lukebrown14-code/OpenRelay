export async function fetchProfile({userId}){if(userId==='missing') throw new Error('not found'); return {id:userId,name:'Ada'}}
