# AGENTS.md

opencode TUI plugin. Shows Requesty.ai monthly budget/spend in the session sidebar, plus a detail dialog via `/requesty`.

## Output Guidelines

Do NOT include code changes, diffs of changes, code examples or patch output in responses unless the user explicitly asks for them.

## Commands

Run every command with `>/dev/null 2>&1` for a quiet pass. If the exit code is non-zero, rerun the command **without** the redirect so the failure output is visible. Example: run `bun run test >/dev/null 2>&1`; on failure rerun `bun run test`.

## Development Instructions

- Install dependencies: `bun install`
- Format code: `bun run format:fix`
- Run type-checking: `bun run typecheck`
- Run tests: `bun run test`
- Build plugin: `bun run build`
- Verify all: `bun run format:fix && bun run typecheck && bun run test && bun run build`

## Verification Procedure

Before marking any task as `completed`, the following command chain must be executed successfully:

`bun run format:fix >/dev/null 2>&1 && bun run typecheck >/dev/null 2>&1 && bun run test >/dev/null 2>&1 && bun run build >/dev/null 2>&1`

(If the exit code is non-zero, rerun the command chain without the redirects to diagnose the failure. Example: `bun run format:fix && bun run typecheck && bun run test && bun run build`)

## Project Structure

- `src/tui.tsx` — plugin entry (`TuiPluginModule`): slot registration (`sidebar_content`, `session_prompt_right`), keymap commands, refresh timers.
- `src/widget.tsx` / `src/dialog.tsx` — sidebar widget / detail dialog (Solid components); `RequestyPromptIndicator` renders the `session_prompt_right` indicator.
- `src/state.ts` — Solid store: fetch + refresh logic with in-flight dedup and pending-refresh pattern (injectable fetchers for tests).
- `src/settings.ts` — pure `readSettings` (option parsing + clamping/bounds); unit-tested.
- `src/api.ts` — Requesty Management API client (`apikey/self`, `apikey/self/usage`).
- `src/format.ts` — pure formatting helpers (all unit-tested logic lives here).
- `src/key.ts` — API key detection: reads `provider.*.options.apiKey` from the opencode provider config (incl. `{env:VAR}` interpolation and custom providers with a Requesty baseURL).
- `bunfig.toml` — Bun config (preload for standalone dev, test settings).
- `test/logic.test.ts` — `format.ts` + `api.ts` pure helpers.
- `test/settings.test.ts` — `readSettings` option parsing and bounds.
- `test/state.test.ts` — `createRequestyStore` refresh/in-flight/pending-refresh/error logic.

## Coding Standards

- TypeScript `strict`, ESM, no semicolons (match existing style), 2-space indent.
- README contains the user-facing docs — update it when changing options, display output, or behavior (its ASCII sidebar example must match actual rendering).

## Hard-earned gotchas

- **JSX pragma is mandatory.** Every `.tsx` file needs `/** @jsxImportSource @opentui/solid */` on line 1 (tsc/`jsx: preserve` relies on the pragma). JSX tags are OpenTUI intrinsics (`<box>`, `<text>`), not DOM.
- **No bundler — the host transforms TSX at load time.** The opencode host installs `@opentui/solid/preload` (a Bun preload hook) that transforms Solid TSX via babel-preset-solid (`moduleName: "@opentui/solid"`, `generate: "universal"`) before execution. The build step just copies `src/*` → `dist/`. Do NOT use a bundler (tsup, esbuild, Bun.build) — it would strip the `/** @jsxImportSource */` pragma or break reactivity by using the wrong JSX transform.
- **Tests are pure-logic only.** `@opentui/core/testing`'s `createTestRenderer` fails in Node ("native FFI is not available"), so TSX components (`widget.tsx`, `dialog.tsx`) are untested. Keep display logic in pure helpers in `src/format.ts` and test those in `test/logic.test.ts`.
- **bun:test mock API differs from node:test.** Use `mock(() => {})` instead of `mock.fn()`. Access call count via `.mock.calls.length` (not `.mock.callCount()`). Access call arguments via `.mock.calls[i][j]` (not `.mock.calls[i].arguments[j]`).
- **API decimals are strings.** Requesty's management API serializes decimal fields as strings; coerce with `toNumber` in `src/api.ts` (there are tests relying on this).
- **`monthly_limit` of 0 means unlimited** — show "unlimited" and hide the progress bar; never divide by it (`spendRatio`/`formatLimit` in `src/format.ts` handle this).
- **The host resolves `solid-js` to the reactive client build.** The opencode host installs a Bun plugin (`@opentui/solid/scripts/solid-plugin.js`) that intercepts `solid-js/dist/server.js` at load time and swaps its content to `solid.js` (the reactive client build). It also registers `solid-js` and `@opentui/solid` as runtime modules. Keep `solid-js` and `@opentui/solid` as devDependencies — the host provides them at runtime. Do NOT import from `solid-js/dist/solid.js` directly — this bypasses the host's interceptor and loads a separate instance (dual Solid = broken reactivity).
- **`peerDependencies` are required for npm installs.** OpenCode installs plugins into an isolated cache and resolves host packages from that cache. Declare `@opencode-ai/plugin`, `@opentui/*`, and `solid-js` as `peerDependencies` so they are installed alongside the plugin. `devDependencies` still suffice for local development and tests.
- **Debugging in TUI plugins.** `console.log` is invisible (TUI renderer captures stdout). Use `api.client.app.log({ service, level, message })` to write to the opencode application log (visible via `opencode log`).
- **Slot repaints require host-tracked reactivity.** Reading `api.state.session.messages(sessionID)` inside a `createMemo` whose result is consumed by JSX forces slot repaints when messages change. Signals created with `createSignal` in the store work for reactivity, but the slot must also read host-tracked state to trigger visual repaints. See `RequestyPromptIndicator` in `widget.tsx`.
- **`session.idle` IS emitted on the TUI event bus.** Confirmed by the working reference plugin. Use it as a refresh trigger for "message complete" events.
- **Pending refresh pattern.** When `refresh()` is called during an in-flight fetch, set a `pending` flag and trigger a follow-up refresh in the `finally` block. This prevents silently dropping the last `message.updated` event's data.


## References

For any library, framework, SDK, API, CLI tool, or cloud service documentation, **consult the Context7 MCP server first** (`resolve-library-id` → `query-docs`) to fetch current docs, even for well-known packages — training data may be stale. Only fall back to the URLs below if Context7 lacks the package or returns insufficient detail.

Use the following repositories for documentation, working code examples.
- https://opentui.com/docs/getting-started/ (TUI plugin API)
- https://github.com/anomalyco/opencode/blob/dev/packages/opencode/specs/tui-plugins.md (TUI plugin API spec)
- https://www.npmjs.com/package/@opencode-ai/plugin?activeTab=code (opencode plugin API types)
- https://github.com/msmps/opentui-skill (opencode skill providing a comprehensive documentation and example of TUI plugin usage)
- https://github.com/streetturtle/opencode-better-sidebar/tree/main (example plugin with sidebar slot, keymap, and prompt slot)
- https://github.com/ZackarySantana/opencode-context (example plugin with context slot, keymap, and prompt slot)
- https://github.com/aamkye/opencode-tools (example plugin with sidebar slot, keymap, and prompt slot)
- https://github.com/njbraun/opencode-plugin-session-token-summary (example plugin with session token summary slot)
- https://github.com/edso404/oh-my-sidebar (example plugin with sidebar slot, collapsible sidebar))
