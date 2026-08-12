# opencode-requesty-plugin

An [opencode](https://opencode.ai) TUI plugin that shows your [Requesty.ai](https://www.requesty.ai) budget, current monthly spend, and per-model cost distribution right in the session prompt, in the session sidebar, plus a detail dialog via the `/requesty` slash command.

## What you get

**Sidebar widget** (session view):

```
Requesty (my-opencode-key)
▓▓▓▓░░░░░░░░░░░░ 24%
$12.34 / $50.00 / ~$25.50 EOM ↓
Today $3.20 / 7d $2.14 / 30d $1.05

Top models (Aug)
claude-sonnet-4-5            $8.20
  1.2M (↑1.0M ↓200k)
gpt-5                        $3.14
  410k (↑300k ↓110k)
gemini-2.5-pro               $1.00
  98k (↑80k ↓18k)
```

- Monthly spend vs. monthly limit (from `GET /v1/manage/apikey/self`), with projected month-end spend at the current run rate (`~$X EOM`). The pace marker shows ↑ over pace, → on pace, ↓ under pace; the projection turns red when it exceeds the limit.
- Daily spend trend: today / 7-day average / 30-day average
- Progress bar that turns yellow/red at configurable thresholds (default ≥70% / ≥90% of the limit)
- API key name shown in the header, linking to the Requesty analytics dashboard filtered by that key
- Top models by spend for the current month, with total tokens plus input (↑) / output (↓) breakdown

**Detail dialog** — run `/requesty` or pick *Requesty: show usage* from the command palette:

- Spend vs. limit, last-updated time
- Full per-model table: spend, share of total, tokens, request count
- `r` to refresh, `esc` to close

**Prompt indicator** — today's spend followed by a compact spend/limit readout on the right side of the session prompt (e.g. `$3.20 $12.34/$50.00 24%`, colored by the same thresholds). When `prompt.monthlyProjection` is enabled, a month-end projection (`~$X EOM ↑`) is always appended, colored red when the estimate exceeds the budget (e.g. `$3.20 $42.80/$50.00 86% (my-opencode-key) ~$53.07 EOM ↑`). Disable the readout with `"prompt": { "budgetIndicator": false }`.

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

Run `pnpm install && pnpm run build` in the checkout first.

## API key detection

The plugin reads your Requesty API key from the opencode provider config: `provider.requesty.options.apiKey` in `opencode.json`, including `{env:VAR}` interpolation.

```json
{
  "provider": {
    "requesty": {
      "options": { "apiKey": "sk-..." }
    }
  }
}
```

Or via an environment variable:

```json
{
  "provider": {
    "requesty": {
      "options": { "apiKey": "{env:REQUESTY_API_KEY}" }
    }
  }
}
```

If no key is found, the widget shows a short setup hint instead of failing.

## Options

| Option               | Type   | Default                          | Description                                                                 |
| -------------------- | ------ | -------------------------------- | --------------------------------------------------------------------------- |
| `baseUrl`            | string | `https://api-v2.requesty.ai`     | Management API base URL (e.g. for EU region)                                |
| `refreshIntervalMs`  | number | `300000` (5 min)                 | Periodic refresh interval (safety net)                                       |
| `maxModels`          | number | `5`                              | Number of models shown in the compact sidebar list                          |
| `warningThreshold`   | number | `0.7` (70%)                      | Budget usage ratio at which the bar turns yellow (accepts 0–1 or 0–100)     |
| `errorThreshold`     | number | `0.9` (90%)                      | Budget usage ratio at which the bar turns red (accepts 0–1 or 0–100)        |
| `prompt.enabled`          | boolean | `true`                          | Master switch for any prompt-area UI                                       |
| `prompt.budgetIndicator`| boolean | `true`                          | Show spend/limit readout on the right side of the session prompt           |
| `prompt.dailySpend`     | boolean | `true`                          | Show today's spend to the left of the budget indicator in the session prompt |
| `prompt.monthlyProjection` | boolean | `true`                        | Show a month-end projection (`~$X EOM ↑`) in the session prompt, red when the estimated spend exceeds the budget |

`warningThreshold` must be lower than `errorThreshold`; if the ordering is invalid, both fall back to the defaults (70%/90%). Values above `1` are treated as percents, e.g. `80` means 80%.

Data is refreshed on startup, on a periodic interval, when a new session is created, and when messages are updated.

## Requirements

- opencode ≥ 1.18 (TUI plugin API with slots)
- A Requesty API key — create one at [app.requesty.ai/api-keys](https://app.requesty.ai/api-keys)

## Development

```bash
pnpm install
pnpm run build       # bundle to dist/tui.js (tsup)
pnpm run typecheck   # tsc --noEmit over src/, test/ and tsup.config.ts
pnpm test            # unit tests via tsx + node:test
pnpm run dev         # watch-mode build
```

The project is fully typed TypeScript (`strict` mode). Sources live in `src/` (`.ts`/`.tsx`), tests in `test/`, and the build uses esbuild via `tsup` with the `@opentui/solid` JSX transform.

## License

MIT
