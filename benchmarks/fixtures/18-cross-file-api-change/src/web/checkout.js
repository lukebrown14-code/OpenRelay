import {formatReceipt} from '../format/receipt.js'
export function checkoutSummary(order){return `<section class="receipt">${formatReceipt(order)}</section>`}
