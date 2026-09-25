import { describe, mock, test } from 'bun:test'
import assert from 'node:assert/strict'
import { createSignal } from 'solid-js'
import type { ApiKeyInfo, UsageQuery, UsageResponse } from '../src/api'
import {
  avgSpendLastNDays,
  avgTokensLastNDays,
  SESSION_AFFINITY_KEY,
  sessionSpendForSessionIds,
  sessionSpendForSessionIdsForDay,
  startOfUsageWindow
} from '../src/api'
import { CALENDAR_PROJECTION, dailyAverage, WORKDAY_PROJECTION } from '../src/format'
import type { ProjectionSettings } from '../src/settings'
import { createRequestyStore } from '../src/state'

const KEY_INFO: ApiKeyInfo = {
  id: 'key-1',
  name: 'test-key',
  logging: false,
  monthly_spend: 12.34,
  monthly_limit: 50,
  permissions: { manage: 'none', completions: 'write' }
}

const TODAY_KEY = new Date().toISOString().slice(0, 10)

const USAGE: UsageResponse = {
  usage: {
    [TODAY_KEY]: {
      spend: 8,
      grouped_data: [
        {
          group_by_values: { model_used: 'openai/gpt-5' },
          spend: 8,
          input_tokens: 100,
          output_tokens: 50,
          total_tokens: 150,
          completions_requests: 4
        }
      ]
    }
  }
}

function createStore(opts: {
  fetchApiKey?: () => Promise<ApiKeyInfo>
  fetchUsage?: (query?: UsageQuery) => Promise<UsageResponse>
  onError?: (msg: string) => void
  activeSession?: (id: string) => { id: string; created: number | undefined } | undefined
  fetchSessionChildren?: (id: string) => Promise<string[]>
  onRender?: () => void
  createSignal?: typeof createSignal
  projection?: ProjectionSettings
}) {
  return createRequestyStore({
    apiKey: 'sk-test',
    createSignal: opts.createSignal,
    projection: opts.projection,
    onError: opts.onError,
    fetchApiKey: () => opts.fetchApiKey?.() ?? Promise.resolve(KEY_INFO),
    fetchUsage: (_key, query) => opts.fetchUsage?.(query) ?? Promise.resolve(USAGE),
    activeSession: opts.activeSession,
    fetchSessionChildren: opts.fetchSessionChildren,
    onRender: opts.onRender
  })
}

