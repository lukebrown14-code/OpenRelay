import { renderSystemPanel } from "./panels/systemPanel.js"
import { renderBillingPanel } from "./panels/billingPanel.js"
import { renderNotificationsPanel } from "./panels/notificationsPanel.js"

export function mountDashboard(root) {
  renderSystemPanel(root.querySelector("#system-panel"))
  renderBillingPanel(root.querySelector("#billing-panel"))
  renderNotificationsPanel(root.querySelector("#notifications-panel"))
}

if (typeof document !== "undefined") {
  const root = document.getElementById("dashboard")
  if (root) mountDashboard(root)
}
