import { describe, test, mock } from "node:test"
import assert from "node:assert/strict"
import { createRequestyStore } from "../src/state"
import type { ApiKeyInfo, UsageResponse } from "../src/api"

const KEY_INFO: ApiKeyInfo = {
  id: "key-1",
  name: "test-key",
  logging: false,
  monthly_spend: 12.34,
  monthly_limit: 50,
  permissions: { manage: "none", completions: "write" },
}

const USAGE: UsageResponse = {
  usage: {
    "2026-08-01": {
      grouped_data: [
        { group_by_values: { model_used: "openai/gpt-5" }, spend: 8, input_tokens: 100, output_tokens: 50, total_tokens: 150, completions_requests: 4 },
      ],
    },
  },
}

function createStore(opts: {
  fetchApiKey?: () => Promise<ApiKeyInfo>
  fetchUsage?: () => Promise<UsageResponse>
  activityDebounceMs?: number
  onError?: (msg: string) => void
}) {
  return createRequestyStore({
    apiKey: "sk-test",
    baseUrl: "https://api-v2.requesty.ai",
    activityDebounceMs: opts.activityDebounceMs ?? 1000,
    onError: opts.onError,
    fetchApiKey: () => opts.fetchApiKey?.() ?? Promise.resolve(KEY_INFO),
    fetchUsage: () => opts.fetchUsage?.() ?? Promise.resolve(USAGE),
  })
}

describe("createRequestyStore", () => {
  test("refresh populates data and sets state to ready", async () => {
    const store = createStore({})
    assert.equal(store.state().status, "idle")
    await store.refresh()
    assert.equal(store.state().status, "ready")
    const data = store.data()
    assert.ok(data)
    assert.equal(data!.keyInfo.name, "test-key")
    assert.equal(data!.models.length, 1)
    assert.equal(data!.models[0].model, "openai/gpt-5")
    assert.equal(data!.monthSpendFromUsage, 8)
    assert.equal(data!.todaySpend, 0)
  })

  test("error sets state to error and calls onError", async () => {
    const onError = mock.fn()
    const store = createStore({
      fetchApiKey: () => Promise.reject(new Error("boom")),
      onError,
    })
    await store.refresh()
    assert.equal(store.state().status, "error")
    assert.equal((store.state() as { message: string }).message, "boom")
    assert.equal(store.data(), undefined)
    assert.equal(onError.mock.callCount(), 1)
    assert.equal(onError.mock.calls[0].arguments[0], "boom")
  })

  test("concurrent refresh calls share a single in-flight promise", async () => {
    let calls = 0
    const store = createStore({
      fetchApiKey: () => {
        calls++
        return new Promise<ApiKeyInfo>((resolve) => setTimeout(() => resolve(KEY_INFO), 20))
      },
    })
    const p1 = store.refresh()
    const p2 = store.refresh()
    await Promise.all([p1, p2])
    assert.equal(calls, 1)
  })

  test("refreshFromActivity is debounced within the window", async () => {
    let calls = 0
    const store = createStore({
      activityDebounceMs: 100,
      fetchApiKey: () => {
        calls++
        return Promise.resolve(KEY_INFO)
      },
    })
    await store.refresh()
    assert.equal(calls, 1)
    store.refreshFromActivity()
    assert.equal(calls, 1)
    store.refreshFromActivity()
    assert.equal(calls, 1)
  })

  test("refreshFromActivity triggers after the debounce window", async () => {
    let calls = 0
    const store = createStore({
      activityDebounceMs: 30,
      fetchApiKey: () => {
        calls++
        return Promise.resolve(KEY_INFO)
      },
    })
    await store.refresh()
    assert.equal(calls, 1)
    await new Promise((r) => setTimeout(r, 40))
    store.refreshFromActivity()
    await new Promise((r) => setTimeout(r, 10))
    assert.equal(calls, 2)
  })

  test("repeated identical errors call onError only once", async () => {
    const onError = mock.fn()
    const store = createStore({
      fetchApiKey: () => Promise.reject(new Error("same")),
      onError,
    })
    await store.refresh()
    await store.refresh()
    await store.refresh()
    assert.equal(onError.mock.callCount(), 1)
  })

  test("a different error calls onError again", async () => {
    const onError = mock.fn()
    let err = "first"
    const store = createStore({
      fetchApiKey: () => Promise.reject(new Error(err)),
      onError,
    })
    await store.refresh()
    err = "second"
    await store.refresh()
    assert.equal(onError.mock.callCount(), 2)
    assert.equal(onError.mock.calls[0].arguments[0], "first")
    assert.equal(onError.mock.calls[1].arguments[0], "second")
  })
})
