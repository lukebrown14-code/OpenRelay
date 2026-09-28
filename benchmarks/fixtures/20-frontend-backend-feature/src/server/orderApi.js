import {seedOrders} from '../data/orders.js'
export function createOrderApi(){const orders=seedOrders(); return {list:()=>orders.map(o=>({...o})),cancel:(id)=>({ok:false,error:'cancellation unavailable'})}}
