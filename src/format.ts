/** Shared formatting helpers for the Requesty widget and dialog. */

/** Format a USD amount rounded to 2 decimal places. */
export function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`
}

/** Spend/limit ratio; 0 when there is no limit (limit <= 0 means unlimited). */
export function spendRatio(spend: number, limit: number): number {
  return limit > 0 ? spend / limit : 0
}

/** Human-readable limit label: formatted amount, or "unlimited" when limit <= 0. */
export function formatLimit(limit: number): string {
  return limit > 0 ? formatUsd(limit) : 'unlimited'
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
 * Compact input/output token breakdown, e.g. " (↑1.0M ↓200k)".
 * ↑ = input tokens (into the model), ↓ = output tokens (from the model).
 */
export function formatTokenBreakdown(inputTokens: number, outputTokens: number): string {
  return `(${formatTokenInline(inputTokens, outputTokens)})`
}

/**
 * Inline input/output token breakdown without parentheses, e.g. "↑1.0M ↓200k".
 * ↑ = input tokens (into the model), ↓ = output tokens (from the model).
 */
export function formatTokenInline(inputTokens: number, outputTokens: number): string {
  return `↑${formatTokens(inputTokens)} ↓${formatTokens(outputTokens)}`
}

/**
 * Output/input token ratio as a 2-decimal string, e.g. "0.37".
 * Returns "—" when input is 0 (avoids division by zero).
 */
export function formatOutputInputRatio(inputTokens: number, outputTokens: number): string {
  if (inputTokens <= 0) return '—'
  return (outputTokens / inputTokens).toFixed(2)
}

const BAR_WIDTH = 16
const BAR_FILLED = '▓'
const BAR_EMPTY = '░'

export function renderBar(ratio: number, width = BAR_WIDTH): string {
  const clamped = Math.max(0, Math.min(1, ratio))
  const filled = Math.round(clamped * width)
  return BAR_FILLED.repeat(filled) + BAR_EMPTY.repeat(width - filled)
}

/** Shorten a model id for compact display: keep the part after the provider. */
export function shortModel(model: string, maxLength: number): string {
  const slash = model.indexOf('/')
  const short = slash >= 0 && slash < model.length - 1 ? model.slice(slash + 1) : model
  if (short.length <= maxLength) return short
  return short.slice(0, Math.max(1, maxLength - 1)) + '…'
}

/** Format a Date as `YYYY-MM-DD HH:MM:SS` in local time. */
export function formatTimestamp(date: Date): string {
  const yyyy = String(date.getFullYear()).padStart(4, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`
}

/** Format an RFC3339 timestamp as a `YYYY-MM-DD` label (UTC), e.g. "2026-08-27". */
export function formatSessionStart(startIso: string): string {
  return startIso.slice(0, 10)
}

/** Number of days in the month of `date` (UTC). */
export function daysInMonth(date = new Date()): number {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
}

/** Day of month (1-based, UTC). */
export function dayOfMonth(date = new Date()): number {
  return date.getUTCDate()
}

/** Number of weekdays; weight arrays are indexed 0 = Sunday … 6 = Saturday (matching `getUTCDay`). */
export const WEEKDAY_COUNT = 7

/**
 * How month-end spend is extrapolated from the spend so far:
 *   `calendar`  — every day of the month weighs the same (plain run rate).
 *   `workdays`  — only Mon–Fri are expected to produce spend.
 *   `weekday`   — per-weekday weights measured from recent usage history.
 */
export type ProjectionBasis = 'calendar' | 'workdays' | 'weekday'

/**
 * Relative expected spend per weekday, normalized so the weights average 1
 * (a weight of 1 therefore means "an average day"). `basis` reports which
 * model actually produced the weights, after any fallback.
 */
export interface ProjectionModel {
  basis: ProjectionBasis
  /** Weight per weekday, index 0 = Sunday … 6 = Saturday. */
  weights: readonly number[]
}

const UNIFORM_WEIGHTS: readonly number[] = [1, 1, 1, 1, 1, 1, 1]

