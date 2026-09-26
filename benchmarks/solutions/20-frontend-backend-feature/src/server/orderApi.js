import {seedOrders} from '../data/orders.js'
export function createOrderApi(){const orders=seedOrders(); return {list:()=>orders.map(o=>({...o})),cancel:(id)=>{const order=orders.find(o=>o.id===id); if(!order||order.status!=='pending') return {ok:false,error:'cannot cancel'}; order.status='cancelled'; return {ok:true,order:{...order}}}}}
