import {formatReceipt} from './src/format/receipt.js'
import {checkoutSummary} from './src/web/checkout.js'
import {receiptEmail} from './src/email/sendReceipt.js'
import {receiptCard} from './src/mobile/receiptCard.js'
function check(ok,msg){if(!ok) throw Error(msg)}
for(const [locale,amount] of [['en-US','$1,234.50'],['de-DE','1.234,50 €']]){
 const order={id:'R7',customer:'Ada',cents:123450,locale}
 for(const [name,view] of [['format',formatReceipt(order)],['web',checkoutSummary(order)],['email',receiptEmail(order)],['mobile',receiptCard(order)]]) check(view.includes(amount),name+' missing '+locale+' amount: '+view)
 check(receiptEmail(order).includes('Ada')&&receiptEmail(order).includes('R7'),'email lost metadata')
}
console.log('PASS: cross-file-api-change')
