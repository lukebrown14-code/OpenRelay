import { buildIndex, search, searchPhrase } from "./src/search/index.js"
const check = (c, m) => { if (!c) { console.log("FAIL: " + m); process.exit(1) } }

const docs = {
  d1: "Error handling guide: retry with backoff when the database errors out.",
  d2: "Database schema migrations run before error reporting starts.",
  d3: "Cooking pasta: boil water, add salt.",
}
const index = buildIndex(docs)
check(search(index, "database").join() === "d1,d2", "plain search broke")
check(typeof searchPhrase === "function", "searchPhrase missing")
check(searchPhrase(index, "database errors").join() === "d1", "phrase should match d1 only")
check(searchPhrase(index, "database schema").join() === "d2", "phrase should match d2")
check(searchPhrase(index, "schema database").length === 0, "phrase must respect token order")
check(searchPhrase(index, "ERROR Handling").join() === "d1", "phrase must lowercase like the index")
console.log("PASS: memory-search-followup")
