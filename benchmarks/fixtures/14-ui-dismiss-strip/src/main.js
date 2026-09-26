import { renderTopbar } from './sections/topbar.js'
import { renderNotice } from './sections/notice.js'
import { installInteractions } from './interactions.js'
export function render(app) { app.replaceChildren(); renderTopbar(app); renderNotice(app); const stats=document.createElement('section'); stats.id='stats'; stats.textContent='42 active users'; app.append(stats) }
export function start(app) { installInteractions(app, () => render(app)); render(app) }
