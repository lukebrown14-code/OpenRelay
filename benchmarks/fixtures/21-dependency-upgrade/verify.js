import {readFileSync} from 'node:fs'
import {profilePage} from './src/web/profile.js'
import {adminUser} from './src/admin/user.js'
function check(ok,msg){if(!ok) throw Error(msg)}
check(await profilePage('u1')==='Ada (u1)','profile success')
check(await adminUser('u1')==='Ada','admin success')
check(await profilePage('missing')==='Profile unavailable','profile error')
check(await adminUser('missing')==='User missing','admin error')
for(const path of ['src/profileAdapter.js','src/web/profile.js','src/admin/user.js']) check(!readFileSync(path,'utf8').includes('sdk/v1.js'),'live v1 import in '+path)
check(readFileSync('src/profileAdapter.js','utf8').includes('sdk/v2.js'),'adapter does not use SDK v2')
console.log('PASS: dependency-upgrade')
