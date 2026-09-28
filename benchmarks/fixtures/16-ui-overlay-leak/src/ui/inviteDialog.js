import {openOverlay,closeOverlay} from './overlay.js'
export function inviteDialog(){const panel=document.createElement('dialog'); panel.id='invite'; openOverlay(panel); return {close:()=>closeOverlay(panel),panel}}
