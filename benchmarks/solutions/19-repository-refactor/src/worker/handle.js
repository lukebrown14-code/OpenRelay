import {auditEnabled} from '../shared/audit.js'
export function handleRequest(config){return auditEnabled(config)?'audit-on':'audit-off'}
