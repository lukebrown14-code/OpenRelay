import {readFileSync} from 'node:fs'
import {renderDashboard} from './src/web/dashboard.js'
import {handleRequest} from './src/worker/handle.js'
function check(ok,msg){if(!ok) throw Error(msg)}
for(const [input,expected] of [[true,true],[1,true],['on',true],['ON',true],[false,false],[0,false],['off',false],[null,false],[undefined,false]]){
 const config={audit:input,payments:true}
 check(renderDashboard(config).auditEnabled===expected,'web audit '+String(input))
 check(handleRequest(config)===(expected?'audit-on':'audit-off'),'worker audit '+String(input))
 check(renderDashboard(config).paymentsEnabled===true,'payments regression')
}
const shared=readFileSync('src/web/dashboard.js','utf8')+readFileSync('src/worker/handle.js','utf8')
check(/from\s+['"]\.\.\/shared\//.test(shared),'entry points do not use a shared module')
console.log('PASS: repository-refactor')
