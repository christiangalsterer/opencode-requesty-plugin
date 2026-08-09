import { describe, test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { detectApiKey } from "../src/key"

const ENV_KEY = "REQUESTY_API_KEY"
const savedEnv = process.env[ENV_KEY]

afterEach(() => {
  if (savedEnv === undefined) delete process.env[ENV_KEY]
  else process.env[ENV_KEY] = savedEnv
})

describe("detectApiKey", () => {
  test("plugin options win over env and config", () => {
    process.env[ENV_KEY] = "env-key"
    const result = detectApiKey({ apiKey: "options-key" }, { provider: { requesty: { options: { apiKey: "config-key" } } } })
    assert.deepEqual(result, { ok: true, apiKey: "options-key", source: "plugin options" })
  })

  test("env var beats config", () => {
    process.env[ENV_KEY] = "env-key"
    const result = detectApiKey(undefined, { provider: { requesty: { options: { apiKey: "config-key" } } } })
    assert.deepEqual(result, { ok: true, apiKey: "env-key", source: "REQUESTY_API_KEY env var" })
  })

  test("falls back to canonical requesty provider config", () => {
    delete process.env[ENV_KEY]
    const result = detectApiKey(undefined, { provider: { requesty: { options: { apiKey: "config-key" } } } })
    assert.deepEqual(result, { ok: true, apiKey: "config-key", source: "opencode provider config (requesty)" })
  })

  test("resolves {env:VAR} interpolation in provider config", () => {
    process.env[ENV_KEY] = "interpolated-key"
    // env var itself takes precedence; use a different var for interpolation
    delete process.env[ENV_KEY]
    process.env.MY_REQUESTY_KEY = "interpolated-key"
    const result = detectApiKey(undefined, { provider: { requesty: { options: { apiKey: "{env:MY_REQUESTY_KEY}" } } } })
    assert.deepEqual(result, { ok: true, apiKey: "interpolated-key", source: "opencode provider config (requesty)" })
    delete process.env.MY_REQUESTY_KEY
  })

  test("detects custom providers with a Requesty baseURL", () => {
    delete process.env[ENV_KEY]
    const result = detectApiKey(undefined, {
      provider: {
        "requesty-export": {
          options: { baseURL: "https://router.eu.requesty.ai/v1", apiKey: "eu-key" },
        },
      },
    })
    assert.deepEqual(result, { ok: true, apiKey: "eu-key", source: "opencode provider config (requesty-export)" })
  })

  test("ignores providers pointing at non-Requesty hosts", () => {
    delete process.env[ENV_KEY]
    const result = detectApiKey(undefined, {
      provider: {
        openai: { options: { baseURL: "https://api.openai.com/v1", apiKey: "openai-key" } },
      },
    })
    assert.equal(result.ok, false)
  })

  test("reports failure when nothing is configured", () => {
    delete process.env[ENV_KEY]
    const result = detectApiKey(undefined, undefined)
    assert.equal(result.ok, false)
    assert.match((result as { reason: string }).reason, /REQUESTY_API_KEY/)
  })
})
