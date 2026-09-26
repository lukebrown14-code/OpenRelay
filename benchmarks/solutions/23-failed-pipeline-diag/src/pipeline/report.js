import { parseRows } from "./parse.js"
import { totalsByCategory } from "./aggregate.js"

export function report(csv) {
  return totalsByCategory(parseRows(csv))
}
