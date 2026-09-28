import {orders} from './src/data/orders.js'
import {renderTable} from './src/table/cells.js'
import {buildCsv} from './src/export/csv.js'
function check(ok,msg){if(!ok) throw Error(msg)}
const expected=['Urgent','High','Normal','Low']
const cells=renderTable(orders)
check(cells.map(c=>c.priority).join('|')===expected.join('|'),'table labels regressed')
const lines=buildCsv(orders).trimEnd().split('\n')
check(lines[0]==='id,priority,status,region','header changed')
check(lines.length===5,'row count changed')
for(let i=0;i<orders.length;i++) check(lines[i+1]===`"${orders[i].id}","${expected[i]}","${orders[i].status}","${orders[i].region}"`,'CSV row '+i+' wrong')
console.log('PASS: debug-export-labels')
