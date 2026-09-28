#!/usr/bin/env node
import { benchmarkRoot, repositoryRoot } from "../../lib/paths.mjs"
// Verify each Stage 5 extension fails in its pristine state and passes with its
// reference solution. No model calls are made.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'

const root=benchmarkRoot
const fixtures=fs.readdirSync(path.join(root,'fixtures')).filter(name=>/^(1[4-9]|2[0-1])-/.test(name)).sort()
let failed=false
for(const name of fixtures){
 const fixture=path.join(root,'fixtures',name)
 const solution=path.join(root,'solutions',name)
 const scratch=fs.mkdtempSync(path.join(os.tmpdir(),`stage5-${name}-`))
 try{
  fs.cpSync(fixture,scratch,{recursive:true,filter:source=>!source.includes(`${path.sep}node_modules`) && !source.includes(`${path.sep}__pycache__`)})
  const deps=path.join(fixture,'node_modules')
  if(fs.existsSync(deps)) fs.symlinkSync(deps,path.join(scratch,'node_modules'),'dir')
  const verify=()=>spawnSync('node',['verify.js'],{cwd:scratch,encoding:'utf8',timeout:90000})
  const pristine=verify()
  if(pristine.status===0) throw Error('pristine fixture unexpectedly passed')
  if(!fs.existsSync(solution)) throw Error('reference solution missing')
  fs.cpSync(solution,scratch,{recursive:true,force:true})
  const solved=verify()
  if(solved.status!==0) throw Error(`reference solution failed: ${(solved.stderr||solved.stdout).slice(-800)}`)
  console.log(`PASS ${name}: pristine fails, reference solution passes`)
 }catch(error){failed=true;console.error(`FAIL ${name}: ${error.message}`)}
 finally{fs.rmSync(scratch,{recursive:true,force:true})}
}
if(failed) process.exitCode=1
