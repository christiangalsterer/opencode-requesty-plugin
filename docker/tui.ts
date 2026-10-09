import { Plugin } from '@opencode/plugin/tui'

export default Plugin.define({
  id: 'requesty.local-docker-test',
  async setup(context) {
    const requestyPluginPath = '/home/harness/plugin/dist/tui.js'
    const { default: requestyPlugin } = await import(requestyPluginPath)
    return requestyPlugin.setup(context)
  }
})
