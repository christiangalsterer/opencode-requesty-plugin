import { describe, test } from "bun:test"
import assert from "node:assert/strict"
import { readSettings } from "../src/settings"
import { DEFAULT_THRESHOLDS } from "../src/format"

const DEFAULTS = {
  refreshIntervalMs: 300000,
  thresholds: DEFAULT_THRESHOLDS,
  sidebar: { enabled: true, maxModels: 5, showTokens: true, showKeyName: false, order: 50 },
  prompt: { enabled: true, budgetIndicator: true, todaySpend: true, dailyAvg: false, avg7d: false, avg30d: false, showTokens: true, showKeyName: false, monthlyProjection: true, order: 50 },
  dialog: { showKeyName: false },
}

describe("readSettings", () => {
  test("undefined options yield all defaults", () => {
    assert.deepEqual(readSettings(undefined), DEFAULTS)
  })

  test("empty object yields all defaults", () => {
    assert.deepEqual(readSettings({}), DEFAULTS)
  })

  test("valid custom values are preserved", () => {
    const settings = readSettings({
      refreshIntervalMs: 60000,
      sidebar: { maxModels: 10 },
      warningThreshold: 0.6,
      errorThreshold: 0.85,
    })
    assert.equal(settings.refreshIntervalMs, 60000)
    assert.equal(settings.sidebar.maxModels, 10)
    assert.deepEqual(settings.thresholds, { warning: 0.6, error: 0.85 })
  })

  test("non-number refreshIntervalMs → default", () => {
    assert.equal(readSettings({ refreshIntervalMs: "fast" }).refreshIntervalMs, DEFAULTS.refreshIntervalMs)
    assert.equal(readSettings({ refreshIntervalMs: undefined }).refreshIntervalMs, DEFAULTS.refreshIntervalMs)
  })

  test("refreshIntervalMs below minimum → default", () => {
    assert.equal(readSettings({ refreshIntervalMs: 5000 }).refreshIntervalMs, DEFAULTS.refreshIntervalMs)
    assert.equal(readSettings({ refreshIntervalMs: 0 }).refreshIntervalMs, DEFAULTS.refreshIntervalMs)
    assert.equal(readSettings({ refreshIntervalMs: -1 }).refreshIntervalMs, DEFAULTS.refreshIntervalMs)
  })

  test("refreshIntervalMs above maximum → default", () => {
    assert.equal(readSettings({ refreshIntervalMs: 3_600_001 }).refreshIntervalMs, DEFAULTS.refreshIntervalMs)
  })

  test("refreshIntervalMs at boundaries is accepted", () => {
    assert.equal(readSettings({ refreshIntervalMs: 10000 }).refreshIntervalMs, 10000)
    assert.equal(readSettings({ refreshIntervalMs: 3_600_000 }).refreshIntervalMs, 3_600_000)
  })

  test("sidebar.maxModels below minimum → default", () => {
    assert.equal(readSettings({ sidebar: { maxModels: 0 } }).sidebar.maxModels, DEFAULTS.sidebar.maxModels)
    assert.equal(readSettings({ sidebar: { maxModels: -1 } }).sidebar.maxModels, DEFAULTS.sidebar.maxModels)
  })

  test("sidebar.maxModels above maximum → clamped to maximum", () => {
    assert.equal(readSettings({ sidebar: { maxModels: 25 } }).sidebar.maxModels, 20)
  })

  test("sidebar.maxModels at boundaries is accepted", () => {
    assert.equal(readSettings({ sidebar: { maxModels: 1 } }).sidebar.maxModels, 1)
    assert.equal(readSettings({ sidebar: { maxModels: 20 } }).sidebar.maxModels, 20)
  })

  test("sidebar.maxModels is floored", () => {
    assert.equal(readSettings({ sidebar: { maxModels: 3.9 } }).sidebar.maxModels, 3)
  })

  test("sidebar.enabled defaults to true", () => {
    assert.equal(readSettings(undefined).sidebar.enabled, true)
    assert.equal(readSettings({}).sidebar.enabled, true)
    assert.equal(readSettings({ sidebar: {} }).sidebar.enabled, true)
  })

  test("sidebar.enabled can be disabled", () => {
    assert.equal(readSettings({ sidebar: { enabled: false } }).sidebar.enabled, false)
  })

  test("sidebar.enabled non-boolean values → default", () => {
    assert.equal(readSettings({ sidebar: { enabled: "no" } }).sidebar.enabled, true)
    assert.equal(readSettings({ sidebar: { enabled: 0 } }).sidebar.enabled, true)
    assert.equal(readSettings({ sidebar: { enabled: undefined } }).sidebar.enabled, true)
  })

  test("sidebar.showTokens defaults to true", () => {
    assert.equal(readSettings(undefined).sidebar.showTokens, true)
    assert.equal(readSettings({}).sidebar.showTokens, true)
    assert.equal(readSettings({ sidebar: {} }).sidebar.showTokens, true)
  })

  test("sidebar.showTokens can be disabled", () => {
    assert.equal(readSettings({ sidebar: { showTokens: false } }).sidebar.showTokens, false)
  })

  test("sidebar.showTokens non-boolean values → default", () => {
    assert.equal(readSettings({ sidebar: { showTokens: "no" } }).sidebar.showTokens, true)
    assert.equal(readSettings({ sidebar: { showTokens: 0 } }).sidebar.showTokens, true)
    assert.equal(readSettings({ sidebar: { showTokens: undefined } }).sidebar.showTokens, true)
  })

  test("sidebar non-object → defaults", () => {
    assert.deepEqual(readSettings({ sidebar: "nope" }).sidebar, DEFAULTS.sidebar)
    assert.deepEqual(readSettings({ sidebar: null }).sidebar, DEFAULTS.sidebar)
  })

  test("sidebar.order defaults to 50", () => {
    assert.equal(readSettings(undefined).sidebar.order, 50)
    assert.equal(readSettings({}).sidebar.order, 50)
    assert.equal(readSettings({ sidebar: {} }).sidebar.order, 50)
  })

  test("sidebar.order can be customized", () => {
    assert.equal(readSettings({ sidebar: { order: 10 } }).sidebar.order, 10)
    assert.equal(readSettings({ sidebar: { order: 100 } }).sidebar.order, 100)
    assert.equal(readSettings({ sidebar: { order: -10 } }).sidebar.order, -10)
  })

  test("sidebar.order invalid numbers → default", () => {
    assert.equal(readSettings({ sidebar: { order: "first" } }).sidebar.order, DEFAULTS.sidebar.order)
    assert.equal(readSettings({ sidebar: { order: NaN } }).sidebar.order, DEFAULTS.sidebar.order)
    assert.equal(readSettings({ sidebar: { order: Infinity } }).sidebar.order, DEFAULTS.sidebar.order)
    assert.equal(readSettings({ sidebar: { order: -Infinity } }).sidebar.order, DEFAULTS.sidebar.order)
    assert.equal(readSettings({ sidebar: { order: undefined } }).sidebar.order, DEFAULTS.sidebar.order)
  })

  test("NaN refreshIntervalMs → default", () => {
    assert.equal(readSettings({ refreshIntervalMs: NaN }).refreshIntervalMs, DEFAULTS.refreshIntervalMs)
  })

  test("thresholds fall back to defaults when invalid ordering", () => {
    assert.deepEqual(readSettings({ warningThreshold: 0.95, errorThreshold: 0.5 }).thresholds, DEFAULT_THRESHOLDS)
    assert.deepEqual(readSettings({ warningThreshold: 0.9, errorThreshold: 0.9 }).thresholds, DEFAULT_THRESHOLDS)
  })

  test("thresholds accept percent values", () => {
    assert.deepEqual(readSettings({ warningThreshold: 60, errorThreshold: 85 }).thresholds, { warning: 0.6, error: 0.85 })
  })

  test("prompt defaults to all enabled (monthlyProjection on)", () => {
    assert.deepEqual(readSettings(undefined).prompt, DEFAULTS.prompt)
    assert.deepEqual(readSettings({}).prompt, DEFAULTS.prompt)
  })

  test("prompt.enabled can be disabled", () => {
    assert.equal(readSettings({ prompt: { enabled: false } }).prompt.enabled, false)
  })

  test("prompt.budgetIndicator can be disabled", () => {
    assert.equal(readSettings({ prompt: { budgetIndicator: false } }).prompt.budgetIndicator, false)
  })

  test("prompt.todaySpend can be disabled", () => {
    assert.equal(readSettings({ prompt: { todaySpend: false } }).prompt.todaySpend, false)
  })

  test("prompt.dailyAvg defaults to false and can be enabled", () => {
    assert.equal(readSettings(undefined).prompt.dailyAvg, false)
    assert.equal(readSettings({ prompt: { dailyAvg: true } }).prompt.dailyAvg, true)
  })

  test("prompt.7dAvg defaults to false and can be enabled", () => {
    assert.equal(readSettings(undefined).prompt.avg7d, false)
    assert.equal(readSettings({ prompt: { "7dAvg": true } }).prompt.avg7d, true)
  })

  test("prompt.30dAvg defaults to false and can be enabled", () => {
    assert.equal(readSettings(undefined).prompt.avg30d, false)
    assert.equal(readSettings({ prompt: { "30dAvg": true } }).prompt.avg30d, true)
  })

  test("prompt.showTokens defaults to true and can be disabled", () => {
    assert.equal(readSettings(undefined).prompt.showTokens, true)
    assert.equal(readSettings({}).prompt.showTokens, true)
    assert.equal(readSettings({ prompt: {} }).prompt.showTokens, true)
    assert.equal(readSettings({ prompt: { showTokens: false } }).prompt.showTokens, false)
  })

  test("prompt.showTokens non-boolean values → default", () => {
    assert.equal(readSettings({ prompt: { showTokens: "yes" } }).prompt.showTokens, true)
    assert.equal(readSettings({ prompt: { showTokens: 1 } }).prompt.showTokens, true)
    assert.equal(readSettings({ prompt: { showTokens: undefined } }).prompt.showTokens, true)
  })

  test("prompt.monthlyProjection defaults to true and can be disabled", () => {
    assert.equal(readSettings(undefined).prompt.monthlyProjection, true)
    assert.equal(readSettings({ prompt: { monthlyProjection: false } }).prompt.monthlyProjection, false)
  })

  test("prompt non-boolean values → defaults", () => {
    assert.equal(readSettings({ prompt: { enabled: "no" } }).prompt.enabled, true)
    assert.equal(readSettings({ prompt: { budgetIndicator: 0 } }).prompt.budgetIndicator, true)
    assert.equal(readSettings({ prompt: { todaySpend: "yes" } }).prompt.todaySpend, true)
    assert.equal(readSettings({ prompt: { dailyAvg: "yes" } }).prompt.dailyAvg, false)
    assert.equal(readSettings({ prompt: { "7dAvg": "yes" } }).prompt.avg7d, false)
    assert.equal(readSettings({ prompt: { "30dAvg": "yes" } }).prompt.avg30d, false)
    assert.equal(readSettings({ prompt: { showTokens: "yes" } }).prompt.showTokens, true)
    assert.equal(readSettings({ prompt: { monthlyProjection: "yes" } }).prompt.monthlyProjection, true)
    assert.equal(readSettings({ prompt: { enabled: undefined } }).prompt.enabled, true)
  })

  test("prompt non-object → defaults", () => {
    assert.deepEqual(readSettings({ prompt: "nope" }).prompt, DEFAULTS.prompt)
    assert.deepEqual(readSettings({ prompt: null }).prompt, DEFAULTS.prompt)
  })

  test("prompt.order defaults to 50", () => {
    assert.equal(readSettings(undefined).prompt.order, 50)
    assert.equal(readSettings({}).prompt.order, 50)
    assert.equal(readSettings({ prompt: {} }).prompt.order, 50)
  })

  test("prompt.order can be customized", () => {
    assert.equal(readSettings({ prompt: { order: 10 } }).prompt.order, 10)
    assert.equal(readSettings({ prompt: { order: 100 } }).prompt.order, 100)
    assert.equal(readSettings({ prompt: { order: -10 } }).prompt.order, -10)
  })

  test("prompt.order invalid numbers → default", () => {
    assert.equal(readSettings({ prompt: { order: "first" } }).prompt.order, DEFAULTS.prompt.order)
    assert.equal(readSettings({ prompt: { order: NaN } }).prompt.order, DEFAULTS.prompt.order)
    assert.equal(readSettings({ prompt: { order: Infinity } }).prompt.order, DEFAULTS.prompt.order)
    assert.equal(readSettings({ prompt: { order: -Infinity } }).prompt.order, DEFAULTS.prompt.order)
    assert.equal(readSettings({ prompt: { order: undefined } }).prompt.order, DEFAULTS.prompt.order)
  })
})
