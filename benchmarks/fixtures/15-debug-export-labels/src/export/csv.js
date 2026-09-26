import {priorityLabels} from '../labels.js'
const quote=value=>`"${String(value).replaceAll('"','""')}"`
export function buildCsv(orders){return ['id,priority,status,region',...orders.map(o=>[o.id,priorityLabels[o.priority]??o.priority,o.status,o.region].map(quote).join(','))].join('\n')+'\n'}