/** Every day weighs the same — the plain calendar run rate. */
export const CALENDAR_PROJECTION: ProjectionModel = { basis: 'calendar', weights: UNIFORM_WEIGHTS }

/**
 * Normalize weekday weights so they average 1. Returns undefined when the
 * input is not a usable 7-slot, non-negative, non-zero-sum weight array.
 */
export function normalizeWeights(values: readonly number[]): number[] | undefined {
  if (values.length !== WEEKDAY_COUNT) return undefined
  let sum = 0
  for (const value of values) {
    if (!Number.isFinite(value) || value < 0) return undefined
    sum += value
  }
  if (sum <= 0) return undefined
  const mean = sum / WEEKDAY_COUNT
  return values.map((value) => value / mean)
}

/** Mon–Fri only: weekend days are expected to produce no spend. */
export const WORKDAY_PROJECTION: ProjectionModel = {
  basis: 'workdays',
  weights: normalizeWeights([0, 1, 1, 1, 1, 1, 0]) ?? UNIFORM_WEIGHTS
}

/**
 * Observed spend per weekday: `totals[weekday]` summed spend and
 * `counts[weekday]` the number of complete days sampled (zero-spend days
 * included — they are what makes a quiet weekend measurable).
 */
export interface WeekdaySeries {
  totals: readonly number[]
  counts: readonly number[]
}

/** Minimum sampled days required before a measured weekday profile is trusted. */
export const MIN_WEEKDAY_SAMPLES = WEEKDAY_COUNT

/** An empty weekday series (all totals and counts zero). */
export function emptyWeekdaySeries(): WeekdaySeries {
  return { totals: new Array<number>(WEEKDAY_COUNT).fill(0), counts: new Array<number>(WEEKDAY_COUNT).fill(0) }
}

/**
 * Derive a weekday spend profile from sampled history. Weekdays without a
 * sample fall back to the overall daily mean (weight 1). Falls back to
 * `CALENDAR_PROJECTION` when the history is too short or carries no spend.
 */
export function weekdayProjection(series: WeekdaySeries): ProjectionModel {
  if (series.totals.length !== WEEKDAY_COUNT || series.counts.length !== WEEKDAY_COUNT) return CALENDAR_PROJECTION
  let totalSpend = 0
  let totalDays = 0
  for (let weekday = 0; weekday < WEEKDAY_COUNT; weekday++) {
    totalSpend += series.totals[weekday] ?? 0
    totalDays += series.counts[weekday] ?? 0
  }
  if (totalDays < MIN_WEEKDAY_SAMPLES || totalSpend <= 0) return CALENDAR_PROJECTION
  const overallMean = totalSpend / totalDays
  const averages: number[] = []
  for (let weekday = 0; weekday < WEEKDAY_COUNT; weekday++) {
    const count = series.counts[weekday] ?? 0
    averages.push(count > 0 ? (series.totals[weekday] ?? 0) / count : overallMean)
  }
  const weights = normalizeWeights(averages)
  if (!weights) return CALENDAR_PROJECTION
  return { basis: 'weekday', weights }
}

/**
 * Resolve the configured basis to a concrete model. The `weekday` basis needs
 * history and silently degrades to `calendar` when there is not enough of it.
 */
export function resolveProjection(basis: ProjectionBasis, series?: WeekdaySeries): ProjectionModel {
  if (basis === 'workdays') return WORKDAY_PROJECTION
  if (basis === 'weekday') return series ? weekdayProjection(series) : CALENDAR_PROJECTION
  return CALENDAR_PROJECTION
}

/** Short human-readable label for a projection basis, e.g. for a UI hint. */
export function projectionBasisLabel(basis: ProjectionBasis): string {
  if (basis === 'weekday') return 'weekday profile'
  if (basis === 'workdays') return 'workdays'
  return 'calendar'
}

/** Weekday (0 = Sunday) of the first day of `date`'s month (UTC). */
function firstWeekdayOfMonth(date: Date): number {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).getUTCDay()
}

