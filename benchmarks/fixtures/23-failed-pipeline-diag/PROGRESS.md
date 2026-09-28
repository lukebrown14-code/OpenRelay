Task: fix the totals drift in the CSV pipeline.

Attempt 1 (REJECTED): lowercased category keys in src/pipeline/aggregate.js. verify.js still failed AND case-sensitive grouping would drift. Reverted; do not reuse.

Actual finding (unconfirmed): src/pipeline/parse.js returns qty as a raw string, so totals concatenates instead of adding.

Status: fix NOT applied. Exact current failure: FAIL: parseRows must coerce qty to a number
