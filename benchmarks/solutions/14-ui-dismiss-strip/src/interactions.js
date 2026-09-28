import { dismissPromo, promoDismissed } from './actions/promo.js'
export function installInteractions(app, rerender) {
  app.addEventListener('click', event => {
    const action=event.target.closest('[data-action]')?.dataset.action
    if(action==='dismiss-promo') dismissPromo()
    if(action==='dismiss-notice') event.target.closest('#notice-card').hidden=true
  })
  app.addEventListener('refresh-dashboard', () => {
    rerender()
    if(promoDismissed()) document.querySelector('#promo-strip').hidden=true
  })
}
