# opencode-requesty-plugin

An [opencode](https://opencode.ai) TUI plugin that shows your [Requesty.ai](https://www.requesty.ai) budget, current monthly spend, and per-model cost distribution right in the session sidebar — plus a detail dialog via the `/requesty` slash command.

## What you get

**Sidebar widget** (session view):

```
Requesty (my-opencode-key)
$12.34 / $50.00
▓▓▓▓░░░░░░░░░░░░ 24%

Top models (Aug)
claude-sonnet-4-5            $8.20
  1.2M (↑1.0M ↓200k)
gpt-5                        $3.14
  410k (↑300k ↓110k)
gemini-2.5-pro               $1.00
  98k (↑80k ↓18k)
```

- Monthly spend vs. monthly limit (from `GET /v1/manage/apikey/self`)
- Progress bar that turns yellow/red at configurable thresholds (default ≥70% / ≥90% of the limit)
- API key name shown in the header, linking to the Requesty analytics dashboard filtered by that key
- Top models by spend for the current month, with total tokens plus input (↑) / output (↓) breakdown

**Detail dialog** — run `/requesty` or pick *Requesty: show usage* from the command palette:

- Key summary (name, spend/limit, last-updated time)
- Full per-model table: spend, share of total, tokens, request count
- `r` to refresh, `esc` to close

Data comes from the [Requesty Management API](https://docs.requesty.ai/api-reference/management-apis) (`apikey/self` + `apikey/self/usage` grouped by `model_used`, current calendar month).

## Installation

Add the plugin to your `opencode.json` (project root or `~/.config/opencode/opencode.json`):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-requesty-plugin"]
}
```

Or with options:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    [
      "opencode-requesty-plugin",
      {
        "refreshIntervalMs": 300000,
        "maxModels": 5,
        "warningThreshold": 0.6,
        "errorThreshold": 0.85
      }
    ]
  ]
}
```

Restart opencode after changing the config — plugins are loaded at startup.

### Local development install

Point at a local checkout instead:

```json
{
  "plugin": ["file:///absolute/path/to/opencode-requesty-plugin/dist/tui.js"]
}
```

Run `npm install && npm run build` in the checkout first.

## API key detection

The plugin needs your Requesty API key. It is resolved in this order (first match wins):

1. **Plugin options**: `"plugin": [["opencode-requesty-plugin", { "apiKey": "sk-..." }]]`
2. **Environment variable**: `REQUESTY_API_KEY` (the canonical variable opencode's Requesty provider uses)
3. **opencode provider config**: `provider.requesty.options.apiKey` in `opencode.json`, including `{env:VAR}` interpolation

If no key is found, the widget shows a short setup hint instead of failing.

> The plugin intentionally does **not** read opencode's `auth.json` credential store.

## Options

| Option               | Type   | Default                          | Description                                                                 |
| -------------------- | ------ | -------------------------------- | --------------------------------------------------------------------------- |
| `apiKey`             | string | —                                | Requesty API key (overrides env/config detection)                           |
| `baseUrl`            | string | `https://api-v2.requesty.ai`     | Management API base URL (e.g. for EU region)                                |
| `refreshIntervalMs`  | number | `300000` (5 min)                 | Periodic refresh interval                                                   |
| `activityDebounceMs` | number | `30000`                          | Minimum gap between activity-triggered refreshes                            |
| `maxModels`          | number | `5`                              | Number of models shown in the compact sidebar list                          |
| `warningThreshold`   | number | `0.7` (70%)                      | Budget usage ratio at which the bar turns yellow (accepts 0–1 or 0–100)     |
| `errorThreshold`     | number | `0.9` (90%)                      | Budget usage ratio at which the bar turns red (accepts 0–1 or 0–100)        |

`warningThreshold` must be lower than `errorThreshold`; if the ordering is invalid, both fall back to the defaults (70%/90%). Values above `1` are treated as percents, e.g. `80` means 80%.

Data is refreshed on startup, on the interval above, and (debounced) after session activity such as completed messages.

## Requirements

- opencode ≥ 1.18 (TUI plugin API with slots)
- A Requesty API key — create one at [app.requesty.ai/api-keys](https://app.requesty.ai/api-keys)

## Development

```bash
npm install
npm run build       # bundle to dist/tui.js (tsup)
npm run typecheck   # tsc --noEmit over src/, test/ and tsup.config.ts
npm test            # unit tests via tsx + node:test
npm run dev         # watch-mode build
```

The project is fully typed TypeScript (`strict` mode). Sources live in `src/` (`.ts`/`.tsx`), tests in `test/`, and the build uses esbuild via `tsup` with the `@opentui/solid` JSX transform.

## License

MIT