/** Let the refresh chain (including any pending follow-up) run to completion. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20))
}

describe('createRequestyStore', () => {
  test('refresh populates data and sets state to ready', async () => {
    const onRender = mock(() => {})
    const store = createStore({ onRender })
    assert.equal(store.state().status, 'idle')
    await store.refresh()
    assert.equal(store.state().status, 'ready')
    // onRender is deferred to a macrotask so it lands after Solid flushes.
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.equal(onRender.mock.calls.length, 1)
    const data = store.data()
    assert.ok(data)
    assert.equal(data!.keyInfo.name, 'test-key')
    assert.equal(data!.models.length, 1)
    assert.equal(data!.models[0].model, 'openai/gpt-5')
    assert.equal(data!.todaySpend, 8)
    assert.equal(data!.dailyAverage, dailyAverage(KEY_INFO.monthly_spend))
    // avg7d/avg30d and the 7d token window exclude today.
    assert.equal(data!.avg7d, avgSpendLastNDays(USAGE, 7))
    assert.equal(data!.avg30d, avgSpendLastNDays(USAGE, 30))
    assert.deepEqual(data!.todayTokens, { input: 100, output: 50, total: 150 })
    assert.deepEqual(data!.dailyAverageTokens, {
      input: dailyAverage(data!.models.reduce((sum, model) => sum + model.inputTokens, 0)),
      output: dailyAverage(data!.models.reduce((sum, model) => sum + model.outputTokens, 0)),
      total: dailyAverage(data!.models.reduce((sum, model) => sum + model.totalTokens, 0))
    })
    assert.deepEqual(data!.avg7dTokens, { input: 0, output: 0, total: 0 })
    assert.deepEqual(data!.avg30dTokens, avgTokensLastNDays(USAGE, 30))
    assert.equal(data!.lastMonthSpend, 0)
    // No session id → session metrics are all zero with no start label.
    assert.equal(data!.sessionTodaySpend, 0)
    assert.equal(data!.sessionTotalSpend, 0)
    assert.equal(data!.sessionTodayRequests, 0)
    assert.equal(data!.sessionTotalRequests, 0)
    assert.deepEqual(data!.sessionTodayTokens, { input: 0, output: 0, total: 0 })
    assert.deepEqual(data!.sessionTotalTokens, { input: 0, output: 0, total: 0 })
    assert.equal(data!.sessionStartLabel, undefined)
    assert.equal(data!.sessionId, undefined)
    assert.equal(store.activeSessionID(), undefined)
  })

  test('errorMessage and fetchedAt accessors narrow the refresh state', async () => {
    const store = createStore({})
    assert.equal(store.errorMessage(), undefined)
    assert.equal(store.fetchedAt(), undefined)

    await store.refresh()
    assert.equal(store.errorMessage(), undefined)
    assert.ok(store.fetchedAt() instanceof Date)
  })

  test('errorMessage returns the message when the refresh failed', async () => {
    const store = createStore({ fetchApiKey: () => Promise.reject(new Error('boom')) })
    await store.refresh()
    assert.equal(store.errorMessage(), 'boom')
    assert.equal(store.fetchedAt(), undefined)
  })

  test('error sets state to error and calls onError', async () => {
    const onError = mock((_message: string) => {})
    const store = createStore({
      fetchApiKey: () => Promise.reject(new Error('boom')),
      onError
    })
    await store.refresh()
    assert.equal(store.state().status, 'error')
    assert.equal((store.state() as { message: string }).message, 'boom')
    assert.equal(store.data(), undefined)
    assert.equal(onError.mock.calls.length, 1)
    assert.equal(onError.mock.calls[0][0], 'boom')
  })

  test('concurrent refresh calls share a single in-flight promise, then run a follow-up', async () => {
    let calls = 0
    const store = createStore({
      fetchApiKey: () => {
        calls++
        return new Promise<ApiKeyInfo>((resolve) => setTimeout(() => resolve(KEY_INFO), 20))
      }
    })
    const p1 = store.refresh()
    const p2 = store.refresh()
    await Promise.all([p1, p2])
    // p2 was debounced (pending=true), follow-up refresh starts immediately in finally
    assert.equal(calls, 2)
    // Wait for follow-up to complete
    await new Promise((r) => setTimeout(r, 50))
    assert.equal(store.state().status, 'ready')
  })

  test('repeated identical errors call onError each time', async () => {
    const onError = mock((_message: string) => {})
    const store = createStore({
      fetchApiKey: () => Promise.reject(new Error('same')),
      onError
    })
    await store.refresh()
    await store.refresh()
    await store.refresh()
    assert.equal(onError.mock.calls.length, 3)
  })

  test('a different error calls onError again', async () => {
    const onError = mock((_message: string) => {})
    let err = 'first'
    const store = createStore({
      fetchApiKey: () => Promise.reject(new Error(err)),
      onError
    })
    await store.refresh()
    err = 'second'
    await store.refresh()
    assert.equal(onError.mock.calls.length, 2)
    assert.equal(onError.mock.calls[0][0], 'first')
    assert.equal(onError.mock.calls[1][0], 'second')
  })

  test('multi-day usage metrics compute todaySpend, avg7d, and avg30d', async () => {
    const now = new Date()
    const usage: UsageResponse = { usage: {} }
    const spendByDay = new Map<string, number>()
    const inputTokensByDay = new Map<string, number>()
    const outputTokensByDay = new Map<string, number>()
    const totalTokensByDay = new Map<string, number>()
    for (let offset = 0; offset < 8; offset++) {
      const day = new Date(now)
      day.setUTCDate(day.getUTCDate() - offset)
      const key = day.toISOString().slice(0, 10)
      const spend = (offset + 1) * 10
      const inputTokens = (offset + 1) * 100
      const outputTokens = (offset + 1) * 50
      const totalTokens = (offset + 1) * 150
      spendByDay.set(key, spend)
      inputTokensByDay.set(key, inputTokens)
      outputTokensByDay.set(key, outputTokens)
      totalTokensByDay.set(key, totalTokens)
      usage.usage[key] = {
        spend,
        grouped_data: [
          {
            group_by_values: { model_used: 'openai/gpt-5' },
            spend,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            total_tokens: totalTokens,
            completions_requests: 1
          }
        ]
      }
    }

    const store = createStore({
      fetchUsage: () => Promise.resolve(usage)
    })
    await store.refresh()

    const data = store.data()
    assert.ok(data)
    const todayKey = now.toISOString().slice(0, 10)
    assert.equal(data!.todaySpend, spendByDay.get(todayKey))
    assert.equal(data!.dailyAverage, dailyAverage(KEY_INFO.monthly_spend))

    let expected7d = 0
    for (let offset = 1; offset <= 7; offset++) {
      const day = new Date(now)
      day.setUTCDate(day.getUTCDate() - offset)
      const key = day.toISOString().slice(0, 10)
      expected7d += spendByDay.get(key) ?? 0
    }
    expected7d /= 7

    let expected30d = 0
    for (let offset = 1; offset <= 30; offset++) {
      const day = new Date(now)
      day.setUTCDate(day.getUTCDate() - offset)
      const key = day.toISOString().slice(0, 10)
      expected30d += spendByDay.get(key) ?? 0
    }
    expected30d /= 30

    assert.equal(data!.avg7d, expected7d)
    assert.equal(data!.avg30d, expected30d)

    const currentMonthPrefix = todayKey.slice(0, 7)
    const expectedMonthSpend = [...spendByDay.entries()]
      .filter(([key]) => key.startsWith(currentMonthPrefix))
      .reduce((sum, [, spend]) => sum + spend, 0)
    assert.equal(
      data!.models.reduce((sum, model) => sum + model.spend, 0),
      expectedMonthSpend
    )

    function avgTokensForDays(days: number) {
      let input = 0
      let output = 0
      let total = 0
      for (let offset = 1; offset <= days; offset++) {
        const day = new Date(now)
        day.setUTCDate(day.getUTCDate() - offset)
        const key = day.toISOString().slice(0, 10)
        input += inputTokensByDay.get(key) ?? 0
        output += outputTokensByDay.get(key) ?? 0
        total += totalTokensByDay.get(key) ?? 0
      }
      return { input: input / days, output: output / days, total: total / days }
    }

    assert.deepEqual(data!.todayTokens, {
      input: inputTokensByDay.get(todayKey),
      output: outputTokensByDay.get(todayKey),
      total: totalTokensByDay.get(todayKey)
    })
    assert.deepEqual(data!.avg7dTokens, avgTokensForDays(7))
    assert.deepEqual(data!.avg30dTokens, avgTokensForDays(30))

    const expectedMonthInputTokens = [...inputTokensByDay.entries()]
      .filter(([key]) => key.startsWith(currentMonthPrefix))
      .reduce((sum, [, tokens]) => sum + tokens, 0)
    const expectedMonthOutputTokens = [...outputTokensByDay.entries()]
      .filter(([key]) => key.startsWith(currentMonthPrefix))
      .reduce((sum, [, tokens]) => sum + tokens, 0)
    const expectedMonthTotalTokens = [...totalTokensByDay.entries()]
      .filter(([key]) => key.startsWith(currentMonthPrefix))
      .reduce((sum, [, tokens]) => sum + tokens, 0)
    assert.deepEqual(data!.dailyAverageTokens, {
      input: dailyAverage(expectedMonthInputTokens),
      output: dailyAverage(expectedMonthOutputTokens),
      total: dailyAverage(expectedMonthTotalTokens)
    })
  })

  test('current month metrics exclude previous month usage from rolling window', async () => {
    const now = new Date()
    const usage: UsageResponse = { usage: {} }
    const spendByDay = new Map<string, number>()
    for (let offset = 0; offset < 35; offset++) {
      const day = new Date(now)
      day.setUTCDate(day.getUTCDate() - offset)
      const key = day.toISOString().slice(0, 10)
      const spend = 10
      spendByDay.set(key, spend)
      usage.usage[key] = {
        spend,
        grouped_data: [
          {
            group_by_values: { model_used: 'openai/gpt-5' },
            spend,
            input_tokens: 0,
            output_tokens: 0,
            total_tokens: 0,
            completions_requests: 1
          }
        ]
      }
    }

    const store = createStore({
      fetchUsage: () => Promise.resolve(usage)
    })
    await store.refresh()

    const data = store.data()
    assert.ok(data)

    const currentMonthPrefix = now.toISOString().slice(0, 7)
    const expectedMonthSpend = [...spendByDay.entries()]
      .filter(([key]) => key.startsWith(currentMonthPrefix))
      .reduce((sum, [, spend]) => sum + spend, 0)

    assert.equal(
      data!.models.reduce((sum, model) => sum + model.spend, 0),
      expectedMonthSpend
    )
    // avg30d averages the 30 completed days before today, all $10
    assert.equal(data!.avg30d, 10)
  })

  test('populates session cost metrics from a session-created start', async () => {
    const sessionId = 'ses_test'
    const now = new Date()
    const todayKey = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString().slice(0, 10)
    const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1))
    const yesterdayKey = yesterday.toISOString().slice(0, 10)
    const sessionUsage = {
      usage: {
        [yesterdayKey]: {
          grouped_data: [
            {
              group_by_values: { 'extra.X-Session-Affinity': sessionId },
              spend: '1.00',
              completions_requests: 5,
              input_tokens: 100,
              output_tokens: 50
            }
          ]
        },
        [todayKey]: {
          grouped_data: [
            {
              group_by_values: { 'extra.X-Session-Affinity': sessionId },
              spend: '2.50',
              completions_requests: 7,
              input_tokens: 200,
              output_tokens: 100
            },
            { group_by_values: { 'extra.X-Session-Affinity': 'other' }, spend: '9.00', completions_requests: 1, input_tokens: 10, output_tokens: 10 }
          ]
        }
      }
    } as unknown as UsageResponse
    const created = yesterday.getTime() + 12 * 3600 * 1000
    const store = createStore({
      activeSession: () => ({ id: sessionId, created }),
      fetchUsage: () => Promise.resolve(sessionUsage)
    })
    store.setSessionID(sessionId)
    await store.refresh()

    const data = store.data()
    assert.ok(data)
    assert.equal(data!.sessionStartLabel, yesterdayKey)
    assert.equal(data!.sessionTodaySpend, 2.5)
    assert.equal(data!.sessionTodayRequests, 7)
    assert.deepEqual(data!.sessionTodayTokens, { input: 200, output: 100, total: 300 })
    assert.equal(data!.sessionTotalSpend, 3.5)
    assert.equal(data!.sessionTotalRequests, 12)
    assert.deepEqual(data!.sessionTotalTokens, { input: 300, output: 150, total: 450 })
    assert.equal(data!.sessionId, sessionId)
    assert.equal(store.activeSessionID(), sessionId)
  })

  test('falls back to a rolling 90-day window when the session has no created timestamp', async () => {
    const sessionId = 'ses_test'
    const now = new Date()
    const todayKey = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString().slice(0, 10)
    const sessionUsage = {
      usage: {
        [todayKey]: {
          grouped_data: [
            {
              group_by_values: { 'extra.X-Session-Affinity': sessionId },
              spend: '0.75',
              completions_requests: 3,
              input_tokens: 50,
              output_tokens: 25
            }
          ]
        }
      }
    } as unknown as UsageResponse
    const store = createStore({
      activeSession: () => ({ id: sessionId, created: undefined }),
      fetchUsage: () => Promise.resolve(sessionUsage)
    })
    store.setSessionID(sessionId)
    await store.refresh()

    const data = store.data()
    assert.ok(data)
    assert.ok(data!.sessionStartLabel)
    assert.equal(data!.sessionStartLabel!.length, 10)
    assert.equal(data!.sessionTodaySpend, 0.75)
    assert.equal(data!.sessionTotalSpend, 0.75)
  })

  test('session metrics stay zero when no session id is set', async () => {
    const store = createStore({
      activeSession: () => ({ id: 'ses_test', created: undefined })
    })
    await store.refresh()
    const data = store.data()
    assert.ok(data)
    assert.equal(data!.sessionStartLabel, undefined)
    assert.equal(data!.sessionTotalSpend, 0)
    assert.equal(data!.sessionTodayRequests, 0)
  })

  test('setSessionID triggers a refresh that populates session metrics', async () => {
    const sessionId = 'ses_test'
    const now = new Date()
    const created = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12)
    const todayKey = new Date(created).toISOString().slice(0, 10)
    const sessionUsage = {
      usage: {
        [todayKey]: {
          grouped_data: [
            {
              group_by_values: { 'extra.X-Session-Affinity': sessionId },
              spend: '1.20',
              completions_requests: 4,
              input_tokens: 40,
              output_tokens: 20
            }
          ]
        }
      }
    } as unknown as UsageResponse
    const store = createStore({
      activeSession: () => ({ id: sessionId, created }),
      fetchUsage: () => Promise.resolve(sessionUsage)
    })
    // No session id at startup → session section remains hidden.
    await store.refresh()
    assert.equal(store.data()!.sessionStartLabel, undefined)

    // Setting the id triggers an automatic refresh that populates it.
    store.setSessionID(sessionId)
    await store.refresh()
    const data = store.data()
    assert.ok(data)
    assert.equal(data!.sessionStartLabel, todayKey)
    assert.equal(data!.sessionTodaySpend, 1.2)
    assert.equal(data!.sessionTotalSpend, 1.2)
  })

  test('setSessionID with the same id does not schedule extra work', async () => {
    const sessionId = 'ses_test'
    let calls = 0
    const store = createStore({
      fetchApiKey: () => {
        calls++
        return Promise.resolve(KEY_INFO)
      },
      activeSession: () => ({ id: sessionId, created: undefined })
    })
    store.setSessionID(sessionId)
    assert.equal(calls, 1)
    // Repeated identical ids are no-ops — no further refresh is scheduled.
    store.setSessionID(sessionId)
    store.setSessionID(sessionId)
    assert.equal(calls, 1)
  })

  test('setSessionID re-resolves when the session created timestamp becomes available', async () => {
    const sessionId = 'ses_test'
    const created = Date.UTC(2026, 7, 27, 12)
    const expectedStartLabel = new Date(created).toISOString().slice(0, 10)
    let calls = 0
    let resolvedCreated: number | undefined
    const store = createStore({
      fetchApiKey: () => {
        calls++
        return Promise.resolve(KEY_INFO)
      },
      activeSession: () => ({ id: sessionId, created: resolvedCreated })
    })

    // First resolution: host has no created timestamp yet → fallback window.
    store.setSessionID(sessionId)
    await new Promise((resolve) => setTimeout(resolve, 10))
    assert.equal(calls, 1)
    assert.notEqual(store.data()!.sessionStartLabel, expectedStartLabel)

    // Same id, still no created → no extra work.
    store.setSessionID(sessionId)
    assert.equal(calls, 1)

    // Host now knows the created timestamp → same id but must re-resolve.
    resolvedCreated = created
    store.setSessionID(sessionId)
    assert.equal(calls, 2)
    await new Promise((resolve) => setTimeout(resolve, 10))
    assert.equal(store.data()!.sessionStartLabel, expectedStartLabel)
  })

  test('syncActiveSession ignores an update for an unrelated session', async () => {
    const sessionA = 'ses_a'
    const sessionB = 'ses_b'
    let calls = 0
    const store = createStore({
      fetchApiKey: () => {
        calls++
        return Promise.resolve(KEY_INFO)
      },
      activeSession: (id) => ({ id, created: undefined })
    })
    store.setSessionID(sessionA)
    await new Promise((resolve) => setTimeout(resolve, 10))
    assert.equal(calls, 1)
    assert.equal(store.activeSessionID(), sessionA)

    // An update for a different session must not flip the active session.
    store.syncActiveSession(sessionB)
    assert.equal(store.activeSessionID(), sessionA)
    assert.equal(calls, 1)
  })

  test('syncActiveSession re-resolves the active session when created becomes available', async () => {
    const sessionId = 'ses_test'
    const created = Date.UTC(2026, 7, 27, 12)
    const expectedStartLabel = new Date(created).toISOString().slice(0, 10)
    let calls = 0
    let resolvedCreated: number | undefined
    const store = createStore({
      fetchApiKey: () => {
        calls++
        return Promise.resolve(KEY_INFO)
      },
      activeSession: () => ({ id: sessionId, created: resolvedCreated })
    })

    store.setSessionID(sessionId)
    await new Promise((resolve) => setTimeout(resolve, 10))
    assert.equal(calls, 1)

    // Same id, unchanged created → no extra work.
    store.syncActiveSession(sessionId)
    assert.equal(calls, 1)

    // Host now reports the created timestamp → re-resolve and refresh.
    resolvedCreated = created
    store.syncActiveSession(sessionId)
    assert.equal(calls, 2)
    await new Promise((resolve) => setTimeout(resolve, 10))
    assert.equal(store.data()!.sessionStartLabel, expectedStartLabel)
  })

  test('syncActiveSession maps a child update to its root session', async () => {
    const rootId = 'ses_root'
    const childId = 'ses_child'
    let calls = 0
    const store = createStore({
      fetchApiKey: () => {
        calls++
        return Promise.resolve(KEY_INFO)
      },
      activeSession: (id) => ({ id: id === childId ? rootId : id, created: undefined })
    })

    // Displaying the child resolves to the root.
    store.setSessionID(childId)
    await new Promise((resolve) => setTimeout(resolve, 10))
    assert.equal(store.activeSessionID(), rootId)
    assert.equal(calls, 1)

    // A child update resolves to the active root → re-resolve (no-op here since
    // created is unchanged, so no extra fetch).
    store.syncActiveSession(childId)
    assert.equal(store.activeSessionID(), rootId)
    assert.equal(calls, 1)
  })

  test('syncActiveSession re-roots a displayed child once its parent becomes known', async () => {
    const childId = 'ses_child'
    const parentId = 'ses_parent'
    let parentID: string | undefined
    let created: number | undefined
    const store = createStore({
      activeSession: (id) => {
        const rootID = id === childId && parentID ? parentID : id
        return { id: rootID, created: rootID === parentId ? created : undefined }
      }
    })

    // The child is displayed before its parent session is known → treated as root.
    store.setSessionID(childId)
    await new Promise((resolve) => setTimeout(resolve, 10))
    assert.equal(store.activeSessionID(), childId)

    // The parent session becomes known and an update for the displayed child fires.
    parentID = parentId
    created = Date.UTC(2026, 7, 27, 12)
    store.syncActiveSession(childId)
    assert.equal(store.activeSessionID(), parentId)
  })

  test('setSessionID publishes cached session figures immediately on revisit', async () => {
    const sessionA = 'ses_a'
    const sessionB = 'ses_b'
    const now = new Date()
    const created = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12)
    const todayKey = new Date(created).toISOString().slice(0, 10)
    const sessionUsage = {
      usage: {
        [todayKey]: {
          grouped_data: [
            {
              group_by_values: { 'extra.X-Session-Affinity': sessionA },
              spend: '1.20',
              completions_requests: 4,
              input_tokens: 40,
              output_tokens: 20
            }
          ]
        }
      }
    } as unknown as UsageResponse
    const store = createStore({
      activeSession: (id) => ({ id, created }),
      fetchUsage: () => Promise.resolve(sessionUsage)
    })

    // Load session A so its snapshot lands in the cache.
    store.setSessionID(sessionA)
    await store.refresh()
    assert.equal(store.data()!.sessionId, sessionA)
    assert.equal(store.data()!.sessionTotalSpend, 1.2)

    // Switch to an uncached session B → stale id, still loading.
    store.setSessionID(sessionB)
    assert.equal(store.data()!.sessionId, sessionA)

    // Revisit A → cached figures published synchronously, before any refresh resolves.
    store.setSessionID(sessionA)
    assert.equal(store.data()!.sessionId, sessionA)
    assert.equal(store.data()!.sessionTotalSpend, 1.2)
  })

  test('an uncached session keeps the stale session id until its refresh resolves', async () => {
    const sessionA = 'ses_a'
    const sessionB = 'ses_b'
    const store = createStore({
      activeSession: (id) => ({ id, created: undefined })
    })
    await store.refresh()
    store.setSessionID(sessionA)
    await settle()
    assert.equal(store.data()!.sessionId, sessionA)

    // B has never been fetched → no cached snapshot, so the id stays stale
    // until the refresh chain (including any pending follow-up) settles.
    store.setSessionID(sessionB)
    assert.equal(store.data()!.sessionId, sessionA)
    await settle()
    assert.equal(store.data()!.sessionId, sessionB)
  })

  test('folds descendant sub-agent cost into the session totals', async () => {
    const sessionId = 'ses_test'
    const childId = 'ses_child'
    const now = new Date()
    const created = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12)
    const todayKey = new Date(created).toISOString().slice(0, 10)
    const sessionUsage = {
      usage: {
        [todayKey]: {
          grouped_data: [
            {
              group_by_values: { 'extra.X-Session-Affinity': sessionId },
              spend: '1.00',
              completions_requests: 2,
              input_tokens: 40,
              output_tokens: 20
            },
            {
              group_by_values: { 'extra.X-Session-Affinity': childId },
              spend: '2.50',
              completions_requests: 3,
              input_tokens: 60,
              output_tokens: 30
            },
            { group_by_values: { 'extra.X-Session-Affinity': 'other' }, spend: '9.00', completions_requests: 1, input_tokens: 10, output_tokens: 10 }
          ]
        }
      }
    } as unknown as UsageResponse
    const store = createStore({
      activeSession: () => ({ id: sessionId, created }),
      fetchSessionChildren: () => Promise.resolve([childId]),
      fetchUsage: () => Promise.resolve(sessionUsage)
    })
    store.setSessionID(sessionId)
    await store.refresh()

    const data = store.data()
    assert.ok(data)
    // Parent + child combined; the unrelated row is excluded.
    assert.equal(data!.subagentCount, 1)
    assert.equal(data!.sessionTodaySpend, 3.5)
    assert.equal(data!.sessionTodayRequests, 5)
    assert.deepEqual(data!.sessionTodayTokens, { input: 100, output: 50, total: 150 })
    assert.equal(data!.sessionTotalSpend, 3.5)
  })

  test('a rejected fetchSessionChildren resolves zero subagents without failing the refresh', async () => {
    const sessionId = 'ses_test'
    const now = new Date()
    const created = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12)
    const todayKey = new Date(created).toISOString().slice(0, 10)
    const sessionUsage = {
      usage: {
        [todayKey]: {
          grouped_data: [
            {
              group_by_values: { 'extra.X-Session-Affinity': sessionId },
              spend: '1.00',
              completions_requests: 1,
              input_tokens: 10,
              output_tokens: 5
            }
          ]
        }
      }
    } as unknown as UsageResponse
    const store = createStore({
      activeSession: () => ({ id: sessionId, created }),
      fetchSessionChildren: () => Promise.reject(new Error('nope')),
      fetchUsage: () => Promise.resolve(sessionUsage)
    })
    store.setSessionID(sessionId)
    await store.refresh()

    const data = store.data()
    assert.ok(data)
    assert.equal(store.state().status, 'ready')
    assert.equal(data!.subagentCount, 0)
    assert.equal(data!.sessionTodaySpend, 1.0)
  })

  test('uses the injected createSignal for its reactive primitives', async () => {
    let signalCount = 0
    const injected = (<T>(value: T) => {
      signalCount++
      return createSignal(value)
    }) as typeof createSignal
    const store = createStore({ createSignal: injected })
    // state, data, session
    assert.equal(signalCount, 3)
    await store.refresh()
    assert.equal(store.state().status, 'ready')
    assert.ok(store.data())
  })

  test('a session-less refresh issues a single usage request', async () => {
    const queries: UsageQuery[] = []
    const store = createStore({
      fetchUsage: (query) => {
        if (query) queries.push(query)
        return Promise.resolve(USAGE)
      }
    })
    await store.refresh()
    assert.equal(queries.length, 1)
    assert.deepEqual(queries[0].groupBy, ['model_used'])
  })

  test('a recent session reuses the global usage request (single call)', async () => {
    const sessionId = 'ses_test'
    const now = new Date()
    const created = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12)
    const queries: UsageQuery[] = []
    const store = createStore({
      activeSession: () => ({ id: sessionId, created }),
      fetchUsage: (query) => {
        if (query) queries.push(query)
        return Promise.resolve(USAGE)
      }
    })
    store.setSessionID(sessionId)
    // `setSessionID` triggers the refresh; wait for it to settle.
    await new Promise((resolve) => setTimeout(resolve, 10))
    assert.equal(queries.length, 1)
    assert.deepEqual(queries[0].groupBy, ['model_used', SESSION_AFFINITY_KEY])
  })

  test('a session older than the global window issues a separate session-only request', async () => {
    const sessionId = 'ses_test'
    const created = Date.UTC(2020, 0, 1, 12)
    const queries: UsageQuery[] = []
    const store = createStore({
      activeSession: () => ({ id: sessionId, created }),
      fetchUsage: (query) => {
        if (query) queries.push(query)
        return Promise.resolve(USAGE)
      }
    })
    store.setSessionID(sessionId)
    // `setSessionID` triggers the refresh; wait for it (and any pending
    // follow-up) to settle.
    await new Promise((resolve) => setTimeout(resolve, 20))
    // global (model_used) + session-only chunks (affinity), each a separate call
    const globalCalls = queries.filter((q) => q.groupBy?.includes('model_used'))
    const sessionCalls = queries.filter((q) => q.groupBy?.length === 1 && q.groupBy[0] === SESSION_AFFINITY_KEY)
    assert.equal(globalCalls.length, 1)
    assert.ok(sessionCalls.length >= 1)
    // Every session chunk carries an explicit end (chunked range).
    for (const call of sessionCalls) assert.ok(call.end)
  })

  test('derives last month spend from the merged usage response', async () => {
    const now = new Date()
    const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15))
    const previousKey = previous.toISOString().slice(0, 10)
    const usage = {
      usage: {
        [previousKey]: { spend: '4.25', grouped_data: [{ group_by_values: { model_used: 'openai/gpt-5' }, spend: '4.25' }] },
        ...USAGE.usage
      }
    } as unknown as UsageResponse
    const store = createStore({ fetchUsage: () => Promise.resolve(usage) })
    await store.refresh()
    assert.equal(store.data()!.lastMonthSpend, 4.25)
  })

  test('defaults to the weekday projection basis', async () => {
    // USAGE only carries today's spend, so the sampled history is empty and the
    // weekday basis degrades to the calendar model.
    const store = createStore({})
    await store.refresh()
    assert.deepEqual(store.data()!.projection, CALENDAR_PROJECTION)
  })

  test('the configured basis selects a static model without needing history', async () => {
    const store = createStore({ projection: { basis: 'workdays', historyDays: 28 } })
    await store.refresh()
    assert.deepEqual(store.data()!.projection, WORKDAY_PROJECTION)

    const calendar = createStore({ projection: { basis: 'calendar', historyDays: 28 } })
    await calendar.refresh()
    assert.deepEqual(calendar.data()!.projection, CALENDAR_PROJECTION)
  })

  test('the weekday basis derives its weights from the fetched history', async () => {
    // Four weeks of Mon–Fri-only spend must reproduce the workday weights.
    const now = new Date()
    const usage: Record<string, { spend: number }> = {}
    for (let offset = 1; offset <= 28; offset++) {
      const date = new Date(now)
      date.setUTCDate(date.getUTCDate() - offset)
      const weekday = date.getUTCDay()
      usage[date.toISOString().slice(0, 10)] = { spend: weekday === 0 || weekday === 6 ? 0 : 10 }
    }
    const store = createStore({ projection: { basis: 'weekday', historyDays: 28 }, fetchUsage: () => Promise.resolve({ usage }) })
    await store.refresh()
    const projection = store.data()!.projection
    assert.equal(projection.basis, 'weekday')
    assert.deepEqual(
      projection.weights.map((weight) => Math.round(weight * 1e6) / 1e6),
      WORKDAY_PROJECTION.weights.map((weight) => Math.round(weight * 1e6) / 1e6)
    )
  })

  test('the weekday basis widens the usage window to cover its history', async () => {
    const queries: UsageQuery[] = []
    const store = createStore({
      projection: { basis: 'weekday', historyDays: 84 },
      fetchUsage: (query) => {
        if (query) queries.push(query)
        return Promise.resolve(USAGE)
      }
    })
    await store.refresh()
    assert.equal(queries.length, 1)
    assert.equal(queries[0].start, startOfUsageWindow(84))
  })

  test('a non-weekday basis keeps the default 30-day usage window', async () => {
    const queries: UsageQuery[] = []
    const store = createStore({
      projection: { basis: 'workdays', historyDays: 84 },
      fetchUsage: (query) => {
        if (query) queries.push(query)
        return Promise.resolve(USAGE)
      }
    })
    await store.refresh()
    assert.equal(queries[0].start, startOfUsageWindow(30))
  })
})
