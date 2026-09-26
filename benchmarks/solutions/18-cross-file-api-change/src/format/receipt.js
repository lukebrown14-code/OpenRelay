export function formatAmount(cents,locale){return new Intl.NumberFormat(locale,{style:'currency',currency:locale==='de-DE'?'EUR':'USD'}).format(cents/100).replace(/\u00a0/g,' ')}
export function formatReceipt(order){return `${order.id}: ${formatAmount(order.cents,order.locale)}`}
