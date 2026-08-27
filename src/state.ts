import { createSignal } from 'solid-js'
import {
  aggregateByModel,
  avgSpendLastNDays,
  avgTokensLastNDays,
  endOfLastMonth,
  filterUsageByMonth,
  getApiKeySelf,
  getUsageSelf,
  sessionSpendForDay,
  sessionSpendFromResponse,
  spendForDay,
  startOfLastMonth,
  startOfRollingWindow,
  tokensForDay,
  totalSpendFromUsage,
  SESSION_AFFINITY_KEY,
  type ApiKeyInfo,
  type ModelUsage,
  type SessionSpend,
  type TokenBreakdown,
  type UsageResponse
} from './api'
import { dailyAverage, formatSessionStart } from './format'

export type RefreshState = { status: 'idle' } | { status: 'loading' } | { status: 'ready'; fetchedAt: Date } | { status: 'error'; message: string }

export type RequestyData = {
  keyInfo: ApiKeyInfo
  models: ModelUsage[]
  monthSpendFromUsage: number
  todaySpend: number
  dailyAvg: number
  avg7d: number
  avg30d: number
  todayTokens: TokenBreakdown
  dailyAvgTokens: TokenBreakdown
  avg7dTokens: TokenBreakdown
  avg30dTokens: TokenBreakdown
  lastMonthSpend: number
  sessionTodaySpend: number
  sessionTotalSpend: number
  sessionTodayRequests: number
  sessionTotalRequests: number
  sessionTodayTokens: TokenBreakdown
  sessionTotalTokens: TokenBreakdown
  /** Label for the session's start (e.g. "2026-08-27"); undefined when unavailable. */
  sessionStartLabel: string | undefined
}

/** The active session to attribute cost to. `created` is an epoch-ms timestamp. */
export type ActiveSession = { id: string; created: number | undefined }

export type RequestyStoreOptions = {
  apiKey: string
  onError?: (message: string) => void
  /** Injectable fetchers (defaults to the real API client); used by tests. */
  fetchApiKey?: typeof getApiKeySelf
  fetchUsage?: typeof getUsageSelf
  /** Injectable active-session resolver: given a session id, return it with its created timestamp (epoch ms). */
  activeSession?: (sessionID: string) => ActiveSession | undefined
}

export type RequestyStore = {
  state: () => RefreshState
  data: () => RequestyData | undefined
  /** Force a refresh (manual, interval, startup, session events). */
  refresh: () => Promise<void>
  /** Reactive version counter — bumps on message events to force slot re-renders. */
  version: () => number
  /** Bump the version counter (called on message events). */
  bumpVersion: () => void
  /** Set the active session id; refreshes session cost on the next refresh. */
  setSessionID: (sessionID: string | undefined) => void
}

export function createRequestyStore(options: RequestyStoreOptions): RequestyStore {
  const [state, setState] = createSignal<RefreshState>({ status: 'idle' })
  const [data, setData] = createSignal<RequestyData | undefined>(undefined)
  const [version, setVersion] = createSignal(0)
  const [sessionID, setSessionID] = createSignal<string | undefined>(undefined)

  const fetchApiKey = options.fetchApiKey ?? getApiKeySelf
  const fetchUsage = options.fetchUsage ?? getUsageSelf

  let inFlight: Promise<void> | undefined
  let pending = false

  function currentActiveSession(): { id: string; created: number | undefined } | undefined {
    const id = sessionID()
    if (!id) return undefined
    return options.activeSession?.(id) ?? { id, created: undefined }
  }

  async function refresh(): Promise<void> {
    if (inFlight) {
      pending = true
      return inFlight
    }
    setState((previous) => (previous.status === 'ready' ? previous : { status: 'loading' }))
    inFlight = (async () => {
      try {
        const keyInfo = await fetchApiKey(options.apiKey)
        const usage = await fetchUsage(options.apiKey, {
          start: startOfRollingWindow(30),
          groupBy: ['model_used'],
          resolution: 'day' as const
        })
        const currentMonthUsage = filterUsageByMonth(usage)
        const aggregated = aggregateByModel(currentMonthUsage)

        let lastMonthSpend = 0
        const [_, lastMonthUsage] = await Promise.all([
          Promise.resolve(), // Keep main flow clean
          fetchUsage(options.apiKey, {
            start: startOfLastMonth(),
            end: endOfLastMonth(),
            resolution: 'day'
          }).catch(() => undefined)
        ])
        if (lastMonthUsage) lastMonthSpend = totalSpendFromUsage(lastMonthUsage)

        let sessionToday: SessionSpend = { spend: 0, requests: 0, inputTokens: 0, outputTokens: 0 }
        let sessionTotal: SessionSpend = { spend: 0, requests: 0, inputTokens: 0, outputTokens: 0 }
        let sessionStartLabel: string | undefined
        const active = currentActiveSession()
        if (active) {
          const startIso =
            active.created !== undefined && Number.isFinite(active.created) ? new Date(active.created).toISOString() : startOfRollingWindow(90)
          sessionStartLabel = formatSessionStart(startIso)
          const sessionUsage = await fetchUsage(options.apiKey, {
            start: startIso,
            groupBy: [SESSION_AFFINITY_KEY],
            resolution: 'day'
          })
          sessionToday = sessionSpendForDay(sessionUsage, active.id)
          sessionTotal = sessionSpendFromResponse(sessionUsage, active.id)
        }

        setData({
          keyInfo,
          models: aggregated.models,
          monthSpendFromUsage: aggregated.spend,
          todaySpend: spendForDay(usage),
          dailyAvg: dailyAverage(keyInfo.monthly_spend),
          avg7d: avgSpendLastNDays(usage, 7),
          avg30d: avgSpendLastNDays(usage, 30),
          todayTokens: tokensForDay(usage),
          dailyAvgTokens: {
            input: dailyAverage(aggregated.inputTokens),
            output: dailyAverage(aggregated.outputTokens),
            total: dailyAverage(aggregated.totalTokens)
          },
          avg7dTokens: avgTokensLastNDays(usage, 7),
          avg30dTokens: avgTokensLastNDays(usage, 30),
          lastMonthSpend,
          sessionTodaySpend: sessionToday.spend,
          sessionTotalSpend: sessionTotal.spend,
          sessionTodayRequests: sessionToday.requests,
          sessionTotalRequests: sessionTotal.requests,
          sessionTodayTokens: {
            input: sessionToday.inputTokens,
            output: sessionToday.outputTokens,
            total: sessionToday.inputTokens + sessionToday.outputTokens
          },
          sessionTotalTokens: {
            input: sessionTotal.inputTokens,
            output: sessionTotal.outputTokens,
            total: sessionTotal.inputTokens + sessionTotal.outputTokens
          },
          sessionStartLabel
        })
        setState({ status: 'ready', fetchedAt: new Date() })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        options.onError?.(message)
        setState({ status: 'error', message })
      } finally {
        inFlight = undefined
        if (pending) {
          pending = false
          void refresh()
        }
      }
    })()
    return inFlight
  }

  return {
    state,
    data,
    refresh,
    version,
    bumpVersion: () => setVersion((v) => v + 1),
    setSessionID: (id) => {
      if (id === sessionID()) return
      setSessionID(id)
      setVersion((v) => v + 1)
      void refresh()
    }
  }
}

export type { UsageResponse }
