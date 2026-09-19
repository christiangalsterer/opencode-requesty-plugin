/** @jsxImportSource @opentui/solid */
import { describe, test } from 'bun:test'
import assert from 'node:assert/strict'
import type { TuiPluginApi, TuiThemeCurrent } from '@opencode-ai/plugin/tui'
import { RGBA } from '@opentui/core'
import { testRender } from '@opentui/solid'
import type { SpendThresholds } from '../src/format'
import { type PromptProps, RequestyPromptWidget } from '../src/prompt'
import type { RequestyData, RequestyStore } from '../src/state'

const THRESHOLDS: SpendThresholds = { warning: 0.7, error: 0.9 }

const TOKENS = { input: 1200, output: 800, total: 2000 }

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
    models: [],
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
    subagentCount: 0,
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
    state: () => (status === 'ready' ? { status, fetchedAt: new Date() } : status === 'error' ? { status, message: 'boom' } : { status }),
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

const BASE_PROPS: Omit<PromptProps, 'store'> = {
  api: makeApi(),
  sessionID: 'ses_test',
  theme: makeTheme(),
  thresholds: THRESHOLDS,
  todaySpend: true,
  dailyAvg: true,
  avg7d: true,
  avg30d: true,
  showTokens: false,
  showKeyName: false,
  showSessionInfo: true,
  monthlyProjection: true
}

/** Render the prompt widget and return its whitespace-normalized first line. */
async function renderPrompt(store: RequestyStore, overrides: Partial<PromptProps> = {}): Promise<string> {
  const setup = await testRender(() => <RequestyPromptWidget {...BASE_PROPS} store={store} {...overrides} />, { width: 100, height: 2 })
  try {
    await setup.flush()
    return setup.captureCharFrame().split('\n')[0]!.replace(/\s+/g, ' ').trim()
  } finally {
    setup.renderer.destroy()
  }
}

describe('RequestyPromptWidget', () => {
  test('shows a loading placeholder before any data arrives', async () => {
    const frame = await renderPrompt(makeStore(undefined, { status: 'loading' }))
    assert.equal(frame, 'Requesty …')
  })

  test('shows an error placeholder when the refresh failed', async () => {
    const frame = await renderPrompt(makeStore(undefined, { status: 'error' }))
    assert.equal(frame, 'Requesty !')
  })

  test('renders spend, limit and percent when a limit is set', async () => {
    const frame = await renderPrompt(makeStore(makeData(), { activeSessionID: 'ses_test' }))
    assert.ok(frame.includes('$2.50/$10.00 25%'))
  })

  test('renders the key name only when showKeyName is enabled', async () => {
    const store = makeStore(makeData(), { activeSessionID: 'ses_test' })
    assert.ok(!(await renderPrompt(store)).includes('mykey'))
    assert.ok((await renderPrompt(store, { showKeyName: true })).includes('(mykey)'))
  })

  test('renders an unlimited label without a percent when the limit is zero', async () => {
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
    const frame = await renderPrompt(makeStore(data, { activeSessionID: 'ses_test' }))
    assert.ok(frame.includes('$3.00/unlimited'))
    assert.ok(!frame.includes('%'))
  })

  test('renders each enabled spend metric and omits the disabled ones', async () => {
    const store = makeStore(makeData(), { activeSessionID: 'ses_test' })
    const all = await renderPrompt(store)
    assert.ok(all.includes('T $1.00'))
    assert.ok(all.includes('D $0.10'))
    assert.ok(all.includes('7d $0.20'))
    assert.ok(all.includes('30d $0.30'))

    const onlyToday = await renderPrompt(store, { dailyAvg: false, avg7d: false, avg30d: false })
    assert.ok(onlyToday.includes('T $1.00'))
    assert.ok(!onlyToday.includes('D $0.10'))
    assert.ok(!onlyToday.includes('7d $0.20'))
    assert.ok(!onlyToday.includes('30d $0.30'))
  })

  test('appends the token breakdown to metrics only when showTokens is enabled', async () => {
    const store = makeStore(makeData(), { activeSessionID: 'ses_test' })
    assert.ok(!(await renderPrompt(store)).includes('↑1.2k'))
    const withTokens = await renderPrompt(store, { showTokens: true })
    assert.ok(withTokens.includes('T $1.00 ↑1.2k ↓800'))
    assert.ok(withTokens.includes('S $0.90 ↑1.2k ↓800'))
  })

  test('renders the session metric only for the active session with spend', async () => {
    const store = makeStore(makeData(), { activeSessionID: 'ses_test' })
    assert.ok((await renderPrompt(store)).includes('S $0.90'))

    // Not the active session → no session metric.
    const otherStore = makeStore(makeData(), { activeSessionID: 'ses_other' })
    assert.ok(!(await renderPrompt(otherStore)).includes('S $0.90'))

    // Disabled via showSessionInfo → no session metric.
    assert.ok(!(await renderPrompt(store, { showSessionInfo: false })).includes('S $0.90'))

    // Zero session spend → no session metric.
    const zeroStore = makeStore(makeData({ sessionTotalSpend: 0 }), { activeSessionID: 'ses_test' })
    assert.ok(!(await renderPrompt(zeroStore)).includes('S $'))
  })

  test('renders the month-end projection only when enabled and a limit is set', async () => {
    const store = makeStore(makeData(), { activeSessionID: 'ses_test' })
    assert.ok((await renderPrompt(store)).includes('EOM'))
    assert.ok(!(await renderPrompt(store, { monthlyProjection: false })).includes('EOM'))

    const unlimited = makeData({
      keyInfo: {
        id: 'key-1',
        name: 'mykey',
        logging: false,
        monthly_spend: 3,
        monthly_limit: 0,
        permissions: { manage: 'none', completions: 'write' }
      }
    })
    const unlimitedFrame = await renderPrompt(makeStore(unlimited, { activeSessionID: 'ses_test' }))
    assert.ok(unlimitedFrame.includes('EOM'))
    assert.ok(!unlimitedFrame.includes('↓') && !unlimitedFrame.includes('↑'))
  })
})
