import { createSignal } from 'solid-js'

import {
  aggregateByModel,
  type ApiKeyInfo,
  avgSpendLastNDays,
  avgTokensLastNDays,
  emptySessionSpend,
  endOfLastMonth,
  filterUsageByMonth,
  getApiKeySelf,
  getUsageSelf,
  type ModelUsage,
  SESSION_AFFINITY_KEY,
  type SessionSpend,
  sessionSpendForSessionIds,
  sessionSpendForSessionIdsForDay,
  sessionSpendTokens,
  spendForDay,
  startOfLastMonth,
  startOfRollingWindow,
  type TokenBreakdown,
  tokensForDay,
  totalSpendFromUsage,
  type UsageResponse
} from './api'
import { dailyAverage, formatSessionStart } from './format'

export type RefreshState = { status: 'idle' } | { status: 'loading' } | { status: 'ready'; fetchedAt: Date } | { status: 'error'; message: string }

export interface RequestyData {
  keyInfo: ApiKeyInfo
  models: ModelUsage[]
  todaySpend: number
  dailyAverage: number
  avg7d: number
  avg30d: number
  todayTokens: TokenBreakdown
  dailyAverageTokens: TokenBreakdown
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
  /** Id of the session the session-cost fields belong to; undefined when none. */
  sessionId: string | undefined
  /** Number of descendant (sub-agent) sessions folded into the session totals. */
  subagentCount: number
}

/** The active session to attribute cost to. `created` is an epoch-ms timestamp. */
export interface ActiveSession {
  id: string
  created: number | undefined
}

/**
 * The session-specific slice of `RequestyData`, cached per session id so a
 * revisited session can render its figures immediately (the sidebar cannot
 * repaint on a plugin-owned refresh completion).
 */
type SessionSnapshot = Pick<
  RequestyData,
  | 'sessionTodaySpend'
  | 'sessionTotalSpend'
  | 'sessionTodayRequests'
  | 'sessionTotalRequests'
  | 'sessionTodayTokens'
  | 'sessionTotalTokens'
  | 'sessionStartLabel'
  | 'sessionId'
  | 'subagentCount'
>

/** Maximum number of per-session snapshots retained (oldest evicted first). */
const SESSION_CACHE_LIMIT = 50

export interface RequestyStoreOptions {
  apiKey: string
  onError?: (message: string) => void
  /** Injectable fetchers (defaults to the real API client); used by tests. */
  fetchApiKey?: typeof getApiKeySelf
  fetchUsage?: typeof getUsageSelf
  /** Injectable active-session resolver: given a session id, return it with its created timestamp (epoch ms). */
  activeSession?: (sessionID: string) => ActiveSession | undefined
  /**
   * Injectable resolver for a session's descendant (sub-agent) session ids,
   * used to fold sub-agent spend into the parent session totals. Defaults to
   * resolving no children. Best-effort: a rejected promise yields no children.
   */
  fetchSessionChildren?: (sessionID: string) => Promise<string[]>
  /** Called after fresh data is written, so the caller can force a host repaint. */
  onRender?: () => void
}

export interface RequestyStore {
  state: () => RefreshState
  data: () => RequestyData | undefined
  /** Error message when the last refresh failed; undefined otherwise. */
  errorMessage: () => string | undefined
  /** Time of the last successful refresh; undefined when not ready. */
  fetchedAt: () => Date | undefined
  /** Force a refresh (manual, interval, startup, session events). */
  refresh: () => Promise<void>
  /** Set the active session id; refreshes session cost on the next refresh. */
  setSessionID: (sessionID: string | undefined) => void
  /** Reactive accessor for the currently-active session id (undefined when none). */
  activeSessionID: () => string | undefined
}

