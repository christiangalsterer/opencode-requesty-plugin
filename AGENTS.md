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

## Architecture

- This is a TUI plugin for the opencode.
- It uses Solid.js for reactive rendering.

## Project Structure

- `src/tui.tsx` — plugin entry (`TuiPluginModule`): slot registration (`sidebar_content`, `session_prompt_right`), keymap commands, refresh timers.
- `src/widget.tsx` / `src/prompt.tsx` / `src/dialog.tsx` — sidebar widget / prompt widget / detail dialog (Solid components); `RequestyPromptWidget` renders the `session_prompt_right` indicator.
- `src/state.ts` — Solid store: fetch + refresh logic with in-flight dedup and pending-refresh pattern (injectable fetchers and `createSignal` for tests/host instance).
- `src/descendants.ts` — pure BFS walk of the sub-agent delegation tree (`descendantSessionIDs`) and upward root walk (`rootSessionID`); unit-tested.
- `src/route.ts` — pure `sessionIDFromRoute` (extracts the active session id from the host route); unit-tested.
- `src/settings.ts` — pure `readSettings` (option parsing + clamping/bounds); unit-tested.
- `src/api.ts` — Requesty Management API client (`apikey/self`, `apikey/self/usage`).
- `src/format.ts` — pure formatting helpers (all unit-tested logic lives here).
- `src/key.ts` — API key detection: reads `provider.*.options.apiKey` from the opencode provider config (incl. `{env:VAR}` interpolation and custom providers with a Requesty baseURL).
- `bunfig.toml` — Bun config (preload for standalone dev, test settings).
- `test/logic.test.ts` — `format.ts` + `api.ts` pure helpers.
- `test/settings.test.ts` — `readSettings` option parsing and bounds.
- `test/state.test.ts` — `createRequestyStore` refresh/in-flight/pending-refresh/error logic.
- `test/descendants.test.ts` — `descendantSessionIDs` BFS (tree walk, dedup, cap, error fallback).
- `test/route.test.ts` — `sessionIDFromRoute` route → session id extraction.
- `test/prompt.test.tsx` / `test/widget.test.tsx` / `test/dialog.test.tsx` — render-level assertions on the Solid components via `@opentui/solid`'s `testRender`.

## Coding Standards

- TypeScript `strict`, ESM, no semicolons (match existing style), 2-space indent.
- README contains the user-facing docs — update it when changing options, display output, or behavior (its ASCII sidebar example must match actual rendering).

## Hard-earned gotchas