/** Weight totals for a month, split into the elapsed part (through today) and the whole month. */
export interface MonthWeights {
  /** Summed weight of day 1 through today (today counted in full, as the run rate does). */
  elapsed: number
  /** Summed weight of every day in the month. */
  total: number
  /** Summed weight of the days after today. */
  remaining: number
}

/** Sum a model's weekday weights over a month, split at today. */
export function monthWeights(date = new Date(), model: ProjectionModel = CALENDAR_PROJECTION): MonthWeights {
  const days = daysInMonth(date)
  const today = dayOfMonth(date)
  const firstWeekday = firstWeekdayOfMonth(date)
  let elapsed = 0
  let total = 0
  for (let day = 1; day <= days; day++) {
    const weight = model.weights[(firstWeekday + day - 1) % WEEKDAY_COUNT] ?? 0
    total += weight
    if (day <= today) elapsed += weight
  }
  return { elapsed, total, remaining: total - elapsed }
}

/**
 * Fraction of the month's expected spend that the elapsed days account for.
 * With the calendar basis this is simply dayOfMonth / daysInMonth.
 */
function monthElapsedRatio(date = new Date(), model: ProjectionModel = CALENDAR_PROJECTION): number {
  const { elapsed, total } = monthWeights(date, model)
  if (total > 0 && elapsed > 0) return elapsed / total
  const days = daysInMonth(date)
  return days > 0 ? dayOfMonth(date) / days : 0
}

/** Average spend per day so far this month. */
export function dailyAverage(spend: number, date = new Date()): number {
  const day = dayOfMonth(date)
  return day > 0 ? spend / day : 0
}

/**
 * Projected month-end spend, extrapolating the spend so far over the month's
 * remaining expected weight. Falls back to the calendar run rate when the
 * elapsed days carry no weight (e.g. `workdays` basis on a month's first weekend).
 */
