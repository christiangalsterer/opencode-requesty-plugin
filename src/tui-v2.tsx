/** @jsxImportSource @opentui/solid */

import type { SessionInfo } from '@opencode/client'
import type { Context } from '@opencode/plugin/tui/context'
import { createSignal } from 'solid-js'
import { setApiLogger } from './api'
import { createRequestyHostStore } from './host-store'
import { RequestyDetailDialog } from './dialog'
import { detectApiKey } from './key'
import { RequestyPromptWidget } from './prompt'
import { readSettings } from './settings'
import type { RequestyStore } from './state'
import { RequestySidebarWidget } from './widget'
import type { RequestyTheme, RequestyWidgetHost } from './ui-types'
import { normalizeV2ConfigDocuments, type V2ConfigDocument } from './v2-config'

const REFRESH_DEBOUNCE_MS = 2000
const REFRESH_SESSION_TYPES = new Set([
  'session.created',
  'session.idle',
  'session.execution.succeeded',
  'session.execution.failed',
  'session.execution.interrupted',
  'session.step.ended',
  'session.usage.updated',
  'session.usage.recorded'
])

function themeFor(context: Context): RequestyTheme {
  const theme = context.theme
  return {
    text: theme.text.base,
    textMuted: theme.text.muted,
    error: theme.text.feedback.error.base,
    warning: theme.text.feedback.warning.base,
    success: theme.text.feedback.success.base,
    primary: theme.text.action.primary.base,
    background: theme.background.base
  }
}

function sessionCostHost(context: Context): RequestyWidgetHost {
  return {
    sessionMessages: (sessionID) => context.data.session.message.list(sessionID)
  }
}

function sessionChildren(context: Context, sessionID: string): Promise<string[]> {
  return Promise.resolve(context.data.session.family(sessionID).filter((id) => id !== sessionID))
}

async function runV2(context: Context): Promise<(() => void) | undefined> {
  const settings = readSettings(context.options)
  setApiLogger(undefined)

  let config: readonly V2ConfigDocument[] = []
  try {
    config = (await context.client.config.get()) as V2ConfigDocument[]
  } catch {
    // A config lookup failure is reported as the normal missing-key state.
  }

  const key = detectApiKey(normalizeV2ConfigDocuments(config))
  if (!key.ok) {
    if (settings.sidebar.enabled) {
      context.ui.slot({
        append: 'sidebar.content',
        render: () => (
          <box flexDirection="column" paddingTop={1}>
            <text fg={themeFor(context).textMuted}>
              <strong>Requesty</strong>
            </text>
            <text fg={themeFor(context).textMuted}>{key.reason}</text>
          </box>
        )
      })
    }
    return undefined
  }

  const store: RequestyStore = createRequestyHostStore({
    apiKey: key.apiKey,
    projection: settings.projection,
    createSignal,
    getSessionParentID: (sessionID) => context.data.session.get(sessionID)?.parentID,
    getSessionCreatedAt: (sessionID) => context.data.session.get(context.data.session.root(sessionID))?.time.created,
    fetchSessionChildren: (sessionID) => sessionChildren(context, sessionID),
    onError: (message) => context.ui.toast.show({ variant: 'error', title: 'Requesty', message }),
    onRender: () => context.renderer.requestRender()
  })
  const widgetHost = sessionCostHost(context)

  if (settings.sidebar.enabled) {
    context.ui.slot({
      append: 'sidebar.content',
      render: ({ sessionID }) => {
        if (!sessionID) {
          return <text />
        }
        store.setSessionID(sessionID)
        return (
          <RequestySidebarWidget
            store={store}
            api={widgetHost}
            sessionID={sessionID}
            theme={themeFor(context)}
            maxModels={settings.sidebar.maxModels}
            thresholds={settings.thresholds}
            showTokens={settings.sidebar.showTokens}
            showKeyName={settings.sidebar.showKeyName}
            showSessionInfo={settings.sidebar.showSessionInfo}
          />
        )
      }
    })
  }

  if (settings.prompt.enabled && settings.prompt.budgetIndicator) {
    context.ui.slot({
      append: 'prompt.footer.status',
      render: ({ sessionID }) => {
        if (!sessionID) {
          return <text />
        }
        store.setSessionID(sessionID)
        return (
          <RequestyPromptWidget
            store={store}
            api={widgetHost}
            sessionID={sessionID}
            theme={themeFor(context)}
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
    })
  }

  const openDialog = () => {
    context.ui.dialog.show(() => (
      <RequestyDetailDialog store={store} theme={themeFor(context)} thresholds={settings.thresholds} showKeyName={settings.dialog.showKeyName} />
    ))
    context.ui.dialog.set({ size: 'large' })
    store.refresh().catch(() => undefined)
  }

  context.keymap.layer(() => ({
    mode: 'global',
    commands: [
      {
        id: 'requesty.open',
        title: 'Requesty: show usage',
        description: 'Show Requesty.ai budget, spend and per-model costs',
        group: 'Requesty',
        palette: true,
        slash: { name: 'requesty' },
        run: openDialog
      },
      {
        id: 'requesty.refresh',
        title: 'Requesty: refresh usage',
        description: 'Refresh Requesty.ai usage data',
        group: 'Requesty',
        palette: true,
        run: () => {
          store.refresh().catch(() => undefined)
        }
      }
    ]
  }))

  const sessions = context.data.session.list()
  const route = context.ui.router.current()
  const initialSessionID = route.type === 'session' ? route.sessionID : undefined
  const selectedSessionID = initialSessionID ?? sessions.find((session) => session.location.directory === context.location?.directory)?.id
  if (selectedSessionID) {
    store.setSessionID(selectedSessionID)
  } else {
    store.refresh().catch(() => undefined)
  }

  const interval = setInterval(() => {
    store.refresh().catch(() => undefined)
  }, settings.refreshIntervalMs)
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  const unsubscribe = context.data.listen(({ details }) => {
    const isRelevantSessionEvent = REFRESH_SESSION_TYPES.has(details.type) || details.type.startsWith('session.')
    if (!isRelevantSessionEvent) {
      return
    }
    const sessionID = 'sessionID' in details.data ? details.data.sessionID : undefined
    if (sessionID) {
      if (details.type === 'session.created') {
        context.data.session.sync(sessionID).catch(() => undefined)
      }
      if (sessionID === store.activeSessionID()) {
        store.syncActiveSession(sessionID)
      }
    }
    if (
      details.type === 'session.execution.succeeded' ||
      details.type === 'session.execution.failed' ||
      details.type === 'session.execution.interrupted' ||
      details.type === 'session.step.ended' ||
      details.type === 'session.idle' ||
      details.type === 'session.usage.updated'
    ) {
      store.refresh().catch(() => undefined)
      return
    }
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      store.refresh().catch(() => undefined)
    }, REFRESH_DEBOUNCE_MS)
  })

  return () => {
    clearInterval(interval)
    clearTimeout(debounceTimer)
    unsubscribe()
  }
}

export { runV2 }
