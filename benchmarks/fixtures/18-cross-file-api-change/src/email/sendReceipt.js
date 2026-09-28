import {formatReceipt} from '../format/receipt.js'
export function receiptEmail(order){return `Hello ${order.customer}, your order ${formatReceipt(order)} is confirmed.`}
