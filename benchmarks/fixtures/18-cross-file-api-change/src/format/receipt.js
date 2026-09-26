export function formatAmount(cents){return '$'+(cents/100).toFixed(2)}
export function formatReceipt(order){return `${order.id}: ${formatAmount(order.cents)}`}
