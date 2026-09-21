import { createSignal } from 'solid-js'
import {
  type ApiKeyInfo,
  aggregateByModel,
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
  totalSpendFromUsage
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
  /** Id of the root session the session-cost fields belong to; undefined when none. */
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

/** Rolling window (days) fetched for the monthly/rolling-average metrics. */
const USAGE_WINDOW_DAYS = 30

/** Fallback session window (days) when the session's creation time is unknown. */
const SESSION_FALLBACK_WINDOW_DAYS = 90

/** Delay before requesting a repaint, so Solid has flushed the data update first. */
const RENDER_REQUEST_DELAY_MS = 0

export interface RequestyStoreOptions {
  apiKey: string
  onError?: (message: string) => void
  /**
   * Injectable Solid `createSignal`, so the store's reactive primitives are
   * created by the same Solid instance the host renders the plugin's JSX with.
   * `state.ts` is a `.ts` module whose `solid-js` import can resolve to a
   * different runtime copy than the `.tsx` widgets; signals from that copy are
   * read but never subscribed by the widget's memos (no repaint on refresh).
   * `tui.tsx` passes its own `createSignal`, which is proven to be the widget's
   * instance. Defaults to the module's `createSignal` for tests/non-host use.
   */
  createSignal?: typeof createSignal
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
  /**
   * Re-resolve and refresh the active session when the host reports an update
   * for it. Updates for any other session (e.g. a sub-agent child of a different
   * root) are ignored so the sidebar never flips to an unrelated session.
   */
  syncActiveSession: (sessionID: string) => void
  /** Reactive accessor for the currently-active session id (undefined when none). */
  activeSessionID: () => string | undefined
}

export function createRequestyStore(options: RequestyStoreOptions): RequestyStore {
  const makeSignal = options.createSignal ?? createSignal
  const [state, setState] = makeSignal<RefreshState>({ status: 'idle' })
  const [data, setData] = makeSignal<RequestyData | undefined>(undefined)
  const [session, setSession] = makeSignal<ActiveSession | undefined>(undefined)

  const fetchApiKey = options.fetchApiKey ?? getApiKeySelf
  const fetchUsage = options.fetchUsage ?? getUsageSelf

  let inFlight: Promise<void> | undefined
  let pending = false
  /**
   * The raw session id currently displayed (before resolving to its root), so
   * `syncActiveSession` can recognize an update for the displayed session even
   * when its resolved root has since changed (e.g. a parent session loading
   * after its child was first shown).
   */
  let displayedID: string | undefined

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
    const current = session()
    const next = id ? (options.activeSession?.(id) ?? { id, created: undefined }) : undefined
    // Track the raw displayed id even when the resolved root is unchanged, so a
    // later update for this exact session is recognized by `syncActiveSession`.
    displayedID = id
    if (next?.id === current?.id && next?.created === current?.created) return
    const idChanged = next?.id !== current?.id
    setSession(next)
    // Publish any cached figures for this session synchronously so the current
    // slot invocation can render them instead of the loading placeholder. Only on
    // a true revisit (id change) — a re-resolved `created` for the same id must
    // wait for the refresh rather than render the stale fallback-window snapshot.
    const cached = idChanged && next ? sessionCache.get(next.id) : undefined
    if (cached) {
      setData((previous) => (previous ? { ...previous, ...cached } : previous))
    }
    void refresh()
  }

  function syncActiveSession(id: string): void {
    // Only re-resolve updates for the session currently displayed; updates for
    // any other session (e.g. a sub-agent of a different root) are ignored.
    if (id !== displayedID) return
    setActiveSession(id)
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
          start: startOfRollingWindow(USAGE_WINDOW_DAYS),
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
            active.created !== undefined && Number.isFinite(active.created)
              ? new Date(active.created).toISOString()
              : startOfRollingWindow(SESSION_FALLBACK_WINDOW_DAYS)
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
        // Defer the repaint request to a macrotask: Solid flushes signal
        // subscribers in a microtask, so a synchronous requestRender() would
        // draw a frame before the widget's memo observes the new data and
        // nothing would request a second frame (the sidebar would then stay
        // stale until the next host event).
        setTimeout(() => options.onRender?.(), RENDER_REQUEST_DELAY_MS)
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
    syncActiveSession,
    activeSessionID: () => session()?.id
  }
}
