/** @jsxImportSource @opentui/solid */
import type { TuiPluginModule } from '@opencode-ai/plugin/tui'
import { createSignal } from 'solid-js'
import { setApiLogger } from './api'
import { descendantSessionIDs, rootSessionID } from './descendants'
import { RequestyDetailDialog } from './dialog'
import { detectApiKey } from './key'
import { RequestyPromptWidget } from './prompt'
import { sessionIDFromRoute } from './route'
import { readSettings } from './settings'
import { createRequestyStore, type RequestyStore } from './state'
import { RequestySidebarWidget } from './widget'

const PLUGIN_ID = 'opencode-requesty-sidebar'
const COMMAND_OPEN = 'requesty.open'
const COMMAND_REFRESH = 'requesty.refresh'
/** Debounce for message-driven refreshes, so a burst of updates triggers one fetch. */
const REFRESH_DEBOUNCE_MS = 2000

const plugin: TuiPluginModule = {
  id: PLUGIN_ID,
  tui: async (api, rawOptions) => {
    setApiLogger((level, message) => {
      void api.client.app.log({ service: 'requesty', level, message }).catch(() => {})
    })

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
                  <text fg={ctx.theme.current.textMuted}>{key.reason}</text>
                </box>
              )
            }
          }
        })
      }
      return
    }

    const store: RequestyStore = createRequestyStore({
      apiKey: key.apiKey,
      // Use this module's `createSignal` (the same Solid instance the widget
      // renders under) so store updates re-run the widget's memos and repaint.
      createSignal,
      onError: (message) => {
        api.ui.toast({ variant: 'error', title: 'Requesty', message })
      },
      activeSession: (sessionID) => {
        const rootID = rootSessionID(sessionID, (id) => api.state.session.get(id)?.parentID)
        const session = api.state.session.get(rootID)
        if (!session) return { id: rootID, created: undefined }
        return { id: rootID, created: session.time?.created }
      },
      fetchSessionChildren: (sessionID) =>
        descendantSessionIDs(sessionID, (id) =>
          api.client.session.children({ sessionID: id }).then((result) => (result.data ?? []).map((child) => child.id))
        ),
      onRender: () => api.renderer.requestRender()
    })

    // Sidebar widget
    if (settings.sidebar.enabled) {
      api.slots.register({
        order: settings.sidebar.order,
        slots: {
          sidebar_content(ctx, slotProps) {
            // Read host-tracked state to force sidebar slot repaints on session/message updates.
            api.state.session.messages(slotProps.session_id).length
            store.setSessionID(slotProps.session_id)
            return (
              <RequestySidebarWidget
                store={store}
                api={api}
                sessionID={slotProps.session_id}
                theme={ctx.theme.current}
                maxModels={settings.sidebar.maxModels}
                thresholds={settings.thresholds}
                showTokens={settings.sidebar.showTokens}
                showKeyName={settings.sidebar.showKeyName}
                showSessionInfo={settings.sidebar.showSessionInfo}
              />
            )
          }
        }
      })
    }

    // Prompt indicator (right side of the session prompt)
    if (settings.prompt.enabled && settings.prompt.budgetIndicator) {
      api.slots.register({
        order: settings.prompt.order,
        slots: {
          session_prompt_right(ctx, slotProps) {
            // Supply the active session id when the sidebar is disabled, so the
            // prompt's session spend still resolves.
            store.setSessionID(slotProps.session_id)
            return (
              <RequestyPromptWidget
                store={store}
                api={api}
                sessionID={slotProps.session_id}
                theme={ctx.theme.current}
                thresholds={settings.thresholds}
                todaySpend={settings.prompt.todaySpend}
                dailyAvg={settings.prompt.dailyAvg}
                avg7d={settings.prompt.avg7d}
                avg30d={settings.prompt.avg30d}
                showTokens={settings.prompt.showTokens}
                showKeyName={settings.prompt.showKeyName}
                showSessionInfo={settings.prompt.showSessionInfo}
                monthlyProjection={settings.prompt.monthlyProjection}
              />
            )
          }
        }
      })
    }

    // Detail dialog
    const openDialog = () => {
      api.ui.dialog.replace(() => (
        <RequestyDetailDialog store={store} theme={api.theme.current} thresholds={settings.thresholds} showKeyName={settings.dialog.showKeyName} />
      ))
      api.ui.dialog.setSize('large')
      void store.refresh()
    }

    let debounceTimer: ReturnType<typeof setTimeout> | undefined
    const debouncedRefresh = () => {
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        void store.refresh()
      }, REFRESH_DEBOUNCE_MS)
    }

    // Commands (command palette + slash command)
    api.keymap.registerLayer({
      commands: [
        {
          name: COMMAND_OPEN,
          title: 'Requesty: show usage',
          desc: 'Show Requesty.ai budget, spend and per-model costs',
          category: 'Requesty',
          namespace: 'palette',
          slashName: 'requesty',
          run: () => {
            openDialog()
          }
        },
        {
          name: COMMAND_REFRESH,
          title: 'Requesty: refresh usage',
          desc: 'Refresh Requesty.ai usage data',
          category: 'Requesty',
          namespace: 'palette',
          run: () => {
            void store.refresh()
          }
        }
      ]
    })

    // Refresh triggers: startup, interval safety net, session lifecycle
    const initialSessionID = sessionIDFromRoute(api.route.current)
    if (initialSessionID) {
      // `setSessionID` triggers the refresh, so don't also call `refresh()` here.
      store.setSessionID(initialSessionID)
    } else {
      void store.refresh()
    }

    const interval = setInterval(() => {
      void store.refresh()
    }, settings.refreshIntervalMs)

    const unsubSessionCreated = api.event.on('session.created', () => {
      void store.refresh()
    })

    const unsubSessionUpdated = api.event.on('session.updated', (evt) => {
      store.syncActiveSession(evt.properties.info.id)
    })

    const unsubSessionIdle = api.event.on('session.idle', () => {
      void store.refresh()
    })

    const unsubMessage = api.event.on('message.updated', () => {
      debouncedRefresh()
    })

    api.lifecycle.onDispose(() => {
      clearInterval(interval)
      clearTimeout(debounceTimer)
      unsubSessionCreated()
      unsubSessionUpdated()
      unsubSessionIdle()
      unsubMessage()
    })
  }
}

export default plugin
