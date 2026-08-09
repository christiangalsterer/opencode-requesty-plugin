import { createSignal } from "solid-js"
import {
  DEFAULT_BASE_URL,
  aggregateByModel,
  getApiKeySelf,
  getUsageSelf,
  startOfCurrentMonth,
  type ApiKeyInfo,
  type ModelUsage,
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
}

export type RequestyStoreOptions = {
  apiKey: string
  baseUrl?: string
  /** Minimum interval between automatic refreshes (activity-triggered). */
  activityDebounceMs: number
  onError?: (message: string) => void
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
        const keyInfo = await getApiKeySelf(baseUrl, options.apiKey)
        const usage = await getUsageSelf(baseUrl, options.apiKey, {
          start: startOfCurrentMonth(),
          groupBy: ["model_used"],
          resolution: "day",
        })
        const models = aggregateByModel(usage)
        const monthSpendFromUsage = models.reduce((total, model) => total + model.spend, 0)
        setData({ keyInfo, models, monthSpendFromUsage })
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
