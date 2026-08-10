import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { aggregateByModel, startOfCurrentMonth, type UsageResponse } from "../src/api"
import { DEFAULT_THRESHOLDS, analyticsUrl, formatLimit, formatTokenBreakdown, formatTokens, formatUsd, normalizeThreshold, padEnd, padStart, renderBar, resolveThresholds, severityColor, shortModel, spendRatio, spendSeverity } from "../src/format"

describe("aggregateByModel", () => {
  test("aggregates grouped rows across periods and sorts by spend desc", () => {
    const response: UsageResponse = {
      usage: {
        "2026-08-01": {
          spend: 3,
          grouped_data: [
            { group_by_values: { model_used: "openai/gpt-5" }, spend: 2, input_tokens: 100, output_tokens: 50, total_tokens: 150, completions_requests: 4 },
            { group_by_values: { model_used: "anthropic/claude-sonnet-4-5" }, spend: 1, input_tokens: 10, output_tokens: 5, total_tokens: 15, completions_requests: 1 },
          ],
        },
        "2026-08-02": {
          spend: 5,
          grouped_data: [
            { group_by_values: { model_used: "openai/gpt-5" }, spend: 5, input_tokens: 200, output_tokens: 100, total_tokens: 300, completions_requests: 6 },
          ],
        },
      },
    }
    const models = aggregateByModel(response)
    assert.equal(models.length, 2)
    assert.equal(models[0].model, "openai/gpt-5")
    assert.equal(models[0].spend, 7)
    assert.equal(models[0].totalTokens, 450)
    assert.equal(models[0].requests, 10)
    assert.equal(models[1].model, "anthropic/claude-sonnet-4-5")
  })

  test("handles missing grouped_data and unknown model", () => {
    const response: UsageResponse = {
      usage: {
        "2026-08-01": { spend: 0 },
        "2026-08-02": { grouped_data: [{ group_by_values: {}, spend: 1 }] },
      },
    }
    const models = aggregateByModel(response)
    assert.equal(models.length, 1)
    assert.equal(models[0].model, "unknown")
  })

  test("falls back to model_requested when model_used is absent", () => {
    const response: UsageResponse = {
      usage: {
        "2026-08-01": {
          grouped_data: [
            { group_by_values: { model_requested: "openai/gpt-5" }, spend: 1, total_tokens: 10 },
          ],
        },
      },
    }
    const models = aggregateByModel(response)
    assert.equal(models.length, 1)
    assert.equal(models[0].model, "openai/gpt-5")
  })

  test("model_used wins over model_requested when both are present", () => {
    const response: UsageResponse = {
      usage: {
        "2026-08-01": {
          grouped_data: [
            { group_by_values: { model_used: "openai/gpt-5", model_requested: "openai/gpt-4o" }, spend: 1 },
          ],
        },
      },
    }
    const models = aggregateByModel(response)
    assert.equal(models.length, 1)
    assert.equal(models[0].model, "openai/gpt-5")
  })

  test("coerces string decimals (API returns decimal fields as strings)", () => {
    const response = {
      usage: {
        "2026-08-01": {
          grouped_data: [
            { group_by_values: { model_used: "openai/gpt-5" }, spend: "2.50", input_tokens: "100", total_tokens: "150", completions_requests: "4" },
          ],
        },
      },
    } as unknown as UsageResponse
    const models = aggregateByModel(response)
    assert.equal(models[0].spend, 2.5)
    assert.equal(models[0].totalTokens, 150)
    assert.equal(models[0].requests, 4)
  })

  test("empty usage yields empty array", () => {
    assert.deepEqual(aggregateByModel({ usage: {} }), [])
  })
})

describe("startOfCurrentMonth", () => {
  test("returns first day of month in UTC", () => {
    const now = new Date("2026-08-09T15:30:00Z")
    assert.equal(startOfCurrentMonth(now), "2026-08-01T00:00:00.000Z")
  })
})

