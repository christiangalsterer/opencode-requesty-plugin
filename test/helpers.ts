import type { TuiPluginApi, TuiThemeCurrent } from '@opencode-ai/plugin/tui'
import { RGBA } from '@opentui/core'
import type { ModelUsage } from '../src/api'
import type { SpendThresholds } from '../src/format'
import type { RequestyData, RequestyStore } from '../src/state'

export const THRESHOLDS: SpendThresholds = { warning: 0.7, error: 0.9 }

export const TOKENS = { input: 1200, output: 800, total: 2000 }

export const MODEL: ModelUsage = { model: 'openai/gpt-5', spend: 1.25, inputTokens: 1200, outputTokens: 800, totalTokens: 2000, requests: 4 }

export function makeData(overrides: Partial<RequestyData> = {}): RequestyData {
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
    subagentCount: 2,
    ...overrides
  }
}

export function makeStore(
  data: RequestyData | undefined,
  options: { status?: 'idle' | 'loading' | 'ready' | 'error'; activeSessionID?: string; errorMessage?: string } = {}
): RequestyStore {
  const status = options.status ?? (data ? 'ready' : 'loading')
  const errorMessage = options.errorMessage ?? 'network down'
  return {
    data: () => data,
    state: () => (status === 'ready' ? { status, fetchedAt: new Date() } : status === 'error' ? { status, message: errorMessage } : { status }),
    errorMessage: () => (status === 'error' ? errorMessage : undefined),
    fetchedAt: () => (status === 'ready' ? new Date() : undefined),
    activeSessionID: () => options.activeSessionID
  } as unknown as RequestyStore
}

export function makeApi(): TuiPluginApi {
  return { state: { session: { messages: () => [] } } } as unknown as TuiPluginApi
}

export function makeTheme(): TuiThemeCurrent {
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
