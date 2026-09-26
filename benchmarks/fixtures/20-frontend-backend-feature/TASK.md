# Task: Add order cancellation to the dashboard

An order can be cancelled while pending. Add a “Cancel” control to each pending order row; clicking it must call the order API and update that row to cancelled. Shipped orders must not offer cancellation. The server must reject cancellation of shipped or unknown orders and preserve the other rows. The dashboard uses the existing data-action dispatcher. Do not edit verify.js. Run node verify.js.