describe("format helpers", () => {
  test("formatUsd truncates to 2 digits", () => {
    assert.equal(formatUsd(123.456), "$123.45")
    assert.equal(formatUsd(12.345), "$12.34") // truncated, not rounded
    assert.equal(formatUsd(12.349), "$12.34")
    assert.equal(formatUsd(0.5), "$0.50")
    assert.equal(formatUsd(0.001), "$0.00")
    assert.equal(formatUsd(8), "$8.00")
    assert.equal(formatUsd(18.21894606), "$18.21")
  })

  test("formatTokens", () => {
    assert.equal(formatTokens(500), "500")
    assert.equal(formatTokens(1_500), "1.5k")
    assert.equal(formatTokens(2_500_000), "2.5M")
    assert.equal(formatTokens(3_000_000_000), "3.0B")
  })

  test("spendRatio: zero/negative limit means unlimited (ratio 0, no Infinity)", () => {
    assert.equal(spendRatio(50, 0), 0)
    assert.equal(spendRatio(50, -10), 0)
    assert.equal(spendRatio(0, 0), 0)
    assert.equal(spendRatio(50, 100), 0.5)
    assert.equal(spendRatio(150, 100), 1.5) // over limit
  })

  test("formatLimit: zero/negative limit renders as unlimited", () => {
    assert.equal(formatLimit(0), "unlimited")
    assert.equal(formatLimit(-5), "unlimited")
    assert.equal(formatLimit(100), "$100.00")
    assert.equal(formatLimit(18.21894606), "$18.21") // truncated like formatUsd
  })

  test("renderBar", () => {
    assert.equal(renderBar(0, 10), "░░░░░░░░░░")
    assert.equal(renderBar(1, 10), "▓▓▓▓▓▓▓▓▓▓")
    assert.equal(renderBar(0.5, 10), "▓▓▓▓▓░░░░░")
    assert.equal(renderBar(2, 10), "▓▓▓▓▓▓▓▓▓▓") // clamped
  })

  test("formatTokenBreakdown", () => {
    assert.equal(formatTokenBreakdown(1_000_000, 200_000), "(↑1.0M ↓200.0k)")
    assert.equal(formatTokenBreakdown(0, 0), "(↑0 ↓0)")
    assert.equal(formatTokenBreakdown(500, 0), "(↑500 ↓0)")
    assert.equal(formatTokenBreakdown(0, 3_000_000_000), "(↑0 ↓3.0B)")
    assert.equal(formatTokenBreakdown(1_500, 2_500_000), "(↑1.5k ↓2.5M)")
  })

  test("shortModel", () => {
    assert.equal(shortModel("anthropic/claude-sonnet-4-5", 30), "claude-sonnet-4-5")
    assert.equal(shortModel("gpt-5", 30), "gpt-5")
    assert.equal(shortModel("anthropic/a-very-long-model-name", 10), "a-very-lo…")
  })

  test("spendSeverity thresholds", () => {
    // ok (green): < 70%
    assert.equal(spendSeverity(0), "ok")
    assert.equal(spendSeverity(0.5), "ok")
    assert.equal(spendSeverity(0.69), "ok")
    // warning (yellow): 70%–89%
    assert.equal(spendSeverity(0.7), "warning")
    assert.equal(spendSeverity(0.8), "warning")
    assert.equal(spendSeverity(0.89), "warning")
    // critical (red): >= 90%
    assert.equal(spendSeverity(0.9), "critical")
    assert.equal(spendSeverity(1), "critical")
    assert.equal(spendSeverity(1.5), "critical")
  })

  test("spendSeverity with custom thresholds", () => {
    const custom = { warning: 0.5, error: 0.8 }
    assert.equal(spendSeverity(0.49, custom), "ok")
    assert.equal(spendSeverity(0.5, custom), "warning")
    assert.equal(spendSeverity(0.79, custom), "warning")
    assert.equal(spendSeverity(0.8, custom), "critical")
  })

  test("normalizeThreshold accepts ratios and percents", () => {
    assert.equal(normalizeThreshold(0.7), 0.7)
    assert.equal(normalizeThreshold(70), 0.7)
    assert.equal(normalizeThreshold(90), 0.9)
    assert.equal(normalizeThreshold(1), 1)
    assert.equal(normalizeThreshold(undefined), undefined)
    assert.equal(normalizeThreshold("70"), undefined)
    assert.equal(normalizeThreshold(-5), undefined)
    assert.equal(normalizeThreshold(NaN), undefined)
  })

  test("resolveThresholds falls back to defaults", () => {
    assert.deepEqual(resolveThresholds(undefined, undefined), DEFAULT_THRESHOLDS)
    assert.deepEqual(resolveThresholds(0.5, undefined), { warning: 0.5, error: 0.9 })
    assert.deepEqual(resolveThresholds(undefined, 95), { warning: 0.7, error: 0.95 })
    assert.deepEqual(resolveThresholds(50, 80), { warning: 0.5, error: 0.8 })
    // invalid ordering → defaults
    assert.deepEqual(resolveThresholds(0.95, 0.5), DEFAULT_THRESHOLDS)
    assert.deepEqual(resolveThresholds(0.9, 0.9), DEFAULT_THRESHOLDS)
  })

  test("analyticsUrl builds the dashboard URL for a key name", () => {
    assert.equal(
      analyticsUrl("my-opencode-key"),
      "https://app.requesty.ai/analytics/advanced?groupBy=model&metric=cost&aggMethod=sum&timeRange=this_month&timeGroup=day&filter.api_key=my-opencode-key",
    )
    // names with spaces/special chars are URL-encoded
    assert.equal(
      analyticsUrl("my key & co"),
      "https://app.requesty.ai/analytics/advanced?groupBy=model&metric=cost&aggMethod=sum&timeRange=this_month&timeGroup=day&filter.api_key=my%20key%20%26%20co",
    )
  })
})

describe("padEnd / padStart", () => {
  test("padEnd right-pads to width", () => {
    assert.equal(padEnd("abc", 5), "abc  ")
    assert.equal(padEnd("abc", 3), "abc")
    assert.equal(padEnd("abc", 2), "abc")
  })

  test("padStart left-pads to width", () => {
    assert.equal(padStart("abc", 5), "  abc")
    assert.equal(padStart("abc", 3), "abc")
    assert.equal(padStart("abc", 2), "abc")
  })
})

describe("severityColor", () => {
  const theme = { error: "red", warning: "yellow", success: "green" }

  test("ok → success color", () => {
    assert.equal(severityColor("ok", theme), "green")
  })

  test("warning → warning color", () => {
    assert.equal(severityColor("warning", theme), "yellow")
  })

  test("critical → error color", () => {
    assert.equal(severityColor("critical", theme), "red")
  })
})
