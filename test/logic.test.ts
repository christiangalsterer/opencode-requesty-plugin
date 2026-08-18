import { describe, test } from "bun:test"
import assert from "node:assert/strict"
import { aggregateByModel, avgSpendLastNDays, dayKey, endOfLastMonth, filterUsageByMonth, spendForDay, startOfCurrentMonth, startOfLastMonth, startOfRollingWindow, totalSpendFromUsage, type UsageResponse } from "../src/api"
import { DEFAULT_THRESHOLDS, analyticsUrl, dailyAverage, daysRemaining, daysToExhaustion, formatLimit, formatMonthDelta, formatMonthDeltaParts, formatOutputInputRatio, formatProjection, formatProjectionParts, formatTimestamp, formatTokenBreakdown, formatTokenInline, formatTokens, formatUsd, isProjectionOverLimit, modelAnalyticsUrl, normalizeThreshold, padEnd, padStart, paceMarker, paceStatus, projectedMonthEnd, renderBar, resolveThresholds, severityColor, shortModel, spendRatio, spendSeverity } from "../src/format"

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

describe("startOfLastMonth / endOfLastMonth", () => {
  test("returns first and last day of previous month in UTC", () => {
    const now = new Date("2026-08-09T15:30:00Z")
    assert.equal(startOfLastMonth(now), "2026-07-01T00:00:00.000Z")
    assert.equal(endOfLastMonth(now), "2026-07-31T23:59:59.000Z")
  })

  test("handles January (rolls to previous year)", () => {
    const now = new Date("2026-01-15T12:00:00Z")
    assert.equal(startOfLastMonth(now), "2025-12-01T00:00:00.000Z")
    assert.equal(endOfLastMonth(now), "2025-12-31T23:59:59.000Z")
  })
})

describe("startOfRollingWindow", () => {
  test("returns midnight UTC N days before the given date", () => {
    const now = new Date("2026-08-18T15:30:00Z")
    assert.equal(startOfRollingWindow(30, now), "2026-07-19T00:00:00.000Z")
  })

  test("returns the start of today for a 0-day window", () => {
    const now = new Date("2026-08-18T15:30:00Z")
    assert.equal(startOfRollingWindow(0, now), "2026-08-18T00:00:00.000Z")
  })
})

describe("filterUsageByMonth", () => {
  test("keeps only entries from the current calendar month", () => {
    const response = {
      usage: {
        "2026-07-30": { spend: 1 },
        "2026-07-31": { spend: 2 },
        "2026-08-01": { spend: 3 },
        "2026-08-15": { spend: 4 },
        "2026-09-01": { spend: 5 },
      },
    } as unknown as UsageResponse
    const filtered = filterUsageByMonth(response, new Date("2026-08-15T12:00:00Z"))
    assert.deepEqual(Object.keys(filtered.usage).sort(), ["2026-08-01", "2026-08-15"])
    assert.equal(totalSpendFromUsage(filtered), 7)
  })

  test("handles empty usage", () => {
    assert.deepEqual(filterUsageByMonth({ usage: {} }, new Date("2026-08-15T12:00:00Z")), { usage: {} })
  })
})

describe("totalSpendFromUsage", () => {
  test("sums spend across all entries", () => {
    const usage = {
      usage: {
        "2026-07-01": { spend: "1.50" },
        "2026-07-02": { spend: "3.20" },
        "2026-07-03": { spend: 2 },
      },
    } as unknown as UsageResponse
    assert.equal(totalSpendFromUsage(usage), 6.7)
  })

  test("returns 0 for empty usage", () => {
    assert.equal(totalSpendFromUsage({ usage: {} }), 0)
  })
})

