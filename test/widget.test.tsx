/** @jsxImportSource @opentui/solid */
import { describe, test } from 'bun:test'
import assert from 'node:assert/strict'
import type { TuiPluginApi, TuiThemeCurrent } from '@opencode-ai/plugin/tui'
import { RGBA } from '@opentui/core'
import { testRender } from '@opentui/solid'
import { createSignal } from 'solid-js'
import type { ModelUsage } from '../src/api'
import type { SpendThresholds } from '../src/format'
import { createRequestyStore, type RequestyData, type RequestyStore } from '../src/state'
import { RequestySidebarWidget, type WidgetProps } from '../src/widget'

const THRESHOLDS: SpendThresholds = { warning: 0.7, error: 0.9 }

const TOKENS = { input: 1200, output: 800, total: 2000 }

const MODEL: ModelUsage = { model: 'openai/gpt-5', spend: 1.25, inputTokens: 1200, outputTokens: 800, totalTokens: 2000, requests: 4 }

function makeData(overrides: Partial<RequestyData> = {}): RequestyData {
  return {
    keyInfo: {
      id: 'key-1',
      name: 'mykey',
      logging: false,
      monthly_spend: 2.5,
      monthly_limit: 10,
      permissions: { manage: 'none', completions: 'write' }
    },
    models: [MODEL],
    todaySpend: 1,
    dailyAverage: 0.1,
    avg7d: 0.2,
    avg30d: 0.3,
    todayTokens: TOKENS,
    dailyAverageTokens: TOKENS,
    avg7dTokens: TOKENS,
    avg30dTokens: TOKENS,
    lastMonthSpend: 0,
    sessionTodaySpend: 0.5,
    sessionTotalSpend: 0.9,
    sessionTodayRequests: 3,
    sessionTotalRequests: 5,
    sessionTodayTokens: TOKENS,
    sessionTotalTokens: TOKENS,
    sessionStartLabel: '2026-08-27',
    sessionId: 'ses_test',
    subagentCount: 2,
    ...overrides
  }
}

function makeStore(
  data: RequestyData | undefined,
  options: { status?: 'idle' | 'loading' | 'ready' | 'error'; activeSessionID?: string } = {}
): RequestyStore {
  const status = options.status ?? (data ? 'ready' : 'loading')
  return {
    data: () => data,
    state: () => (status === 'ready' ? { status, fetchedAt: new Date() } : status === 'error' ? { status, message: 'network down' } : { status }),
    errorMessage: () => (status === 'error' ? 'network down' : undefined),
    activeSessionID: () => options.activeSessionID
  } as unknown as RequestyStore
}

function makeApi(): TuiPluginApi {
  return { state: { session: { messages: () => [] } } } as unknown as TuiPluginApi
}

function makeTheme(): TuiThemeCurrent {
  return {
    text: RGBA.fromHex('#ffffff'),
    textMuted: RGBA.fromHex('#888888'),
    error: RGBA.fromHex('#ff0000'),
    warning: RGBA.fromHex('#ffaa00'),
    success: RGBA.fromHex('#00ff00')
  } as unknown as TuiThemeCurrent
}

const BASE_PROPS: Omit<WidgetProps, 'store'> = {
  api: makeApi(),
  sessionID: 'ses_test',
  theme: makeTheme(),
  maxModels: 5,
  thresholds: THRESHOLDS,
  showTokens: false,
  showKeyName: false,
  showSessionInfo: true
}

/** Render the sidebar widget and return its whitespace-normalized frame. */
async function renderWidget(store: RequestyStore, overrides: Partial<WidgetProps> = {}): Promise<string> {
  const setup = await testRender(() => <RequestySidebarWidget {...BASE_PROPS} store={store} {...overrides} />, { width: 70, height: 30 })
  try {
    await setup.flush()
    return setup.captureCharFrame().replace(/\s+/g, ' ').trim()
  } finally {
    setup.renderer.destroy()
  }
}

