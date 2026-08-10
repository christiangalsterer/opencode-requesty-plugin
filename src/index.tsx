import type { TuiPluginModule } from "@opencode-ai/plugin/tui"
import { detectApiKey } from "./key"
import { createRequestyStore, type RequestyStore } from "./state"
import { RequestySidebarWidget, RequestyPromptIndicator } from "./widget"
import { RequestyDetailDialog } from "./dialog"
import { readSettings } from "./settings"

const PLUGIN_ID = "opencode-requesty-sidebar"
const COMMAND_OPEN = "requesty.open"
const COMMAND_REFRESH = "requesty.refresh"

const plugin: TuiPluginModule = {
  id: PLUGIN_ID,
  tui: async (api, rawOptions) => {
    const settings = readSettings(rawOptions)

    const key = detectApiKey(api.state.config)
    if (!key.ok) {
      api.slots.register({
        order: 60,
        slots: {
          sidebar_content(ctx) {
            return (
              <box flexDirection="column" paddingTop={1}>
                <text fg={ctx.theme.current.textMuted}>
                  <strong>Requesty</strong>
                </text>
                <text fg={ctx.theme.current.textMuted}>No API key found.</text>
                <text fg={ctx.theme.current.textMuted}>Add provider.requesty.options.apiKey to opencode.json.</text>
              </box>
            )
          },
        },
      })
      return
    }

    const store: RequestyStore = createRequestyStore({
      apiKey: key.apiKey,
      baseUrl: settings.baseUrl,
      activityDebounceMs: settings.activityDebounceMs,
      onError: (message) => {
        api.ui.toast({ variant: "error", title: "Requesty", message })
      },
    })

    // Sidebar widget
    api.slots.register({
      order: 60,
      slots: {
        sidebar_content(ctx) {
          return <RequestySidebarWidget store={store} theme={ctx.theme.current} maxModels={settings.maxModels} thresholds={settings.thresholds} />
        },
      },
    })

    // Prompt indicator (right side of the session prompt)
    if (settings.prompt.enabled && settings.prompt.budgetIndicator) {
      api.slots.register({
        order: 60,
        slots: {
          session_prompt_right(ctx) {
            return <RequestyPromptIndicator store={store} theme={ctx.theme.current} thresholds={settings.thresholds} />
          },
        },
      })
    }

    // Detail dialog
    const openDialog = () => {
      api.ui.dialog.replace(() => (
        <RequestyDetailDialog
          store={store}
          theme={api.theme.current}
          thresholds={settings.thresholds}
          onClose={() => api.ui.dialog.clear()}
          onRefresh={() => void store.refresh()}
        />
      ))
      api.ui.dialog.setSize("large")
      void store.refresh()
    }

    // Commands (command palette + slash command)
    api.keymap.registerLayer({
      commands: [
        {
          name: COMMAND_OPEN,
          title: "Requesty: show usage",
          desc: "Show Requesty.ai budget, spend and per-model costs",
          category: "Requesty",
          namespace: "palette",
          slashName: "requesty",
          run: () => {
            openDialog()
          },
        },
        {
          name: COMMAND_REFRESH,
          title: "Requesty: refresh usage",
          desc: "Refresh Requesty.ai usage data",
          category: "Requesty",
          namespace: "palette",
          run: () => {
            void store.refresh()
          },
        },
      ],
    })

    // Refresh triggers: startup, interval, session activity (debounced)
    void store.refresh()

    const interval = setInterval(() => {
      void store.refresh()
    }, settings.refreshIntervalMs)

    const unsubMessage = api.event.on("message.updated", () => {
      store.refreshFromActivity()
    })

    api.lifecycle.onDispose(() => {
      clearInterval(interval)
      unsubMessage()
    })
  },
}

export default plugin