describe("spendForDay", () => {
  const usage = {
    usage: {
      "2026-08-14": { spend: "1.50", grouped_data: [{ group_by_values: { model_used: "openai/gpt-5" }, spend: 1.5 }] },
      "2026-08-15": { spend: "3.20", grouped_data: [{ group_by_values: { model_used: "openai/gpt-5" }, spend: 3.2 }] },
    },
  } as unknown as UsageResponse

  test("dayKey returns YYYY-MM-DD in UTC", () => {
    assert.equal(dayKey(new Date("2026-08-15T23:59:00Z")), "2026-08-15")
    assert.equal(dayKey(new Date("2026-08-16T00:01:00Z")), "2026-08-16")
  })

  test("returns spend for the matching day", () => {
    assert.equal(spendForDay(usage, new Date("2026-08-15T12:00:00Z")), 3.2)
    assert.equal(spendForDay(usage, new Date("2026-08-14T12:00:00Z")), 1.5)
  })

  test("returns 0 when no entry for the day", () => {
    assert.equal(spendForDay(usage, new Date("2026-08-01T12:00:00Z")), 0)
  })

  test("returns 0 for empty usage", () => {
    assert.equal(spendForDay({ usage: {} }, new Date("2026-08-15T12:00:00Z")), 0)
  })

  test("coerces string decimals", () => {
    const strUsage = {
      usage: { "2026-08-15": { spend: "7.99" } },
    } as unknown as UsageResponse
    assert.equal(spendForDay(strUsage, new Date("2026-08-15T12:00:00Z")), 7.99)
  })
})

