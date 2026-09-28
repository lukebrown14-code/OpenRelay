# Task: Add a status badge to the System panel

The dashboard renders three panels: System, Billing, and Notifications. Ops wants a
status badge in the **System panel header only**.

Requirements:
- Inside the System panel's `.panel-header`, add a badge element:
  `<span class="status-badge" data-status="ok">OK</span>`
- The badge must be rendered by the System panel's own render function, so it appears
  whenever that panel renders.
- The Billing and Notifications panels must remain exactly as they are: no status badge.
- Do not modify `verify.js`.

Run `node verify.js` to check your work. It must print PASS.
