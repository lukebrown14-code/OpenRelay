import {auditEnabled} from '../shared/audit.js'
export function renderDashboard(config){return {auditEnabled:auditEnabled(config),paymentsEnabled:Boolean(config.payments)}}
