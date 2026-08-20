import { createSignal } from 'solid-js'
import {
  aggregateByModel,
  avgSpendLastNDays,
  avgTokensLastNDays,
  endOfLastMonth,
  filterUsageByMonth,
  getApiKeySelf,
  getUsageSelf,
  spendForDay,
  startOfLastMonth,
  startOfRollingWindow,
  tokensForDay,
  totalSpendFromUsage,
  type ApiKeyInfo,
  type ModelUsage,
  type TokenBreakdown,
  type UsageResponse
} from './api'
import { dailyAverage } from './format'

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
}

export type RequestyStoreOptions = {
  apiKey: string
  onError?: (message: string) => void
  /** Injectable fetchers (defaults to the real API client); used by tests. */
  fetchApiKey?: typeof getApiKeySelf
  fetchUsage?: typeof getUsageSelf
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
}

export function createRequestyStore(options: RequestyStoreOptions): RequestyStore {
  const [state, setState] = createSignal<RefreshState>({ status: 'idle' })
  const [data, setData] = createSignal<RequestyData | undefined>(undefined)
  const [version, setVersion] = createSignal(0)

  const fetchApiKey = options.fetchApiKey ?? getApiKeySelf
  const fetchUsage = options.fetchUsage ?? getUsageSelf

  let inFlight: Promise<void> | undefined
  let pending = false

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
          lastMonthSpend
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
    bumpVersion: () => setVersion((v) => v + 1)
  }
}

export type { UsageResponse }
