let dismissed=false
export function dismissPromo() { dismissed=true; const strip=document.querySelector('#promo-strip'); if(strip) strip.hidden=true }
export function promoDismissed() { return dismissed }
export function resetPromo() { dismissed=false }
