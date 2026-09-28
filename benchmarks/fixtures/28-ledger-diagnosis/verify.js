import assert from "node:assert/strict"
import { summarize } from "./src/summary.js"

const csv = "account,kind,amount\nSales,sale,10.50\nSales,refund,3.25\nsales,sale,2.00\nSales,sale,0.75"
assert.deepEqual(summarize(csv), { Sales: 8, sales: 2 })
assert.deepEqual(summarize("account,kind,amount\nA,refund,0.25\nA,sale,1.00"), { A: 0.75 })
assert.throws(() => summarize("account,kind,amount\nA,sale,wat"), /amount/i)
assert.throws(() => summarize("account,kind,amount\nA,sale,Infinity"), /amount/i)
