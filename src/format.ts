/** Shared formatting helpers for the Requesty widget and dialog. */

/** Format a USD amount truncated (not rounded) to 2 decimal places. */
export function formatUsd(amount: number): string {
  const truncated = Math.trunc(amount * 100) / 100
  return `$${truncated.toFixed(2)}`
}

/** Spend/limit ratio; 0 when there is no limit (limit <= 0 means unlimited). */
export function spendRatio(spend: number, limit: number): number {
  return limit > 0 ? spend / limit : 0
}

/** Human-readable limit label: formatted amount, or "unlimited" when limit <= 0. */
export function formatLimit(limit: number): string {
  return limit > 0 ? formatUsd(limit) : "unlimited"
}

export function formatTokens(count: number): string {
  if (count >= 1_000_000_000) return `${(count / 1_000_000_000).toFixed(1)}B`
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`
  return `${count}`
}

export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`
}

/**
 * Compact input/output token breakdown, e.g. "(↑1.0M ↓200k)".
 * ↑ = input tokens (into the model), ↓ = output tokens (from the model).
 */
export function formatTokenBreakdown(inputTokens: number, outputTokens: number): string {
  return `(↑${formatTokens(inputTokens)} ↓${formatTokens(outputTokens)})`
}

/**
 * Output/input token ratio as a 2-decimal string, e.g. "0.37".
 * Returns "—" when input is 0 (avoids division by zero).
 */
export function formatOutputInputRatio(inputTokens: number, outputTokens: number): string {
  if (inputTokens <= 0) return "—"
  return (outputTokens / inputTokens).toFixed(2)
}

const BAR_WIDTH = 16
const BAR_FILLED = "■"
const BAR_EMPTY = "□"

export function renderBar(ratio: number, width = BAR_WIDTH): string {
  const clamped = Math.max(0, Math.min(1, ratio))
  const filled = Math.round(clamped * width)
  return BAR_FILLED.repeat(filled) + BAR_EMPTY.repeat(width - filled)
}

/** Shorten a model id for compact display: keep the part after the provider. */
export function shortModel(model: string, maxLength: number): string {
  const slash = model.indexOf("/")
  const short = slash >= 0 && slash < model.length - 1 ? model.slice(slash + 1) : model
  if (short.length <= maxLength) return short
  return short.slice(0, Math.max(1, maxLength - 1)) + "…"
}

export function monthName(date = new Date()): string {
  return date.toLocaleString("en-US", { month: "short" })
}

/** Number of days in the month of `date` (UTC). */
export function daysInMonth(date = new Date()): number {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
}

/** Day of month (1-based, UTC). */
export function dayOfMonth(date = new Date()): number {
  return date.getUTCDate()
}

/** Fraction of the month elapsed [0,1] — dayOfMonth / daysInMonth. */
export function monthElapsedRatio(date = new Date()): number {
  const days = daysInMonth(date)
  return days > 0 ? dayOfMonth(date) / days : 0
}

/** Average spend per day so far this month. */
export function dailyAverage(spend: number, date = new Date()): number {
  const day = dayOfMonth(date)
  return day > 0 ? spend / day : 0
}

/** Projected month-end spend at the current daily run rate. */
export function projectedMonthEnd(spend: number, date = new Date()): number {
  const day = dayOfMonth(date)
  const days = daysInMonth(date)
  return day > 0 ? (spend / day) * days : 0
}

/** Days remaining in the month (inclusive of today). */
export function daysRemaining(date = new Date()): number {
  return daysInMonth(date) - dayOfMonth(date) + 1
}

/**
 * Whether the projected month-end spend exceeds the budget limit.
 * Returns false when there is no limit (unlimited) or the projection
 * is at or below the limit (strictly "over").
 */
export function isProjectionOverLimit(spend: number, limit: number, date = new Date()): boolean {
  return limit > 0 && projectedMonthEnd(spend, date) > limit
}

/**
 * Days until budget exhaustion at the given daily average spend rate.
 * Returns undefined when there is no limit (unlimited) or no average.
 */
export function daysToExhaustion(spend: number, limit: number, avgDailySpend: number): number | undefined {
  if (limit <= 0 || avgDailySpend <= 0) return undefined
  return Math.floor((limit - spend) / avgDailySpend)
}

export type Pace = "under" | "on" | "over"

/** Spend-ratio vs time-elapsed ratio within this many percentage points is "on pace". */
export const PACE_TOLERANCE = 0.05

/**
 * Compare spend pace to calendar pace. Only meaningful with a limit > 0;
 * returns undefined when the limit is unlimited (0 or negative).
 *   spend/limit vs dayOfMonth/daysInMonth, within PACE_TOLERANCE → "on".
 */