export function createRequestyStore(options: RequestyStoreOptions): RequestyStore {
  const [state, setState] = createSignal<RefreshState>({ status: 'idle' })
  const [data, setData] = createSignal<RequestyData | undefined>(undefined)
  const [session, setSession] = createSignal<ActiveSession | undefined>(undefined)

  const fetchApiKey = options.fetchApiKey ?? getApiKeySelf
  const fetchUsage = options.fetchUsage ?? getUsageSelf

  let inFlight: Promise<void> | undefined
  let pending = false

  /** Per-session snapshots, keyed by session id; refreshed on every session-aware refresh. */
  const sessionCache = new Map<string, SessionSnapshot>()

  function cacheSessionSnapshot(snapshot: SessionSnapshot): void {
    if (!snapshot.sessionId) return
    sessionCache.delete(snapshot.sessionId)
    sessionCache.set(snapshot.sessionId, snapshot)
    while (sessionCache.size > SESSION_CACHE_LIMIT) {
      const oldest = sessionCache.keys().next().value
      if (oldest === undefined) break
      sessionCache.delete(oldest)
    }
  }

  function setActiveSession(id: string | undefined): void {
    const next = id ? (options.activeSession?.(id) ?? { id, created: undefined }) : undefined
    if (next?.id === session()?.id) return
    setSession(next)
    // Publish any cached figures for this session synchronously so the current
    // slot invocation can render them instead of the loading placeholder.
    const cached = next ? sessionCache.get(next.id) : undefined
    if (cached) {
      setData((previous) => (previous ? { ...previous, ...cached } : previous))
    }
    void refresh()
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

        const lastMonthUsage = await fetchUsage(options.apiKey, {
          start: startOfLastMonth(),
          end: endOfLastMonth(),
          resolution: 'day'
        }).catch(() => undefined)
        const lastMonthSpend = lastMonthUsage ? totalSpendFromUsage(lastMonthUsage) : 0

        let sessionToday: SessionSpend = emptySessionSpend()
        let sessionTotal: SessionSpend = emptySessionSpend()
        let sessionStartLabel: string | undefined
        let subagentCount = 0
        const active = session()
        if (active) {
          const head = options.fetchSessionChildren?.(active.id) ?? Promise.resolve([])
          const children = await head.catch(() => [])
          subagentCount = children.length
          const sessionIds = new Set<string>([active.id, ...children])
          const startIso =
            active.created !== undefined && Number.isFinite(active.created) ? new Date(active.created).toISOString() : startOfRollingWindow(90)
          sessionStartLabel = formatSessionStart(startIso)
          const sessionUsage = await fetchUsage(options.apiKey, {
            start: startIso,
            groupBy: [SESSION_AFFINITY_KEY],
            resolution: 'day'
          })
          sessionToday = sessionSpendForSessionIdsForDay(sessionUsage, sessionIds)
          sessionTotal = sessionSpendForSessionIds(sessionUsage, sessionIds)
        }

        const snapshot: SessionSnapshot = {
          sessionTodaySpend: sessionToday.spend,
          sessionTotalSpend: sessionTotal.spend,
          sessionTodayRequests: sessionToday.requests,
          sessionTotalRequests: sessionTotal.requests,
          sessionTodayTokens: sessionSpendTokens(sessionToday),
          sessionTotalTokens: sessionSpendTokens(sessionTotal),
          sessionStartLabel,
          sessionId: active?.id,
          subagentCount
        }
        cacheSessionSnapshot(snapshot)

        setData({
          keyInfo,
          models: aggregated.models,
          todaySpend: spendForDay(usage),
          dailyAverage: dailyAverage(keyInfo.monthly_spend),
          avg7d: avgSpendLastNDays(usage, 7),
          avg30d: avgSpendLastNDays(usage, 30),
          todayTokens: tokensForDay(usage),
          dailyAverageTokens: {
            input: dailyAverage(aggregated.inputTokens),
            output: dailyAverage(aggregated.outputTokens),
            total: dailyAverage(aggregated.totalTokens)
          },
          avg7dTokens: avgTokensLastNDays(usage, 7),
          avg30dTokens: avgTokensLastNDays(usage, 30),
          lastMonthSpend,
          ...snapshot
        })
        options.onRender?.()
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
    errorMessage: () => {
      const current = state()
      return current.status === 'error' ? current.message : undefined
    },
    fetchedAt: () => {
      const current = state()
      return current.status === 'ready' ? current.fetchedAt : undefined
    },
    refresh,
    setSessionID: setActiveSession,
    activeSessionID: () => session()?.id
  }
}

export type { UsageResponse }
