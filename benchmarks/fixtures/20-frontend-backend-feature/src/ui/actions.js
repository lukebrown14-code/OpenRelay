import {renderOrders} from './renderOrders.js'
export function wireOrders(host,api){host.addEventListener('click',event=>{const action=event.target.closest('[data-action]')?.dataset.action; if(action==='refresh') renderOrders(host,api.list())})}
