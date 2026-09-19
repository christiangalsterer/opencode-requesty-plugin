/** @jsxImportSource @opentui/solid */
import { describe, test } from 'bun:test'
import assert from 'node:assert/strict'
import type { TuiThemeCurrent } from '@opencode-ai/plugin/tui'
import { RGBA } from '@opentui/core'
import { testRender } from '@opentui/solid'
import type { ModelUsage } from '../src/api'
import { type DetailDialogProps, RequestyDetailDialog } from '../src/dialog'
import type { SpendThresholds } from '../src/format'
import type { RequestyData, RequestyStore } from '../src/state'

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
    lastMonthSpend: 0.5,
    sessionTodaySpend: 0.5,
    sessionTotalSpend: 0.9,
    sessionTodayRequests: 3,
    sessionTotalRequests: 5,
    sessionTodayTokens: TOKENS,
    sessionTotalTokens: TOKENS,
    sessionStartLabel: '2026-08-27',
    sessionId: 'ses_test',
    subagentCount: 0,
    ...overrides
  }
}

function makeStore(data: RequestyData | undefined, options: { status?: 'idle' | 'loading' | 'ready' | 'error' } = {}): RequestyStore {
  const status = options.status ?? (data ? 'ready' : 'loading')
  return {
    data: () => data,
    state: () => (status === 'ready' ? { status, fetchedAt: new Date() } : status === 'error' ? { status, message: 'boom' } : { status }),
    errorMessage: () => (status === 'error' ? 'boom' : undefined),
    fetchedAt: () => (status === 'ready' ? new Date() : undefined)
  } as unknown as RequestyStore
}

function makeTheme(): TuiThemeCurrent {
  return {
    text: RGBA.fromHex('#ffffff'),
    textMuted: RGBA.fromHex('#888888'),
    error: RGBA.fromHex('#ff0000'),
    warning: RGBA.fromHex('#ffaa00'),
    success: RGBA.fromHex('#00ff00'),
    primary: RGBA.fromHex('#00aaff'),
    background: RGBA.fromHex('#000000')
  } as unknown as TuiThemeCurrent
}

const BASE_PROPS: Omit<DetailDialogProps, 'store'> = {
  theme: makeTheme(),
  thresholds: THRESHOLDS,
  showKeyName: false,
  onClose: () => {},
  onRefresh: () => {}
}

/** Render the detail dialog and return its whitespace-normalized frame. */
async function renderDialog(store: RequestyStore, overrides: Partial<DetailDialogProps> = {}): Promise<string> {
  const setup = await testRender(() => <RequestyDetailDialog {...BASE_PROPS} store={store} {...overrides} />, { width: 90, height: 40 })
  try {
    await setup.flush()
    return setup.captureCharFrame().replace(/\s+/g, ' ').trim()
  } finally {
    setup.renderer.destroy()
  }
}

describe('RequestyDetailDialog', () => {
  test('shows a loading message before any data arrives', async () => {
    const frame = await renderDialog(makeStore(undefined, { status: 'loading' }))
    assert.ok(frame.includes('Loading Requesty usage…'))
  })

  test('shows the error message when a refresh failed', async () => {
    const frame = await renderDialog(makeStore(undefined, { status: 'error' }))
    assert.ok(frame.includes('boom'))
  })

  test('renders the KPI row, budget overview and footer when ready', async () => {
    const frame = await renderDialog(makeStore(makeData()))
    assert.ok(frame.includes('Requesty'))
    assert.ok(frame.includes('Spent'))
    assert.ok(frame.includes('Limit'))
    assert.ok(frame.includes('Remaining'))
    assert.ok(frame.includes('End of Month'))
    assert.ok(frame.includes('last month'))
    assert.ok(frame.includes('Budget Overview'))
    assert.ok(frame.includes('On track'))
    assert.ok(frame.includes('Updated:'))
  })

  test('renders the key name only when showKeyName is enabled', async () => {
    const store = makeStore(makeData())
    assert.ok(!(await renderDialog(store)).includes('(mykey)'))
    assert.ok((await renderDialog(store, { showKeyName: true })).includes('(mykey)'))
  })

  test('renders the model breakdown table and total', async () => {
    const frame = await renderDialog(makeStore(makeData()))
    assert.ok(frame.includes('Model Breakdown (Current Month)'))
    assert.ok(frame.includes('gpt-5'))
    assert.ok(frame.includes('$1.25'))
    assert.ok(frame.includes('Total: $2.50 across 1 model'))
  })

  test('shows the empty model state when no models are recorded', async () => {
    const frame = await renderDialog(makeStore(makeData({ models: [] })))
    assert.ok(frame.includes('No model usage recorded this month.'))
  })

  test('hides the limit-dependent metrics when the limit is unlimited', async () => {
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
    const frame = await renderDialog(makeStore(data))
    assert.ok(frame.includes('Spent'))
    assert.ok(!frame.includes('Remaining'))
    assert.ok(!frame.includes('Limit'))
  })
})
