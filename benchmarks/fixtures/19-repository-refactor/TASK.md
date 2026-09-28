# Task: Consolidate feature flag decisions

The web and worker entry points each decide whether the audit feature is enabled, and disagree on string values. Introduce one shared decision function and use it in both live entry points. Values true, 1 and "on" (case insensitive) enable audit; false, 0, "off", null and missing values disable it. The web view exposes a boolean `auditEnabled`; the worker returns "audit-on" or "audit-off". Keep the unrelated payments flag and archived rollout code unchanged. Do not edit verify.js. Run node verify.js.
