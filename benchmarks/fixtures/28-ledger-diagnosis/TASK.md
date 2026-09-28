Fix the monthly ledger's incorrect net totals. The parser, normalizer, and
aggregator are separate modules. Amounts arrive as decimal strings, and refunds
must subtract from totals. Preserve case-sensitive account IDs (`Sales` and
`sales` are distinct) and reject malformed amount values rather than producing
`NaN` totals. Keep the existing `summarize` API. Run an appropriate check.