- **JSX pragma is mandatory.** Every `.tsx` file needs `/** @jsxImportSource @opentui/solid */` on line 1 (tsc/`jsx: preserve` relies on the pragma). JSX tags are OpenTUI intrinsics (`<box>`, `<text>`), not DOM.
- **No bundler — the host transforms TSX at load time.** The opencode host installs `@opentui/solid/preload` (a Bun preload hook) that transforms Solid TSX via babel-preset-solid (`moduleName: "@opentui/solid"`, `generate: "universal"`) before execution. The build step just copies `src/*` → `dist/`. Do NOT use a bundler (tsup, esbuild, Bun.build) — it would strip the `/** @jsxImportSource */` pragma or break reactivity by using the wrong JSX transform.
- **Component tests render under Bun, not Node.** `@opentui/solid`'s `testRender` (backed by `@opentui/core/testing`) mounts Solid TSX and captures frames; the old "native FFI is not available" failure only applied to the pre-Bun Node/`tsx --test` setup. `bunfig.toml` must preload `@opentui/solid/preload` **under `[test]` as well as top-level** — the top-level `preload` alone does NOT apply to `bun test`, and without the `[test]` entry `solid-js` resolves to its server build (`Show` returns `""` for a falsy `when` with no fallback → "Orphan text error" from the reconciler). Stub the host API as `{ state: { session: { messages: () => [] } } }`, call `setup.renderer.destroy()` in a `finally`, and assert whitespace-normalized substrings of `captureCharFrame()` (not full-frame snapshots). Keep display logic in pure helpers in `src/format.ts` (tested in `test/logic.test.ts`); host-driven slot repaint/re-invocation remains untestable.
- **bun:test mock API differs from node:test.** Use `mock(() => {})` instead of `mock.fn()`. Access call count via `.mock.calls.length` (not `.mock.callCount()`). Access call arguments via `.mock.calls[i][j]` (not `.mock.calls[i].arguments[j]`).
- **API decimals are strings.** Requesty's management API serializes decimal fields as strings; coerce with `toNumber` in `src/api.ts` (there are tests relying on this).
- **`monthly_limit` of 0 means unlimited** — show "unlimited" and hide the progress bar; never divide by it (`spendRatio`/`formatLimit` in `src/format.ts` handle this).
- **The host resolves `solid-js` to the reactive client build.** The opencode host installs a Bun plugin (`@opentui/solid/scripts/solid-plugin.js`) that intercepts `solid-js/dist/server.js` at load time and swaps its content to `solid.js` (the reactive client build). It also registers `solid-js` and `@opentui/solid` as runtime modules. Keep `solid-js` and `@opentui/solid` as devDependencies — the host provides them at runtime. Do NOT import from `solid-js/dist/solid.js` directly — this bypasses the host's interceptor and loads a separate instance (dual Solid = broken reactivity).
- **`peerDependencies` are required for npm installs.** OpenCode installs plugins into an isolated cache and resolves host packages from that cache. Declare `@opencode-ai/plugin`, `@opentui/*`, and `solid-js` as `peerDependencies` so they are installed alongside the plugin. `devDependencies` still suffice for local development and tests.
- **Debugging in TUI plugins.** `console.log` is invisible (TUI renderer captures stdout). Use `api.client.app.log({ service, level, message })` to write to the opencode application log (visible via `opencode log`). Always log at `level: 'info'` — `debug` entries are not written to the application log.
- **Slot repaints require host-tracked reactivity.** Reading `api.state.session.messages(sessionID)` inside a `createMemo` whose result is consumed by JSX forces slot repaints when messages change. Signals created with `createSignal` in the store work for reactivity, but the slot must also read host-tracked state to trigger visual repaints. Confirmed at the component level: `test/widget.test.tsx` mounts the widget with a plugin-owned `tick` signal and proves both that the repaint memo re-evaluates and that the captured frame changes (`$2.50` → `$7.50`) after `setTick` — so within a live subtree, plugin-owned signals do repaint.
- **Slot re-invocation is host-driven only.** Each `sidebar_content` slot factory invocation creates a fresh subtree; the widget's Solid subscriptions (`createEffect`, `createMemo`, `<Show>` reactivity) are disposed at the end of the invocation and do NOT survive to see plugin-owned signal updates that happen later. Investigated exhaustively (`api.renderer.requestRender()`, `api.keymap.runCommand()`, `api.theme.set()`, reading store signals in the slot factory) — none re-invoke the factory. Only these host events do: real user input (mouse/keyboard), `slotProps.session_id` changing, and host-tracked signal changes the slot factory subscribed to (typically `api.state.session.messages(...)`). The slot factory itself is therefore re-invoked on host events; within the live subtree, plugin-owned signals (a `tick` heartbeat, the store's injected-instance signals) re-evaluate the widget memo and repaint (see the two bullets below). The per-session cache in `src/state.ts` additionally publishes a revisited session's figures synchronously in `setSessionID`, so the current slot invocation renders them instead of the loading placeholder.
- **Store signals must be created by the host's Solid instance.** `state.ts` is a `.ts` module; its `import { createSignal } from 'solid-js'` resolves to a **different Solid runtime copy** than the one the host renders the plugin's `.tsx` widgets with. Signals from that copy are *read* correctly by the widget's `createMemo` but **never subscribed** — so `setData`/`setState` after an async refresh do NOT re-run the widget memo and the sidebar never repaints on refresh completion (the "Session cost loading…" placeholder persists until the next host event). Diagnosed by logging memo evaluations: after `refresh ok … requestRender`, no memo re-run appeared until the plugin-owned `tick` fired 60s later, at which point it read the fresh data. Fix: `RequestyStoreOptions.createSignal` is injectable, and `tui.tsx` passes its own `createSignal` (the widget's instance, proven by the `tick` heartbeat) into `createRequestyStore`. `test/widget.test.tsx` covers a real store refresh repainting without a tick, but note that under `bun test` both modules resolve to the same `solid-js`, so the test cannot reproduce the host's dual-instance condition — the manual check is the real proof.
- **Repaint requests must be deferred past the Solid flush.** `state.ts` calls `options.onRender?.()` (→ `api.renderer.requestRender()`) from a `setTimeout(..., 0)` (`RENDER_REQUEST_DELAY_MS`), not synchronously after `setData`. Solid flushes signal subscribers in a microtask, so a synchronous request draws a frame *before* the widget memo observes the new data and nothing requests a second frame. `test/state.test.ts` awaits a macrotask before asserting `onRender` was called.
- **Plugin-owned `tick` heartbeat.** `src/tui.tsx` owns a `tick` signal bumped every `TICK_INTERVAL_MS` (60s) and passes it into `RequestySidebarWidget`; the widget reads `props.tick?.()` inside its repaint memo. This (a) keeps time-derived values fresh and (b) lets a timer (macrotask) update re-evaluate the memo without host input. `test/widget.test.tsx` proves the frame changes (`$2.50` → `$7.50`) after a store update plus `setTick`.
- **`session.idle` IS emitted on the TUI event bus.** Confirmed by the working reference plugin. Use it as a refresh trigger for "message complete" events.
- **Pending refresh pattern.** When `refresh()` is called during an in-flight fetch, set a `pending` flag and trigger a follow-up refresh in the `finally` block. This prevents silently dropping the last `message.updated` event's data.


## References

For **source code** information, use GitHub. If the URL is not known, ask the user — never guess. The opencode source code can be found at https://github.com/anomalyco/opencode

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
