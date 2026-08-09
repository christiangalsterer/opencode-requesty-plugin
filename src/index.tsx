import type { TuiPluginModule } from "@opencode-ai/plugin/tui"
import { detectApiKey } from "./key"
import { createRequestyStore, type RequestyStore } from "./state"
import { RequestySidebarWidget } from "./widget"
import { RequestyDetailDialog } from "./dialog"
import { DEFAULT_BASE_URL } from "./api"
import { resolveThresholds, type SpendThresholds } from "./format"

const PLUGIN_ID = "opencode-requesty-sidebar"
const COMMAND_OPEN = "requesty.open"
const COMMAND_REFRESH = "requesty.refresh"

const DEFAULT_REFRESH_INTERVAL_MS = 5 * 60 * 1000
const DEFAULT_ACTIVITY_DEBOUNCE_MS = 30 * 1000
const DEFAULT_MAX_MODELS = 5

type PluginSettings = {
  apiKey?: string
  baseUrl: string
  refreshIntervalMs: number
  activityDebounceMs: number
  maxModels: number
  thresholds: SpendThresholds
}

function readSettings(options: Record<string, unknown> | undefined): PluginSettings {
  return {
    apiKey: typeof options?.apiKey === "string" && options.apiKey.length > 0 ? options.apiKey : undefined,
    baseUrl: typeof options?.baseUrl === "string" && options.baseUrl.length > 0 ? options.baseUrl : DEFAULT_BASE_URL,
    refreshIntervalMs:
      typeof options?.refreshIntervalMs === "number" && options.refreshIntervalMs > 0 ? options.refreshIntervalMs : DEFAULT_REFRESH_INTERVAL_MS,
    activityDebounceMs:
      typeof options?.activityDebounceMs === "number" && options.activityDebounceMs > 0
        ? options.activityDebounceMs
        : DEFAULT_ACTIVITY_DEBOUNCE_MS,
    maxModels: typeof options?.maxModels === "number" && options.maxModels > 0 ? Math.floor(options.maxModels) : DEFAULT_MAX_MODELS,
    thresholds: resolveThresholds(options?.warningThreshold, options?.errorThreshold),
  }
}

const plugin: TuiPluginModule = {
  id: PLUGIN_ID,
  tui: async (api, rawOptions) => {
    const settings = readSettings(rawOptions)

    const key = detectApiKey(rawOptions, api.state.config)
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
                <text fg={ctx.theme.current.textMuted}>Set REQUESTY_API_KEY or run /connect.</text>
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
