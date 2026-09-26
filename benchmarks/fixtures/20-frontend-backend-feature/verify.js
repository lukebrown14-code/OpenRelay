import {JSDOM} from 'jsdom'
import {createOrderApi} from './src/server/orderApi.js'
import {renderOrders} from './src/ui/renderOrders.js'
import {wireOrders} from './src/ui/actions.js'
function check(ok,msg){if(!ok) throw Error(msg)}
const dom=new JSDOM('<div id="orders"></div>'); globalThis.window=dom.window; globalThis.document=dom.window.document
const host=document.querySelector('#orders'), api=createOrderApi(); renderOrders(host,api.list()); wireOrders(host,api)
check(host.querySelector('[data-order-id="O1"] [data-action="cancel"]'),'pending button missing')
check(!host.querySelector('[data-order-id="O2"] [data-action="cancel"]'),'shipped order has cancel button')
check(api.cancel('O2').ok===false,'server cancelled shipped order')
check(api.cancel('missing').ok===false,'server cancelled unknown order')
host.querySelector('[data-order-id="O1"] [data-action="cancel"]').click()
await new Promise(resolve=>setTimeout(resolve,0))
check(api.list().find(o=>o.id==='O1').status==='cancelled','API did not cancel order')
check(host.querySelector('[data-order-id="O1"] .status').textContent==='cancelled','UI status did not update')
check(api.list().find(o=>o.id==='O2').status==='shipped','other order changed')
check(api.list().find(o=>o.id==='O3').status==='pending','other pending order changed')
console.log('PASS: frontend-backend-feature')
