import { createSignal } from "solid-js"
import {
  DEFAULT_BASE_URL,
  aggregateByModel,
  avgSpendLastNDays,
  endOfLastMonth,
  getApiKeySelf,
  getUsageSelf,
  spendForDay,
  startOfCurrentMonth,
  startOfLastMonth,
  totalSpendFromUsage,
  type ApiKeyInfo,
  type ModelUsage,
  type UsageResponse,
} from "./api"

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
  avg7d: number
  avg30d: number
  lastMonthSpend: number
}

export type RequestyStoreOptions = {
  apiKey: string
  baseUrl?: string
  /** Minimum interval between automatic refreshes (activity-triggered). */
  activityDebounceMs: number
  onError?: (message: string) => void
  /** Injectable fetchers (defaults to the real API client); used by tests. */
  fetchApiKey?: typeof getApiKeySelf
  fetchUsage?: typeof getUsageSelf
}

export type RequestyStore = {
  state: () => RefreshState
  data: () => RequestyData | undefined
  /** Force a refresh (manual, interval, startup). */
  refresh: () => Promise<void>
  /** Debounced refresh for session-activity events. */
  refreshFromActivity: () => void
}

export function createRequestyStore(options: RequestyStoreOptions): RequestyStore {
  const [state, setState] = createSignal<RefreshState>({ status: "idle" })
  const [data, setData] = createSignal<RequestyData | undefined>(undefined)

  const fetchApiKey = options.fetchApiKey ?? getApiKeySelf
  const fetchUsage = options.fetchUsage ?? getUsageSelf

  let inFlight: Promise<void> | undefined
  let lastAttempt = 0
  let lastError: string | undefined

  async function refresh(): Promise<void> {
    if (inFlight) return inFlight
    lastAttempt = Date.now()
    setState((previous) => (previous.status === "ready" ? previous : { status: "loading" }))
    const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
    inFlight = (async () => {
      try {
        const keyInfo = await fetchApiKey(baseUrl, options.apiKey)
        const usage = await fetchUsage(baseUrl, options.apiKey, {
          start: startOfCurrentMonth(),
          groupBy: ["model_used"],
          resolution: "day",
        })
        const models = aggregateByModel(usage)
        const monthSpendFromUsage = models.reduce((total, model) => total + model.spend, 0)
        const todaySpend = spendForDay(usage)
        const avg7d = avgSpendLastNDays(usage, 7)
        const avg30d = avgSpendLastNDays(usage, 30)
        let lastMonthSpend = 0
        try {
          const lastMonthUsage = await fetchUsage(baseUrl, options.apiKey, {
            start: startOfLastMonth(),
            end: endOfLastMonth(),
            resolution: "day",
          })
          lastMonthSpend = totalSpendFromUsage(lastMonthUsage)
        } catch {
          // last month data is non-critical; continue without it
        }
        setData({ keyInfo, models, monthSpendFromUsage, todaySpend, avg7d, avg30d, lastMonthSpend })
        setState({ status: "ready", fetchedAt: new Date() })
        lastError = undefined
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        // Avoid spamming toasts for repeated identical failures.
        if (message !== lastError) options.onError?.(message)
        lastError = message
        setState({ status: "error", message })
      } finally {
        inFlight = undefined
      }
    })()
    return inFlight
  }

  function refreshFromActivity(): void {
    if (Date.now() - lastAttempt < options.activityDebounceMs) return
    void refresh()
  }

  return {
    state,
    data,
    refresh,
    refreshFromActivity,
  }
}

export type { UsageResponse }
