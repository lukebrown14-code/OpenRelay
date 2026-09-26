import {JSDOM} from 'jsdom'
import {inviteDialog} from './src/ui/inviteDialog.js'
import {showDeleteConfirmation} from './src/main.js'
function check(ok,msg){if(!ok) throw Error(msg)}
const dom=new JSDOM('<main id="app"></main>'); globalThis.window=dom.window; globalThis.document=dom.window.document
const count=()=>document.querySelectorAll('.overlay-backdrop').length
let invite=inviteDialog(); check(count()===1,'invite open'); invite.close(); check(count()===0,'invite close')
for(const action of ['cancel','confirm']){for(let i=0;i<2;i++){const panel=showDeleteConfirmation(); check(count()===1,'stacked backdrop on reopen'); panel.querySelector(`[data-action="${action}"]`).click(); check(count()===0,'backdrop remains after '+action)}}
invite=inviteDialog(); invite.close(); check(count()===0,'invite regression')
console.log('PASS: ui-overlay-leak')
