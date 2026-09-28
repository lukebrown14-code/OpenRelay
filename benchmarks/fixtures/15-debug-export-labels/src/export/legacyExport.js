// Archived export for old reports.
export function legacyCsv(orders){return orders.map(o=>`${o.id},${o.priority}`).join('\n')}
