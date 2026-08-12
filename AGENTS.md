# AGENTS.md

opencode TUI plugin (single package, not a monorepo). Shows Requesty.ai monthly budget/spend in the session sidebar, plus a detail dialog via `/requesty`.

## Commands

Run every command with stdout and stderr piped to `/dev/null` for a quiet pass. If the exit code is non-zero, rerun the command **without** the redirect so the failure output is visible. Example: run `pnpm test >/dev/null 2>&1`; on failure rerun `pnpm test`.

## Development Instructions

- `pnpm run test` — node:test via tsx. The glob is intentionally **unquoted** (`tsx --test test/*.test.ts`): the shell must expand it, because Node 20's `--test` does not expand globs. Quoting it breaks with "Could not find ...".
- Run one test file: `pnpm exec tsx --test test/logic.test.ts`
- Verify changes: `pnpm run typecheck && pnpm test && pnpm run build` (no lint/format config exists). Pipe each command to `/dev/null` (`pnpm run typecheck >/dev/null 2>&1 && pnpm run test >/dev/null 2>&1 && pnpm run build >/dev/null 2>&1`); on non-zero exit rerun without the redirect.
- `pnpm run build` — tsup bundles `src/index.tsx` → `dist/tui.js`. `dist/` is the published/loaded artifact; always rebuild after source changes.


## Project Structure

- `src/index.tsx` — plugin entry (`TuiPluginModule`): slot registration (`sidebar_content`, `session_prompt_right`), keymap commands, refresh timers.
- `src/widget.tsx` / `src/dialog.tsx` — sidebar widget / detail dialog (Solid components); `RequestyPromptIndicator` renders the `session_prompt_right` indicator.
- `src/state.ts` — Solid store: fetch + refresh logic with in-flight dedup and pending-refresh pattern (injectable fetchers for tests).
- `src/settings.ts` — pure `readSettings` (option parsing + clamping/bounds); unit-tested.
- `src/api.ts` — Requesty Management API client (`apikey/self`, `apikey/self/usage`).
- `src/format.ts` — pure formatting helpers (all unit-tested logic lives here).
- `src/key.ts` — API key detection: reads `provider.*.options.apiKey` from the opencode provider config (incl. `{env:VAR}` interpolation and custom providers with a Requesty baseURL).
- `tsup.config.ts` — build config with babel-preset-solid esbuild plugin (NOT esbuild's built-in JSX transform — see gotchas). Uses `esbuildPlugins` option.
- `test/logic.test.ts` — `format.ts` + `api.ts` pure helpers.
- `test/settings.test.ts` — `readSettings` option parsing and bounds.
- `test/state.test.ts` — `createRequestyStore` refresh/in-flight/pending-refresh/error logic.

## Code Standards

- TypeScript `strict`, ESM, no semicolons (match existing style), 2-space indent.
- README contains the user-facing docs — update it when changing options, display output, or behavior (its ASCII sidebar example must match actual rendering).

## Hard-earned gotchas

- **JSX pragma is mandatory.** Every `.tsx` file needs `/** @jsxImportSource @opentui/solid */` on line 1 (tsup sets `jsxImportSource` globally, but tsc/`jsx: preserve` relies on the pragma). JSX tags are OpenTUI intrinsics (`<box>`, `<text>`), not DOM.
- **Tests are pure-logic only.** `@opentui/core/testing`'s `createTestRenderer` fails in Node ("native FFI is not available"), so TSX components (`widget.tsx`, `dialog.tsx`) are untested. Keep display logic in pure helpers in `src/format.ts` and test those in `test/logic.test.ts`.
- **API decimals are strings.** Requesty's management API serializes decimal fields as strings; coerce with `toNumber` in `src/api.ts` (there are tests relying on this).
- **`monthly_limit` of 0 means unlimited** — show "unlimited" and hide the progress bar; never divide by it (`spendRatio`/`formatLimit` in `src/format.ts` handle this).
- **Use babel-preset-solid, NOT esbuild's JSX transform.** esbuild's `jsx: "automatic"` compiles JSX to `jsx(Component, { children: staticValue })` — props are evaluated once, no reactivity. The host uses babel-preset-solid which wraps expressions in reactive getters (`_$effect`, `_$insert`) that re-evaluate when signals change. The build uses a custom esbuild plugin (via tsup's `esbuildPlugins` option) that transforms `.tsx` files with `babel-preset-solid` (`moduleName: "@opentui/solid"`, `generate: "universal"`) + `@babel/preset-typescript` before bundling. See `tsup.config.ts`. The `esbuildPlugins` option (NOT `plugins`) is what passes esbuild plugins through tsup.
- **The host resolves `solid-js` to the reactive client build.** The opencode host installs a Bun plugin (`@opentui/solid/scripts/solid-plugin.js`) that intercepts `solid-js/dist/server.js` at load time and swaps its content to `solid.js` (the reactive client build). It also registers `solid-js` and `@opentui/solid` as runtime modules. Keep `solid-js` and `@opentui/solid` external in tsup so the host provides them. Do NOT import from `solid-js/dist/solid.js` directly — this bypasses the host's interceptor and loads a separate instance (dual Solid = broken reactivity). Do NOT bundle `@opentui/solid` — the host needs to inject its own JSX runtime.
- **`peerDependencies` not needed.** devDependencies suffice. The host resolves external modules from its own `node_modules`, not the plugin's.
- **Debugging in TUI plugins.** `console.log` is invisible (TUI renderer captures stdout). Use `api.client.app.log({ service, level, message })` to write to the opencode application log (visible via `opencode log`).
- **Slot repaints require host-tracked reactivity.** Reading `api.state.session.messages(sessionID)` inside a `createMemo` whose result is consumed by JSX forces slot repaints when messages change. Signals created with `createSignal` in the store work for reactivity, but the slot must also read host-tracked state to trigger visual repaints. See `RequestyPromptIndicator` in `widget.tsx`.
- **`session.idle` IS emitted on the TUI event bus.** Confirmed by the working reference plugin. Use it as a refresh trigger for "message complete" events.
- **Pending refresh pattern.** When `refresh()` is called during an in-flight fetch, set a `pending` flag and trigger a follow-up refresh in the `finally` block. This prevents silently dropping the last `message.updated` event's data.


## References

Use the following repositories for documentation, working code examples and the opencodea-ai/plugin source before grepping node_modules.
- https://opentui.com/docs/getting-started/ (TUI plugin API)
- https://www.npmjs.com/package/@opencode-ai/plugin?activeTab=code (opencode plugin API types)
- https://github.com/streetturtle/opencode-better-sidebar/tree/main (example plugin with sidebar slot, keymap, and prompt slot)
- https://github.com/ZackarySantana/opencode-context (example plugin with context slot, keymap, and prompt slot)
- https://github.com/aamkye/opencode-tools (example plugin with sidebar slot, keymap, and prompt slot)
- https://github.com/njbraun/opencode-plugin-session-token-summary (example plugin with session token summary slot)
