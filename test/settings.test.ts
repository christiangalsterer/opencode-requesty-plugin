import { describe, test } from "bun:test"
import assert from "node:assert/strict"
import { readSettings } from "../src/settings"
import { DEFAULT_THRESHOLDS } from "../src/format"

const DEFAULTS = {
  refreshIntervalMs: 300000,
  thresholds: DEFAULT_THRESHOLDS,
  sidebar: { enabled: true, maxModels: 5 },
  prompt: { enabled: true, budgetIndicator: true, dailySpend: true, monthlyProjection: true },
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

  test("sidebar non-object → defaults", () => {
    assert.deepEqual(readSettings({ sidebar: "nope" }).sidebar, DEFAULTS.sidebar)
    assert.deepEqual(readSettings({ sidebar: null }).sidebar, DEFAULTS.sidebar)
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
    assert.deepEqual(readSettings(undefined).prompt, { enabled: true, budgetIndicator: true, dailySpend: true, monthlyProjection: true })
    assert.deepEqual(readSettings({}).prompt, { enabled: true, budgetIndicator: true, dailySpend: true, monthlyProjection: true })
  })

  test("prompt.enabled can be disabled", () => {
    assert.equal(readSettings({ prompt: { enabled: false } }).prompt.enabled, false)
  })

  test("prompt.budgetIndicator can be disabled", () => {
    assert.equal(readSettings({ prompt: { budgetIndicator: false } }).prompt.budgetIndicator, false)
  })

  test("prompt.dailySpend can be disabled", () => {
    assert.equal(readSettings({ prompt: { dailySpend: false } }).prompt.dailySpend, false)
  })

  test("prompt.monthlyProjection defaults to true and can be disabled", () => {
    assert.equal(readSettings(undefined).prompt.monthlyProjection, true)
    assert.equal(readSettings({ prompt: { monthlyProjection: false } }).prompt.monthlyProjection, false)
  })

  test("prompt non-boolean values → defaults", () => {
    assert.equal(readSettings({ prompt: { enabled: "no" } }).prompt.enabled, true)
    assert.equal(readSettings({ prompt: { budgetIndicator: 0 } }).prompt.budgetIndicator, true)
    assert.equal(readSettings({ prompt: { dailySpend: "yes" } }).prompt.dailySpend, true)
    assert.equal(readSettings({ prompt: { monthlyProjection: "yes" } }).prompt.monthlyProjection, true)
    assert.equal(readSettings({ prompt: { enabled: undefined } }).prompt.enabled, true)
  })

  test("prompt non-object → defaults", () => {
    assert.deepEqual(readSettings({ prompt: "nope" }).prompt, { enabled: true, budgetIndicator: true, dailySpend: true, monthlyProjection: true })
    assert.deepEqual(readSettings({ prompt: null }).prompt, { enabled: true, budgetIndicator: true, dailySpend: true, monthlyProjection: true })
  })
})
