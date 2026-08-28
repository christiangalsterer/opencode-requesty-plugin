import { describe, test, mock } from 'bun:test'
import assert from 'node:assert/strict'
import { createRequestyStore } from '../src/state'
import { avgSpendLastNDays, avgTokensLastNDays } from '../src/api'
import { dailyAverage } from '../src/format'
import type { ApiKeyInfo, UsageResponse } from '../src/api'

const KEY_INFO: ApiKeyInfo = {
  id: 'key-1',
  name: 'test-key',
  logging: false,
  monthly_spend: 12.34,
  monthly_limit: 50,
  permissions: { manage: 'none', completions: 'write' }
}

const USAGE: UsageResponse = {
  usage: {
    '2026-08-01': {
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
  fetchUsage?: () => Promise<UsageResponse>
  onError?: (msg: string) => void
  activeSession?: (id: string) => { id: string; created: number | undefined } | undefined
  onRender?: () => void
}) {
  return createRequestyStore({
    apiKey: 'sk-test',
    onError: opts.onError,
    fetchApiKey: () => opts.fetchApiKey?.() ?? Promise.resolve(KEY_INFO),
    fetchUsage: () => opts.fetchUsage?.() ?? Promise.resolve(USAGE),
    activeSession: opts.activeSession,
    onRender: opts.onRender
  })
}

describe('createRequestyStore', () => {
  test('refresh populates data and sets state to ready', async () => {
    const onRender = mock(() => {})
    const store = createStore({ onRender })
    assert.equal(store.state().status, 'idle')
    await store.refresh()
    assert.equal(store.state().status, 'ready')
    assert.equal(onRender.mock.calls.length, 1)
    const data = store.data()
    assert.ok(data)
    assert.equal(data!.keyInfo.name, 'test-key')
    assert.equal(data!.models.length, 1)
    assert.equal(data!.models[0].model, 'openai/gpt-5')
    assert.equal(data!.monthSpendFromUsage, 8)
    assert.equal(data!.todaySpend, 0)
    assert.equal(data!.dailyAvg, dailyAverage(KEY_INFO.monthly_spend))
    assert.equal(data!.avg7d, avgSpendLastNDays(USAGE, 7))
    assert.equal(data!.avg30d, avgSpendLastNDays(USAGE, 30))
    assert.deepEqual(data!.todayTokens, { input: 0, output: 0, total: 0 })
    assert.deepEqual(data!.dailyAvgTokens, {
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
    assert.equal(data!.dailyAvg, dailyAverage(KEY_INFO.monthly_spend))

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
    assert.equal(data!.monthSpendFromUsage, expectedMonthSpend)
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
    assert.deepEqual(data!.dailyAvgTokens, {
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

    assert.equal(data!.monthSpendFromUsage, expectedMonthSpend)
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

  test('setSessionID with the same id does not bump version or schedule work', async () => {
    const sessionId = 'ses_test'
    const store = createStore({
      activeSession: () => ({ id: sessionId, created: undefined })
    })
    const initial = store.version()
    store.setSessionID(sessionId)
    const afterChange = store.version()
    assert.ok(afterChange > initial)
    // Repeated identical ids are no-ops — version does not change again.
    store.setSessionID(sessionId)
    store.setSessionID(sessionId)
    assert.equal(store.version(), afterChange)
  })
})
