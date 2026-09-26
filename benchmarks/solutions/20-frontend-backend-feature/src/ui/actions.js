import {renderOrders} from './renderOrders.js'
export function wireOrders(host,api){host.addEventListener('click',event=>{const action=event.target.closest('[data-action]')?.dataset.action; if(action==='refresh') renderOrders(host,api.list()); if(action==='cancel'){const id=event.target.closest('[data-order-id]')?.dataset.orderId; if(api.cancel(id).ok) renderOrders(host,api.list())}})}
