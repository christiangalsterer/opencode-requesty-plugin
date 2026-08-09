/** Shared formatting helpers for the Requesty widget and dialog. */

/** Format a USD amount truncated (not rounded) to 2 decimal places. */
export function formatUsd(amount: number): string {
  const truncated = Math.trunc(amount * 100) / 100
  return `$${truncated.toFixed(2)}`
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

const BAR_WIDTH = 16
const BAR_FILLED = "▓"
const BAR_EMPTY = "░"

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
