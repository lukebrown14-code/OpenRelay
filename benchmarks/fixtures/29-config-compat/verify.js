import assert from "node:assert/strict"
import { loadConfig } from "./src/config/load.js"
import { createClient } from "./src/client/create.js"

assert.deepEqual(createClient({ endpoint: "https://example.test" }), { endpoint: "https://example.test", retry: { attempts: 2, delayMs: 100 } })
assert.deepEqual(createClient({ maxRetries: 4, retryDelay: 30 }).retry, { attempts: 4, delayMs: 30 })
assert.deepEqual(createClient({ maxRetries: 4, retryDelay: 30, retry: { attempts: 0, delayMs: 0 } }).retry, { attempts: 0, delayMs: 0 })
assert.deepEqual(loadConfig({ retry: { attempts: 3 } }).retry, { attempts: 3, delayMs: 100 })
const input = { retry: { attempts: 1, delayMs: 2 } }
assert.deepEqual(createClient(input).retry, { attempts: 1, delayMs: 2 })
assert.deepEqual(input, { retry: { attempts: 1, delayMs: 2 } })
for (const value of [-1, 1.5, "2", NaN]) assert.throws(() => createClient({ retry: { attempts: value } }))
assert.throws(() => createClient({ retryDelay: -1 }))