describe("avgSpendLastNDays", () => {
  const usage = {
    usage: {
      "2026-08-13": { spend: 2 },
      "2026-08-14": { spend: 4 },
      "2026-08-15": { spend: 6 },
    },
  } as unknown as UsageResponse
  const now = new Date("2026-08-15T12:00:00Z")

  test("averages spend over the last N completed days excluding today", () => {
    // previous 3 days: 4 + 2 + 0 = 6 / 3 = 2
    assert.equal(avgSpendLastNDays(usage, 3, now), 2)
  })

  test("days with no entry count as 0", () => {
    // previous 5 days: 4 + 2 + 0 + 0 + 0 = 6 / 5 = 1.2
    assert.equal(avgSpendLastNDays(usage, 5, now), 1.2)
  })

  test("returns 0 when days <= 0", () => {
    assert.equal(avgSpendLastNDays(usage, 0, now), 0)
    assert.equal(avgSpendLastNDays(usage, -1, now), 0)
  })

  test("returns 0 for empty usage", () => {
    assert.equal(avgSpendLastNDays({ usage: {} }, 7, now), 0)
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

  test("formatTimestamp renders a locale string with spaces", () => {
    const formatted = formatTimestamp(new Date("2026-08-14T23:05:09.123Z"))
    assert.ok(formatted.includes("2026"))
    assert.ok(formatted.includes("08"))
    assert.ok(formatted.includes("14"))
    assert.ok(formatted.includes("23"))
    assert.ok(!formatted.includes("T"))
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

  test("formatTokenInline", () => {
    assert.equal(formatTokenInline(1_000_000, 200_000), "↑1.0M ↓200.0k")
    assert.equal(formatTokenInline(0, 0), "↑0 ↓0")
    assert.equal(formatTokenInline(500, 0), "↑500 ↓0")
    assert.equal(formatTokenInline(0, 3_000_000_000), "↑0 ↓3.0B")
    assert.equal(formatTokenInline(1_500, 2_500_000), "↑1.5k ↓2.5M")
  })

  test("formatOutputInputRatio", () => {
    assert.equal(formatOutputInputRatio(1_000, 200), "0.20")
    assert.equal(formatOutputInputRatio(300, 110), "0.37")
    assert.equal(formatOutputInputRatio(80, 18), "0.23")
    assert.equal(formatOutputInputRatio(1_000, 500), "0.50")
    assert.equal(formatOutputInputRatio(100, 0), "0.00")
    assert.equal(formatOutputInputRatio(0, 200), "—")
    assert.equal(formatOutputInputRatio(0, 0), "—")
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

  test("modelAnalyticsUrl adds a model filter to the dashboard URL", () => {
    assert.equal(
      modelAnalyticsUrl("my-opencode-key", "anthropic/claude-sonnet-4-5"),
      "https://app.requesty.ai/analytics/advanced?groupBy=model&metric=cost&aggMethod=sum&timeRange=this_month&timeGroup=day&filter.api_key=my-opencode-key&filter.model=anthropic%2Fclaude-sonnet-4-5",
    )
  })
})

describe("month projection", () => {
  // All dates fixed to 2026-08-15 (15/31 ≈ 48.4% of month elapsed).
  const aug15 = new Date("2026-08-15T12:00:00Z")

  test("projectedMonthEnd scales spend by daysInMonth / dayOfMonth", () => {
    // $10 over 15 days → $20 over 31 days
    assert.equal(projectedMonthEnd(10, aug15), (10 / 15) * 31)
  })

  test("dailyAverage is spend / dayOfMonth", () => {
    assert.equal(dailyAverage(30, aug15), 2)
    assert.equal(dailyAverage(0, aug15), 0)
  })

  test("paceStatus compares spend ratio to time ratio", () => {
    // limit 100, spend 10 → 10% spent vs 48% elapsed → under
    assert.equal(paceStatus(10, 100, aug15), "under")
    // limit 100, spend 60 → 60% spent vs 48% elapsed → over
    assert.equal(paceStatus(60, 100, aug15), "over")
    // limit 100, spend 50 → 50% spent vs 48% elapsed → on (within tolerance)
    assert.equal(paceStatus(50, 100, aug15), "on")
  })

  test("paceStatus returns undefined for unlimited (limit <= 0)", () => {
    assert.equal(paceStatus(1000, 0, aug15), undefined)
    assert.equal(paceStatus(1000, -1, aug15), undefined)
  })

  test("paceMarker glyphs", () => {
    assert.equal(paceMarker("over"), "↑")
    assert.equal(paceMarker("under"), "↓")
    assert.equal(paceMarker("on"), "→")
    assert.equal(paceMarker(undefined), "")
  })

  test("formatProjection renders `~$X EOM <marker>`", () => {
    // limit 100, spend 60 → over pace; (60/15)*31 = 124.0
    assert.equal(formatProjection(60, 100, aug15), `~${formatUsd((60 / 15) * 31)} EOM ↑`)
    // limit 100, spend 10 → under pace; (10/15)*31 = 20.6666… → truncated to $20.66
    assert.equal(formatProjection(10, 100, aug15), `~${formatUsd((10 / 15) * 31)} EOM ↓`)
  })

  test("formatProjection omits marker when limit is unlimited", () => {
    // (30/15)*31 = 62.0
    assert.equal(formatProjection(30, 0, aug15), `~${formatUsd((30 / 15) * 31)} EOM`)
  })

  test("formatProjection is empty when there is no spend", () => {
    assert.equal(formatProjection(0, 100, aug15), "")
  })

  test("formatProjection truncates (not rounds) to 2 decimals", () => {
    // spend 7, day 15, days 31 → (7/15)*31 = 14.4666…
    const result = formatProjection(7, 0, aug15)
    assert.ok(result.startsWith("~$14.46 EOM"), `expected ~$14.46 EOM…, got ${result}`)
  })

  test("formatProjectionParts returns projected amount and pace arrow", () => {
    assert.deepEqual(formatProjectionParts(60, 100, aug15), { projected: (60 / 15) * 31, arrow: "↑", pace: "over" })
    assert.deepEqual(formatProjectionParts(10, 100, aug15), { projected: (10 / 15) * 31, arrow: "↓", pace: "under" })
  })

  test("formatProjectionParts omits arrow when limit is unlimited", () => {
    assert.deepEqual(formatProjectionParts(30, 0, aug15), { projected: (30 / 15) * 31, arrow: "", pace: undefined })
  })

  test("formatProjectionParts is undefined when there is no spend", () => {
    assert.equal(formatProjectionParts(0, 100, aug15), undefined)
  })

  test("daysRemaining counts days left including today", () => {
    // Aug 15 → 31 - 15 + 1 = 17 days left
    assert.equal(daysRemaining(aug15), 17)
    // Aug 1 → 31 days left
    assert.equal(daysRemaining(new Date("2026-08-01T12:00:00Z")), 31)
    // Aug 31 → 1 day left
    assert.equal(daysRemaining(new Date("2026-08-31T12:00:00Z")), 1)
  })

  test("daysToExhaustion computes days until budget runs out", () => {
    // remaining 70, avg 2/day → 35
    assert.equal(daysToExhaustion(30, 100, 2), 35)
    // remaining 10, avg 6/day → 1 (floored)
    assert.equal(daysToExhaustion(90, 100, 6), 1)
  })

  test("daysToExhaustion returns undefined for unlimited or no average", () => {
    assert.equal(daysToExhaustion(30, 0, 2), undefined)
    assert.equal(daysToExhaustion(30, 100, 0), undefined)
  })

  test("formatMonthDelta compares projected spend to last month", () => {
    // current spend 15 (projected 31), last month 10 → +210%
    assert.equal(formatMonthDelta(15, 10, aug15), `▲ +210% ($10.00 last month)`)
    // current spend 3 (projected 6.2), last month 20 → -69%
    assert.equal(formatMonthDelta(3, 20, aug15), `▼ -69% ($20.00 last month)`)
    // same projected as last month → →
    // current spend 10 (projected 20.666…), last month ~20.67 → 0%
    assert.equal(formatMonthDelta(10, (10 / 15) * 31, aug15), `→ 0% (${formatUsd((10 / 15) * 31)} last month)`)
  })

  test("formatMonthDelta is empty when no current or last month spend", () => {
    assert.equal(formatMonthDelta(0, 10, aug15), "")
    assert.equal(formatMonthDelta(10, 0, aug15), "")
  })

  test("formatMonthDeltaParts returns arrow, sign, and percentage", () => {
    assert.deepEqual(formatMonthDeltaParts(15, 10, aug15), { arrow: "▲", sign: "+", pct: 210 })
    assert.deepEqual(formatMonthDeltaParts(3, 20, aug15), { arrow: "▼", sign: "", pct: -69 })
    assert.deepEqual(formatMonthDeltaParts(10, (10 / 15) * 31, aug15), { arrow: "→", sign: "", pct: 0 })
  })

  test("formatMonthDeltaParts is undefined when no current or last month spend", () => {
    assert.equal(formatMonthDeltaParts(0, 10, aug15), undefined)
    assert.equal(formatMonthDeltaParts(10, 0, aug15), undefined)
  })

  test("isProjectionOverLimit is true when projected spend exceeds limit", () => {
    // spend 60, limit 100 → projects (60/15)*31 = 124 > 100
    assert.equal(isProjectionOverLimit(60, 100, aug15), true)
  })

  test("isProjectionOverLimit is false when projected spend is under limit", () => {
    // spend 10, limit 100 → projects (10/15)*31 ≈ 20.67 < 100
    assert.equal(isProjectionOverLimit(10, 100, aug15), false)
  })

  test("isProjectionOverLimit is false when projected spend equals limit exactly", () => {
    // spend 15, limit 31 → projects (15/15)*31 = 31 (clean integers, no FP drift)
    assert.equal(isProjectionOverLimit(15, 31, aug15), false)
  })

  test("isProjectionOverLimit is false for unlimited (limit <= 0)", () => {
    assert.equal(isProjectionOverLimit(60, 0, aug15), false)
    assert.equal(isProjectionOverLimit(60, -1, aug15), false)
  })

  test("isProjectionOverLimit is false when there is no spend", () => {
    assert.equal(isProjectionOverLimit(0, 100, aug15), false)
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
