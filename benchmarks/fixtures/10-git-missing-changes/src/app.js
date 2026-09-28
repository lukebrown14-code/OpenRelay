import { config } from "../config.js"

console.log(`rate limit: ${config.RATE_LIMIT} requests/min (${config.ENV})`)
