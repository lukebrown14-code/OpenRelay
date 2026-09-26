Add support for `retry` configuration in `src/config/load.js` and
`src/client/create.js`. The new v2 form is `{retry:{attempts:number,delayMs:number}}`.
For existing v1 configs, `maxRetries` is an alias for attempts and `retryDelay`
is an alias for delayMs. Defaults are 2 attempts and 100ms. Explicit v2 fields
take precedence over v1 aliases, including zero. Reject negative or non-integer
values. The public `createClient(config)` must expose a normalized `retry` object;
preserve its `endpoint` property and do not mutate the input config. Run an
appropriate check.
