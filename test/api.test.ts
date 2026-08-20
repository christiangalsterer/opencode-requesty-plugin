import { describe, test, mock, afterEach, beforeEach } from "bun:test"
import assert from "node:assert/strict"
import { getApiKeySelf, getUsageSelf, RequestyApiError } from "../src/api"

describe("api client error handling", () => {
  const fetchMock = mock(() => Promise.resolve(new Response(JSON.stringify({}), { status: 200 })))

  beforeEach(() => {
    global.fetch = fetchMock as any
  })

  afterEach(() => {
    fetchMock.mockClear()
  })

  test("throws RequestyApiError on 401", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ error: { message: "Unauthorized" } }), { status: 401 }))
    )
    try {
      await getApiKeySelf("sk-test")
      assert.fail("Should have rejected")
    } catch (err) {
      assert.ok(err instanceof RequestyApiError)
      assert.equal((err as RequestyApiError).status, 401)
      assert.equal((err as RequestyApiError).message, "Unauthorized")
    }
  })

  test("throws RequestyApiError on 500", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ error: { message: "Internal Server Error" } }), { status: 500 }))
    )
    try {
      await getApiKeySelf("sk-test")
      assert.fail("Should have rejected")
    } catch (err) {
      assert.ok(err instanceof RequestyApiError)
      assert.equal((err as RequestyApiError).status, 500)
      assert.equal((err as RequestyApiError).message, "Internal Server Error")
    }
  })

  test("handles request timeout as 408", async () => {
    fetchMock.mockImplementation(() => {
      const error = new Error("Request timed out")
      error.name = "TimeoutError"
      return Promise.reject(error)
    })
    try {
      await getApiKeySelf("sk-test")
      assert.fail("Should have rejected")
    } catch (err) {
      assert.ok(err instanceof RequestyApiError)
      assert.equal((err as RequestyApiError).status, 408)
      assert.ok((err as RequestyApiError).message.includes("timed out"))
    }
  })
})

describe("api client data coercion", () => {
  const fetchMock = mock(() => Promise.resolve(new Response(JSON.stringify({
    id: "id",
    name: "name",
    logging: true,
    monthly_spend: "invalid",
    monthly_limit: "NaN",
    permissions: { manage: "none", completions: "none" }
  }), { status: 200 })))

  beforeEach(() => {
    global.fetch = fetchMock as any
  })

  afterEach(() => {
    fetchMock.mockClear()
  })

  test("getUsageSelf constructs URL parameters correctly", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ usage: {} }), { status: 200 }))
    )
    await getUsageSelf("sk-test", {
      start: "2026-08-01",
      end: "2026-08-31",
      groupBy: ["model", "key"],
      resolution: "day",
    })

    const calls = fetchMock.mock.calls
    const url = new URL((calls as any)[calls.length - 1][0] as any)
    assert.equal(url.searchParams.get("start"), "2026-08-01")
    assert.equal(url.searchParams.get("end"), "2026-08-31")
    assert.equal(url.searchParams.get("group_by"), "model,key")
    assert.equal(url.searchParams.get("resolution"), "day")
  })

  test("getUsageSelf handles minimal query", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ usage: {} }), { status: 200 }))
    )
    await getUsageSelf("sk-test", { start: "2026-08-01" })

    const calls = fetchMock.mock.calls
    const url = new URL((calls as any)[calls.length - 1][0] as any)
    assert.equal(url.searchParams.get("start"), "2026-08-01")
    assert.equal(url.searchParams.has("end"), false)
    assert.equal(url.searchParams.has("group_by"), false)
    assert.equal(url.searchParams.has("resolution"), false)
  })

  test("coerces invalid decimal strings to 0", async () => {
    const info = await getApiKeySelf("sk-test")
    assert.equal(info.monthly_spend, 0)
    assert.equal(info.monthly_limit, 0)
  })
})
