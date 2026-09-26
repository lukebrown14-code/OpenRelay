Accepted plan: add config hot-reload.

1. src/config/loader.js: export reloadConfig(path?) that re-reads the config file and returns the merged config (defaults still apply).
2. src/render/panel.js: export refresh() that reloads and returns the current config (panels included).

MANDATORY CONSTRAINT: formatV1 output must stay byte-identical — the trailing #v1 line is load-bearing (external dashboards grep for it). Do not 'clean it up'.

Acceptance: node verify.js exits 0.
