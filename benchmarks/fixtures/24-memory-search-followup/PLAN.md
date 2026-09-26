Accepted plan: add phrase search.

1. src/search/index.js: export searchPhrase(index, phrase) that returns doc ids whose tokens contain the phrase tokens CONSECUTIVELY (in order).
2. Keep search() semantics unchanged.

Acceptance: node verify.js exits 0.
