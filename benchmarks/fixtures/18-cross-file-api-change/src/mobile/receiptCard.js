import {formatReceipt} from '../format/receipt.js'
export function receiptCard(order){return `RECEIPT ${formatReceipt(order)}`}
