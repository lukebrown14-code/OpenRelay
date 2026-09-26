# Task: Migrate the router adapter to SDK v2

The bundled SDK has moved from callback-based `sdk/v1.js` to promise-based `sdk/v2.js`. Update the application adapter and all callers so profile loading and error handling behave as before. Remove live imports of v1. The admin page uses the adapter as well; the archived demo does not. Do not edit verify.js. Run node verify.js.