export function projectedMonthEnd(spend: number, date = new Date(), model: ProjectionModel = CALENDAR_PROJECTION): number {
  const { elapsed, total } = monthWeights(date, model)
  // Divide by the elapsed weight before scaling: with uniform weights this is
  // bit-identical to the plain `(spend / dayOfMonth) * daysInMonth` run rate,
  // so an exactly-on-target month projects to exactly the limit.
  if (elapsed > 0 && total > 0) return (spend / elapsed) * total
  const day = dayOfMonth(date)
  return day > 0 ? (spend / day) * daysInMonth(date) : 0
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
export function isProjectionOverLimit(spend: number, limit: number, date = new Date(), model: ProjectionModel = CALENDAR_PROJECTION): boolean {
  return limit > 0 && projectedMonthEnd(spend, date, model) > limit
}

/** Upper bound for the exhaustion walk, so a mostly-zero weight profile cannot loop forever. */
export const MAX_EXHAUSTION_DAYS = 365

/**
 * Days until budget exhaustion at the given daily average spend rate. The
 * average is a calendar average, so it is redistributed over the model's
 * weekday weights (which average 1) starting with tomorrow; with the calendar
 * basis this reduces to `floor((limit - spend) / avgDailySpend)`.
 * Returns undefined when there is no limit (unlimited) or no average, and is
 * capped at `MAX_EXHAUSTION_DAYS`.
 */
export function daysToExhaustion(
  spend: number,
  limit: number,
  avgDailySpend: number,
  date = new Date(),
  model: ProjectionModel = CALENDAR_PROJECTION
): number | undefined {
  if (limit <= 0 || avgDailySpend <= 0) return undefined
  const remaining = limit - spend
  if (remaining <= 0) return 0
  let accumulated = 0
  let days = 0
  const cursor = new Date(date.getTime())
  while (days < MAX_EXHAUSTION_DAYS) {
    cursor.setUTCDate(cursor.getUTCDate() + 1)
    const rate = avgDailySpend * (model.weights[cursor.getUTCDay()] ?? 0)
    if (accumulated + rate > remaining) break
    accumulated += rate
    days++
  }
  return days
}

export type Pace = 'under' | 'on' | 'over'

/** Spend-ratio vs time-elapsed ratio within this many percentage points is "on pace". */
export const PACE_TOLERANCE = 0.05

/**
 * Compare spend pace to the expected pace. Only meaningful with a limit > 0;
 * returns undefined when the limit is unlimited (0 or negative).
 * spend/limit vs the month's elapsed weight share, within PACE_TOLERANCE → "on".
 */
export function paceStatus(spend: number, limit: number, date = new Date(), model: ProjectionModel = CALENDAR_PROJECTION): Pace | undefined {
  if (limit <= 0) return undefined
  const timeRatio = monthElapsedRatio(date, model)
  const spendRatio = spend / limit
  if (spendRatio - timeRatio > PACE_TOLERANCE) return 'over'
  if (timeRatio - spendRatio > PACE_TOLERANCE) return 'under'
  return 'on'
}

/** Direction glyph for a pace: ↑ over, → on, ↓ under, "" when unlimited. */
export function paceMarker(pace: Pace | undefined): string {
  if (pace === 'over') return '↑'
  if (pace === 'under') return '↓'
  if (pace === 'on') return '→'
  return ''
}

/** Theme subset used to map a pace to a color. Structural type keeps format.ts free of plugin SDK imports. */
export interface PaceTheme {
  error: unknown
  success: unknown
  textMuted: unknown
}

/** Map a pace to the matching theme color: over → error, under → success, else muted. */
export function paceColor<T extends PaceTheme>(pace: Pace | undefined, theme: T): T['error'] {
  if (pace === 'over') return theme.error
  if (pace === 'under') return theme.success as T['error']
  return theme.textMuted as T['error']
}

export interface ProjectionParts {
  projected: number
  arrow: string
  pace: Pace | undefined
  /** The model that produced the projection, after any fallback. */
  basis: ProjectionBasis
}

/**
 * Decompose a month-end spend projection into its parts.
 * Returns undefined when there is no spend to project from (spend <= 0).
 * The pace arrow is empty when the limit is unlimited.
 */
export function formatProjectionParts(
  spend: number,
  limit: number,
  date = new Date(),
  model: ProjectionModel = CALENDAR_PROJECTION
): ProjectionParts | undefined {
  if (spend <= 0) return undefined
  const projected = projectedMonthEnd(spend, date, model)
  const pace = paceStatus(spend, limit, date, model)
  return { projected, arrow: paceMarker(pace), pace, basis: model.basis }
}

export interface MonthDeltaParts {
  arrow: string
  sign: string
  pct: number
}

/**
 * Decompose a month-over-month delta into its parts (arrow, sign, percentage).
 * Compares projected month-end spend to last month's total.
 * Returns undefined when last month had no spend or no current spend to project from.
 */
export function formatMonthDeltaParts(
  currentSpend: number,
  lastMonthSpend: number,
  date = new Date(),
  model: ProjectionModel = CALENDAR_PROJECTION
): MonthDeltaParts | undefined {
  if (lastMonthSpend <= 0 || currentSpend <= 0) return undefined
  const projected = projectedMonthEnd(currentSpend, date, model)
  // `|| 0` collapses the -0 that rounding a tiny negative delta produces, so a
  // no-change month reports a plain 0 rather than a signed zero.
  const pct = Math.round(((projected - lastMonthSpend) / lastMonthSpend) * 100) || 0
  const arrow = pct > 0 ? '▲' : pct < 0 ? '▼' : '→'
  const sign = pct > 0 ? '+' : ''
  return { arrow, sign, pct }
}

/** Requesty.ai analytics dashboard URL filtered to a specific API key name. */
export function analyticsUrl(keyName: string): string {
  return `https://app.requesty.ai/analytics/advanced?groupBy=model&metric=cost&aggMethod=sum&timeRange=this_month&timeGroup=day&filter.api_key=${encodeURIComponent(keyName)}`
}

/** Requesty.ai analytics dashboard URL filtered to a specific API key name and model. */
export function modelAnalyticsUrl(keyName: string, modelName: string): string {
  return `${analyticsUrl(keyName)}&filter.model=${encodeURIComponent(modelName)}`
}

/** Severity of budget usage, used to color the progress bar. */
export type SpendSeverity = 'ok' | 'warning' | 'critical'

/** Spend/limit ratios at which the bar turns yellow (warning) and red (error). */
export interface SpendThresholds {
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
  if (ratio >= thresholds.error) return 'critical'
  if (ratio >= thresholds.warning) return 'warning'
  return 'ok'
}

/** Normalize a user-provided threshold (0–1 ratio or 0–100 percent) to a ratio. */
export function normalizeThreshold(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined
  return value > 1 ? value / 100 : value
}

/**
 * Resolve user-configured thresholds to ratios. Missing or invalid values
 * fall back to the defaults (70%/90%); if warning >= error, both fall back.
 */
export function resolveThresholds(warning: unknown, error: unknown): SpendThresholds {
  const thresholds: SpendThresholds = {
    warning: normalizeThreshold(warning) ?? DEFAULT_THRESHOLDS.warning,
    error: normalizeThreshold(error) ?? DEFAULT_THRESHOLDS.error
  }
  if (thresholds.warning >= thresholds.error) return { ...DEFAULT_THRESHOLDS }
  return thresholds
}

/**
 * Structural subset of an assistant message's live-mutating fields. Kept local
 * so format.ts stays free of plugin SDK imports; structurally compatible with
 * the host's `Message` type. These mutations are what signal a repaint.
 */
export interface MessageRepaintFields {
  cost?: number
  time?: {
    created?: number
    completed?: number
  }
  tokens?: {
    input?: number
    output?: number
    reasoning?: number
    cache?: {
      read?: number
      write?: number
    }
  }
}

const HASH_PRIME = 31
const HASH_MOD = 2 ** 53

function hashMix(seed: number, value: number): number {
  return (seed * HASH_PRIME + value) % HASH_MOD
}

/**
 * Fold a single message's mutable fields into a running hash seed.
 * A "canonical" message must contribute the same bits regardless of whether
 * the object uses plain numbers or string-serialized decimals.
 */
function foldMessageValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

/**
 * Derive a scalar repaint key from a session's messages. The key changes
 * whenever an assistant message's content changes in place (cost, tokens,
 * completion time) even when the array length stays constant — mirroring how
 * `message.updated` mutates message data without resizing the messages array.
 *
 * Reading this key (via `api.state.session.messages(...)`) inside a
 * `createMemo` makes the host slot repaint on every `message.updated`, not
 * just on session start. Returns 0 when there is no repaint-relevant content.
 */
export function sessionRepaintKey(messages: readonly MessageRepaintFields[]): number {
  let seed = 0
  for (const message of messages) {
    seed = hashMix(seed, foldMessageValue(message.cost))
    seed = hashMix(seed, foldMessageValue(message.time?.completed ?? message.time?.created))
    const tokens = message.tokens
    if (!tokens) continue
    seed = hashMix(seed, foldMessageValue(tokens.input))
    seed = hashMix(seed, foldMessageValue(tokens.output))
    seed = hashMix(seed, foldMessageValue(tokens.reasoning))
    seed = hashMix(seed, foldMessageValue(tokens.cache?.read))
    seed = hashMix(seed, foldMessageValue(tokens.cache?.write))
  }
  return seed
}

/** Theme subset used to map a severity to a color. Structural type keeps format.ts free of plugin SDK imports. */
export interface SeverityTheme {
  error: unknown
  warning: unknown
  success: unknown
}

/** Map a spend severity to the matching theme color. Preserves the theme's color type. */
export function severityColor<T extends SeverityTheme>(severity: SpendSeverity, theme: T): T['error'] {
  if (severity === 'critical') return theme.error
  if (severity === 'warning') return theme.warning as T['error']
  return theme.success as T['error']
}
