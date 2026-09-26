export function openOverlay(panel){const backdrop=document.createElement('div'); backdrop.className='overlay-backdrop'; document.body.append(backdrop,panel); panel.hidden=false; return backdrop}
export function closeOverlay(panel){panel.hidden=true; panel.remove(); for(const backdrop of document.querySelectorAll('.overlay-backdrop')) backdrop.remove()}
