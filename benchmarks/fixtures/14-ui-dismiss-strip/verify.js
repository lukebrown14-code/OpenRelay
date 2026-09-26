import {JSDOM} from 'jsdom'
import {start} from './src/main.js'
import {resetPromo} from './src/actions/promo.js'
function check(ok,msg){if(!ok) throw Error(msg)}
const dom=new JSDOM('<main id="app"></main>'); globalThis.window=dom.window; globalThis.document=dom.window.document
resetPromo(); const app=document.querySelector('#app'); start(app)
const stats=()=>document.querySelector('#stats').textContent
const before=stats()
document.querySelector('[aria-label="Dismiss promotion"]').click()
check(document.querySelector('#promo-strip').hidden,'promotion remains visible')
app.dispatchEvent(new dom.window.Event('refresh-dashboard'))
check(document.querySelector('#promo-strip').hidden,'promotion reappeared after render')
document.querySelector('[aria-label="Dismiss notice"]').click()
check(document.querySelector('#notice-card').hidden,'notice dismissal broke')
check(stats()===before,'stats changed')
console.log('PASS: ui-dismiss-strip')
