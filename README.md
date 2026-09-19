# OpenRelay

A token-efficient orchestration layer for [OpenCode](https://opencode.ai): maximize
useful completed coding work per scarce premium-model token, without forking OpenCode.

- **Workhorse:** GLM Coding Plan for routine volume
- **Premium:** ChatGPT subscription (OAuth, no API/PAYG billing) for planning, review, escalation
- **Method:** deterministic routing, adaptive context, tool-output filtering, structured
  handoffs, verification gates — every optimization gated by measured benchmarks

Built as a global OpenCode plugin plus lightweight configuration. See
[docs/token-efficient-architecture.md](docs/token-efficient-architecture.md) for the full
design and [docs/stage0-capability-matrix.md](docs/stage0-capability-matrix.md) for the
verified OpenCode extension surface.

## Status

Stage 1 (Baseline & Observability) — telemetry plugin + benchmark corpus + A/A
calibration harness. Routing, context engine, memory/handoffs arrive in later stages.

## Layout

```
plugins/token-efficient/   OpenCode plugin: Task Controller, Context Engine,
                           Shared Project Memory, handoffs, telemetry (built up by stage)
benchmarks/                fixture corpus (4 task classes), runner, A/A analyzer
docs/                      architecture plan + Stage 0 capability matrix
```

## Install (global)

```sh
git clone https://github.com/lukebrown14-code/OpenRelay.git ~/src/OpenRelay

# link the plugin into the OpenCode global config
ln -s ~/src/OpenRelay/plugins/token-efficient ~/.config/opencode/plugins/token-efficient
```

Register in `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [["./plugins/token-efficient/index.ts", { "telemetry": { "enabled": true } }]]
}
```

Restart OpenCode. Telemetry lands in `~/.local/share/opencode/token-efficient/`.

## Benchmarks

```sh
cd benchmarks
node run.mjs --fixture all --runs 3 --model zai-coding-plan/glm-5.3-flash --label aa-1
node run.mjs --fixture all --runs 3 --model zai-coding-plan/glm-5.3-flash --label aa-1b
node analyze.mjs aa-1 aa-1b   # A/A noise floor; INCONCLUSIVE ⇒ don't add complexity
```

See [benchmarks/README.md](benchmarks/README.md).

## Development

```sh
bun install          # @opencode-ai/plugin + @types/node
bunx tsc -p plugins/token-efficient/tsconfig.json
```

Plugin/config changes require an OpenCode restart to take effect.
