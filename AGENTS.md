# AGENTS.md

opencode TUI plugin (single package, not a monorepo). Shows Requesty.ai monthly budget/spend in the session sidebar, plus a detail dialog via `/requesty`.

## Commands

- `pnpm test` — node:test via tsx. The glob is intentionally **unquoted** (`tsx --test test/*.test.ts`): the shell must expand it, because Node 20's `--test` does not expand globs. Quoting it breaks with "Could not find ...".
- Run one test file: `pnpm exec tsx --test test/logic.test.ts`
- Verify changes: `pnpm run typecheck && pnpm test && pnpm run build` (no lint/format config exists).
- `pnpm run build` — tsup bundles `src/index.tsx` → `dist/tui.js`. `dist/` is the published/loaded artifact; always rebuild after source changes.

## Hard-earned gotchas

- **Restart opencode to pick up changes.** The plugin is loaded from `dist/tui.js` once at startup. Edits + rebuild have no effect on a running TUI.
- **JSX pragma is mandatory.** Every `.tsx` file needs `/** @jsxImportSource @opentui/solid */` on line 1 (tsup sets `jsxImportSource` globally, but tsc/`jsx: preserve` relies on the pragma). JSX tags are OpenTUI intrinsics (`<box>`, `<text>`), not DOM.
- **Tests are pure-logic only.** `@opentui/core/testing`'s `createTestRenderer` fails in Node ("native FFI is not available"), so TSX components (`widget.tsx`, `dialog.tsx`) are untested. Keep display logic in pure helpers in `src/format.ts` and test those in `test/logic.test.ts`.
- **API decimals are strings.** Requesty's management API serializes decimal fields as strings; coerce with `toNumber` in `src/api.ts` (there are tests relying on this).
- **`monthly_limit` of 0 means unlimited** — show "unlimited" and hide the progress bar; never divide by it (`spendRatio`/`formatLimit` in `src/format.ts` handle this).

## Structure

- `src/index.tsx` — plugin entry (`TuiPluginModule`): slot registration (`sidebar_content`, `session_prompt_right`), keymap commands, refresh timers.
- `src/widget.tsx` / `src/dialog.tsx` — sidebar widget / detail dialog (Solid components); `RequestyPromptIndicator` renders the `session_prompt_right` indicator.
- `src/state.ts` — Solid store: fetch + refresh/debounce logic (injectable fetchers for tests).
- `src/settings.ts` — pure `readSettings` (option parsing + clamping/bounds); unit-tested.
- `src/api.ts` — Requesty Management API client (`apikey/self`, `apikey/self/usage`).
- `src/format.ts` — pure formatting helpers (all unit-tested logic lives here).
- `src/key.ts` — API key detection: reads `provider.*.options.apiKey` from the opencode provider config (incl. `{env:VAR}` interpolation and custom providers with a Requesty baseURL).
- `test/logic.test.ts` — `format.ts` + `api.ts` pure helpers.
- `test/settings.test.ts` — `readSettings` option parsing and bounds.
- `test/state.test.ts` — `createRequestyStore` refresh/debounce/in-flight/error-dedup logic.

## Conventions

- TypeScript `strict`, ESM, no semicolons (match existing style), 2-space indent.
- README contains the user-facing docs — update it when changing options, display output, or behavior (its ASCII sidebar example must match actual rendering).


## References

Use the following repositories for working code examples before grepping node_modules and the source code of opencode.
- https://github.com/streetturtle/opencode-better-sidebar/tree/main
- https://github.com/ZackarySantana/opencode-context
- https://github.com/aamkye/opencode-tools
- https://github.com/njbraun/opencode-plugin-session-token-summary