export function paceStatus(spend: number, limit: number, date = new Date()): Pace | undefined {
  if (limit <= 0) return undefined
  const timeRatio = monthElapsedRatio(date)
  const spendRatio = spend / limit
  if (spendRatio - timeRatio > PACE_TOLERANCE) return "over"
  if (timeRatio - spendRatio > PACE_TOLERANCE) return "under"
  return "on"
}

/** Direction glyph for a pace: ↑ over, → on, ↓ under, "" when unlimited. */
export function paceMarker(pace: Pace | undefined): string {
  if (pace === "over") return "↑"
  if (pace === "under") return "↓"
  if (pace === "on") return "→"
  return ""
}

/**
 * One-line projection for the sidebar, e.g. "~$42.80 EOM ↑".
 * Empty string when there is no spend to project from (spend <= 0).
 * The pace marker is omitted when the limit is unlimited.
 */
export function formatProjection(spend: number, limit: number, date = new Date()): string {
  if (spend <= 0) return ""
  const projected = projectedMonthEnd(spend, date)
  const marker = paceMarker(paceStatus(spend, limit, date))
  return marker ? `~${formatUsd(projected)} EOM ${marker}` : `~${formatUsd(projected)} EOM`
}

/**
 * Format a month-over-month delta, e.g. "▲ +42% ($8.80 last month)".
 * Compares projected month-end spend to last month's total.
 * Returns empty string when last month had no spend or no current spend to project from.
 */
export function formatMonthDelta(currentSpend: number, lastMonthSpend: number, date = new Date()): string {
  if (lastMonthSpend <= 0 || currentSpend <= 0) return ""
  const projected = projectedMonthEnd(currentSpend, date)
  const pct = Math.round(((projected - lastMonthSpend) / lastMonthSpend) * 100)
  const arrow = pct > 0 ? "▲" : pct < 0 ? "▼" : "→"
  const sign = pct > 0 ? "+" : ""
  return `${arrow} ${sign}${pct}% (${formatUsd(lastMonthSpend)} last month)`
}

/** Requesty.ai analytics dashboard URL filtered to a specific API key name. */
export function analyticsUrl(keyName: string): string {
  return `https://app.requesty.ai/analytics/advanced?groupBy=model&metric=cost&aggMethod=sum&timeRange=this_month&timeGroup=day&filter.api_key=${encodeURIComponent(keyName)}`
}

/** Severity of budget usage, used to color the progress bar. */
export type SpendSeverity = "ok" | "warning" | "critical"

/** Spend/limit ratios at which the bar turns yellow (warning) and red (error). */
export type SpendThresholds = {
  warning: number
  error: number
}

export const DEFAULT_THRESHOLDS: SpendThresholds = { warning: 0.7, error: 0.9 }

/**
 * Map a spend/limit ratio to a severity:
 *   >= error threshold   → critical (red)
 *   >= warning threshold → warning (yellow)
 *   else                 → ok (green)
 */
export function spendSeverity(ratio: number, thresholds: SpendThresholds = DEFAULT_THRESHOLDS): SpendSeverity {
  if (ratio >= thresholds.error) return "critical"
  if (ratio >= thresholds.warning) return "warning"
  return "ok"
}

/** Normalize a user-provided threshold (0–1 ratio or 0–100 percent) to a ratio. */
export function normalizeThreshold(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined
  return value > 1 ? value / 100 : value
}

/**
 * Resolve user-configured thresholds to ratios. Missing or invalid values
 * fall back to the defaults (70%/90%); if warning >= error, both fall back.
 */
export function resolveThresholds(warning: unknown, error: unknown): SpendThresholds {
  const thresholds: SpendThresholds = {
    warning: normalizeThreshold(warning) ?? DEFAULT_THRESHOLDS.warning,
    error: normalizeThreshold(error) ?? DEFAULT_THRESHOLDS.error,
  }
  if (thresholds.warning >= thresholds.error) return { ...DEFAULT_THRESHOLDS }
  return thresholds
}

/** Right-pad a string to `width` with spaces; no-op when already long enough. */
export function padEnd(value: string, width: number): string {
  return value.length >= width ? value : value + " ".repeat(width - value.length)
}

/** Left-pad a string to `width` with spaces; no-op when already long enough. */
export function padStart(value: string, width: number): string {
  return value.length >= width ? value : " ".repeat(width - value.length) + value
}

/** Theme subset used to map a severity to a color. Structural type keeps format.ts free of plugin SDK imports. */
export type SeverityTheme = {
  error: unknown
  warning: unknown
  success: unknown
}

/** Map a spend severity to the matching theme color. Preserves the theme's color type. */
export function severityColor<T extends SeverityTheme>(severity: SpendSeverity, theme: T): T["error"] {
  if (severity === "critical") return theme.error
  if (severity === "warning") return theme.warning as T["error"]
  return theme.success as T["error"]
}
