# Use one active config path for model-picker changes

Delta's model picker can change the selected model, a task route, the provider,
and per-plugin model overrides. These changes must all use the active config
path and the shared config mutation behavior. In an isolated workspace with a
custom config path, none of these operations may create or modify a separate
`config.toml` in the current directory. Preserve unrelated settings and the
existing model-routing precedence.

Run the relevant offline tests. Keep secrets out of configuration files.
