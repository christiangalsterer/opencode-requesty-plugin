/** @jsxImportSource @opentui/solid */
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
      if (settings.sidebar.enabled) {
        api.slots.register({
          order: settings.sidebar.order,
          slots: {
            sidebar_content(ctx, _slotProps) {
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
      }
      return
    }

    const store: RequestyStore = createRequestyStore({
      apiKey: key.apiKey,
      onError: (message) => {
        api.ui.toast({ variant: "error", title: "Requesty", message })
      },
    })

    // Sidebar widget
    if (settings.sidebar.enabled) {
      api.slots.register({
        order: settings.sidebar.order,
        slots: {
          sidebar_content(ctx, slotProps) {
            // Read host-tracked state to force sidebar slot repaints on session/message updates.
            api.state.session.messages(slotProps.session_id).length
            return (
              <RequestySidebarWidget
                store={store}
                api={api}
                sessionID={slotProps.session_id}
                theme={ctx.theme.current}
                maxModels={settings.sidebar.maxModels}
                thresholds={settings.thresholds}
                showTokens={settings.sidebar.showTokens}
              />
            )
          },
        },
      })
    }

    // Prompt indicator (right side of the session prompt)
    if (settings.prompt.enabled && settings.prompt.budgetIndicator) {
      api.slots.register({
        order: settings.prompt.order,
        slots: {
          session_prompt_right(ctx, slotProps) {
            return <RequestyPromptIndicator store={store} api={api} sessionID={slotProps.session_id} theme={ctx.theme.current} thresholds={settings.thresholds} todaySpend={settings.prompt.todaySpend} dailyAvg={settings.prompt.dailyAvg} avg7d={settings.prompt.avg7d} avg30d={settings.prompt.avg30d} showTokens={settings.prompt.showTokens} monthlyProjection={settings.prompt.monthlyProjection} />
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

    // Refresh triggers: startup, interval safety net, session lifecycle
    void store.refresh()

    const interval = setInterval(() => {
      void store.refresh()
    }, settings.refreshIntervalMs)

    const unsubSessionCreated = api.event.on("session.created", () => {
      void store.refresh()
    })

    const unsubSessionIdle = api.event.on("session.idle", () => {
      void store.refresh()
    })

    const unsubMessage = api.event.on("message.updated", () => {
      store.bumpVersion()
      void store.refresh()
    })

    api.lifecycle.onDispose(() => {
      clearInterval(interval)
      unsubSessionCreated()
      unsubSessionIdle()
      unsubMessage()
    })
  },
}

export default plugin
