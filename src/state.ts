import { createSignal } from "solid-js"
import {
  aggregateByModel,
  avgSpendLastNDays,
  avgTokensLastNDays,
  endOfLastMonth,
  getApiKeySelf,
  getUsageSelf,
  spendForDay,
  startOfCurrentMonth,
  startOfLastMonth,
  tokensForDay,
  totalSpendFromUsage,
  type ApiKeyInfo,
  type ModelUsage,
  type TokenBreakdown,
  type UsageResponse,
} from "./api"
import { dailyAverage } from "./format"

export type RefreshState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; fetchedAt: Date }
  | { status: "error"; message: string }

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
  const [state, setState] = createSignal<RefreshState>({ status: "idle" })
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
    setState((previous) => (previous.status === "ready" ? previous : { status: "loading" }))
    inFlight = (async () => {
      try {
        const keyInfo = await fetchApiKey(options.apiKey)
        const usage = await fetchUsage(options.apiKey, {
          start: startOfCurrentMonth(),
          groupBy: ["model_used"],
          resolution: "day" as const,
        })
        const models = aggregateByModel(usage)
        const monthSpendFromUsage = models.reduce((total, model) => total + model.spend, 0)
        const monthInputTokens = models.reduce((total, model) => total + model.inputTokens, 0)
        const monthOutputTokens = models.reduce((total, model) => total + model.outputTokens, 0)
        const monthTotalTokens = models.reduce((total, model) => total + model.totalTokens, 0)
        const todaySpend = spendForDay(usage)
        const avg7d = avgSpendLastNDays(usage, 7)
        const avg30d = avgSpendLastNDays(usage, 30)
        const todayTokens = tokensForDay(usage)
        const dailyAvgTokens = {
          input: dailyAverage(monthInputTokens),
          output: dailyAverage(monthOutputTokens),
          total: dailyAverage(monthTotalTokens),
        }
        const avg7dTokens = avgTokensLastNDays(usage, 7)
        const avg30dTokens = avgTokensLastNDays(usage, 30)
        let lastMonthSpend = 0
        try {
          const lastMonthUsage = await fetchUsage(options.apiKey, {
            start: startOfLastMonth(),
            end: endOfLastMonth(),
            resolution: "day",
          })
          lastMonthSpend = totalSpendFromUsage(lastMonthUsage)
        } catch {
          // last month data is non-critical; continue without it
        }
        setData({ keyInfo, models, monthSpendFromUsage, todaySpend, dailyAvg: dailyAverage(keyInfo.monthly_spend), avg7d, avg30d, todayTokens, dailyAvgTokens, avg7dTokens, avg30dTokens, lastMonthSpend })
        setState({ status: "ready", fetchedAt: new Date() })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        options.onError?.(message)
        setState({ status: "error", message })
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
  }
}

export type { UsageResponse }
