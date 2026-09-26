export function getProfile(id,callback){if(id==='missing') callback(new Error('not found')); else callback(null,{id,name:'Ada'})}
