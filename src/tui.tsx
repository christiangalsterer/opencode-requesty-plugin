/** @jsxImportSource @opentui/solid */

/**
 * OpenCode 1.x loads `tui`; OpenCode 2.x loads `setup`. Keep both keys on the
 * same default export so the package's `./tui` entrypoint remains stable.
 */
export default {
  id: 'opencode-requesty-plugin',
  async tui(api: import('@opencode-ai/plugin/tui').TuiPluginApi, options: Record<string, unknown> | undefined) {
    const { runV1 } = await import('./tui-v1')
    runV1(api, options)
  },
  async setup(context: import('@opencode/plugin/tui/context').Context) {
    const { runV2 } = await import('./tui-v2')
    return runV2(context)
  }
}