describe('RequestySidebarWidget', () => {
  test('shows a loading fallback before any data arrives', async () => {
    const frame = await renderWidget(makeStore(undefined, { status: 'loading' }))
    assert.ok(frame.includes('Loading Requesty usage…'))
  })

  test('shows a waiting fallback when idle without data', async () => {
    const frame = await renderWidget(makeStore(undefined, { status: 'idle' }))
    assert.ok(frame.includes('waiting for first refresh…'))
  })

  test('shows the error message and a stale snapshot when a refresh fails', async () => {
    const frame = await renderWidget(makeStore(makeData(), { status: 'error', activeSessionID: 'ses_test' }))
    assert.ok(frame.includes('Requesty: network down'))
    assert.ok(frame.includes('(stale)'))
    assert.ok(frame.includes('$2.50 / $10.00'))
  })

  test('renders the title, budget bar and spend rows when ready', async () => {
    const frame = await renderWidget(makeStore(makeData(), { activeSessionID: 'ses_test' }))
    assert.ok(frame.includes('Requesty'))
    assert.ok(frame.includes('25%'))
    assert.ok(frame.includes('$2.50 / $10.00'))
    assert.ok(frame.includes('Today $1.00'))
    assert.ok(frame.includes('7d $0.20'))
    assert.ok(frame.includes('Daily $0.10'))
    assert.ok(frame.includes('30d $0.30'))
  })

  test('renders the key name only when showKeyName is enabled', async () => {
    const store = makeStore(makeData(), { activeSessionID: 'ses_test' })
    assert.ok(!(await renderWidget(store)).includes('(mykey)'))
    assert.ok((await renderWidget(store, { showKeyName: true })).includes('(mykey)'))
  })

  test('renders per-metric token breakdowns only when showTokens is enabled', async () => {
    const store = makeStore(makeData(), { activeSessionID: 'ses_test' })
    // The averages block gains a token column; the models section always shows tokens.
    assert.ok(!(await renderWidget(store)).includes('Today $1.00 ↑1.2k'))
    assert.ok((await renderWidget(store, { showTokens: true })).includes('Today $1.00 ↑1.2k ↓800'))
  })

  test('renders an unlimited label without a bar when the limit is zero', async () => {
    const data = makeData({
      keyInfo: {
        id: 'key-1',
        name: 'mykey',
        logging: false,
        monthly_spend: 3,
        monthly_limit: 0,
        permissions: { manage: 'none', completions: 'write' }
      }
    })
    const frame = await renderWidget(makeStore(data, { activeSessionID: 'ses_test' }))
    assert.ok(frame.includes('$3.00 / unlimited'))
    assert.ok(!frame.includes('▓'))
    assert.ok(!frame.includes('%'))
  })

  test('renders the session section with subagent count and loaded figures', async () => {
    const frame = await renderWidget(makeStore(makeData(), { activeSessionID: 'ses_test' }))
    assert.ok(frame.includes('▼ Session'))
    assert.ok(frame.includes('· 2 subagents'))
    assert.ok(frame.includes('Since 2026-08-27'))
    assert.ok(frame.includes('$0.90'))
    assert.ok(frame.includes('3 reqs'))
    assert.ok(frame.includes('5 reqs'))
  })

  test('shows the session loading placeholder for a session whose figures are not loaded yet', async () => {
    const frame = await renderWidget(makeStore(makeData(), { activeSessionID: 'ses_other' }))
    assert.ok(frame.includes('Session cost loading…'))
  })

  test('hides the session section when showSessionInfo is disabled', async () => {
    const frame = await renderWidget(makeStore(makeData(), { activeSessionID: 'ses_test' }), { showSessionInfo: false })
    assert.ok(!frame.includes('Session'))
  })

  test('renders top models and the empty state', async () => {
    const withModels = await renderWidget(makeStore(makeData(), { activeSessionID: 'ses_test' }))
    assert.ok(withModels.includes('Top Models (Current Month)'))
    assert.ok(withModels.includes('gpt-5'))
    assert.ok(withModels.includes('$1.25'))

    const withoutModels = await renderWidget(makeStore(makeData({ models: [] }), { activeSessionID: 'ses_test' }))
    assert.ok(withoutModels.includes('No usage this month yet.'))
  })

  test('caps the model list at maxModels', async () => {
    const models = Array.from({ length: 4 }, (_, i) => ({ ...MODEL, model: `openai/model-${i}` }))
    const frame = await renderWidget(makeStore(makeData({ models }), { activeSessionID: 'ses_test' }), { maxModels: 2 })
    assert.ok(frame.includes('model-0'))
    assert.ok(frame.includes('model-1'))
    assert.ok(!frame.includes('model-2'))
  })

  test('repaints the frame when a plugin-owned store update arrives', async () => {
    const [data, setData] = createSignal<RequestyData | undefined>(makeData())
    const store = {
      data,
      state: () => ({ status: 'ready' as const, fetchedAt: new Date() }),
      errorMessage: () => undefined,
      activeSessionID: () => 'ses_test'
    } as unknown as RequestyStore
    const setup = await testRender(() => <RequestySidebarWidget {...BASE_PROPS} store={store} />, {
      width: 70,
      height: 30
    })
    try {
      await setup.flush()
      assert.ok(setup.captureCharFrame().includes('$2.50'))
      setData(makeData({ keyInfo: { ...makeData().keyInfo, monthly_spend: 7.5 } }))
      await setup.flush()
      assert.ok(setup.captureCharFrame().includes('$7.50'))
    } finally {
      setup.renderer.destroy()
    }
  })

  test('repaints when a real store refresh completes, without a tick or host event', async () => {
    const store = createRequestyStore({
      apiKey: 'sk-test',
      createSignal,
      fetchApiKey: () =>
        Promise.resolve({
          id: 'key-1',
          name: 'mykey',
          logging: false,
          monthly_spend: 2.5,
          monthly_limit: 10,
          permissions: { manage: 'none', completions: 'write' }
        }),
      fetchUsage: () => Promise.resolve({ usage: {} })
    })
    const setup = await testRender(() => <RequestySidebarWidget {...BASE_PROPS} store={store} />, { width: 70, height: 30 })
    try {
      await setup.flush()
      assert.ok(!setup.captureCharFrame().includes('$2.50 / $10.00'))
      await store.refresh()
      await setup.flush()
      assert.ok(setup.captureCharFrame().includes('$2.50 / $10.00'))
    } finally {
      setup.renderer.destroy()
    }
  })
})
