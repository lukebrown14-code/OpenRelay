import {priorityLabels} from '../labels.js'
export function renderTable(orders){return orders.map(o=>({id:o.id,priority:priorityLabels[o.priority.toLowerCase()]??o.priority,status:o.status,region:o.region}))}
