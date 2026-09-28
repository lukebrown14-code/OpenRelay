export function auditEnabled(config){return config.audit===true || config.audit===1 || (typeof config.audit==='string' && config.audit.toLowerCase()==='on')}
