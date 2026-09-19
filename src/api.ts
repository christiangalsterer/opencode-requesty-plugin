/** Requesty Management API client. */

const REQUESTY_ORIGIN = 'https://api-v2.requesty.ai'
const REQUEST_TIMEOUT_MS = 10_000

export type ApiLogger = (level: 'debug' | 'info' | 'warn' | 'error', message: string) => void

// Injected by the opencode host at plugin init; defaults to a no-op so pure
// module usage (and tests) never touches `console` (invisible in the TUI).
let apiLogger: ApiLogger | undefined

export function setApiLogger(logger: ApiLogger | undefined): void {
  apiLogger = logger
}

function logWarn(message: string): void {
  apiLogger?.('warn', message)
}

export interface ApiKeyInfo {
  id: string
  name: string
  logging: boolean
  monthly_spend: number
  monthly_limit: number
  permissions: {
    manage: 'none' | 'read' | 'write'
    completions: 'none' | 'read' | 'write'
  }
  group?: { id: string }
}

/** The API serializes decimal fields as strings — coerce them to numbers. */
function toNumber(value: unknown, field?: string): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  if (field) logWarn(`Failed to coerce field "${field}" to number: ${JSON.stringify(value)}`)
  return 0
}

export interface UsageGroupedEntry {
  group_by_values: Record<string, unknown>
  completions_requests?: number
  spend?: number
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
}

export interface UsageEntry {
  completions_requests?: number
  spend?: number
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
  grouped_data?: UsageGroupedEntry[]
}

export interface UsageResponse {
  usage: Record<string, UsageEntry>
}

export class RequestyApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'RequestyApiError'
    this.status = status
  }
}

async function request<T>(apiKey: string, path: string, init?: { params?: Record<string, string> }): Promise<T> {
  const url = new URL(path, REQUESTY_ORIGIN.endsWith('/') ? REQUESTY_ORIGIN : `${REQUESTY_ORIGIN}/`)
  for (const [key, value] of Object.entries(init?.params ?? {})) {
    url.searchParams.set(key, value)
  }
  let response: Response
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json'
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new RequestyApiError(408, `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`)
    }
    throw error
  }
  if (!response.ok) {
    let message = `HTTP ${response.status}`
    const raw = await response.text()
    try {
      const body = JSON.parse(raw) as { error?: { message?: string } }
      if (body?.error?.message) message = body.error.message
    } catch {
      logWarn(`Failed to parse API error body (HTTP ${response.status}): ${raw.slice(0, 200)}`)
    }
    throw new RequestyApiError(response.status, message)
  }
  return (await response.json()) as T
}

/** Get information about the calling API key (`self`). */
export async function getApiKeySelf(apiKey: string): Promise<ApiKeyInfo> {
  const info = await request<ApiKeyInfo>(apiKey, '/v1/manage/apikey/self')
  return {
    ...info,
    monthly_spend: toNumber(info.monthly_spend, 'monthly_spend'),
    monthly_limit: toNumber(info.monthly_limit, 'monthly_limit')
  }
}

export interface UsageQuery {
  /** RFC3339 start datetime (required). */
  start: string
  /** RFC3339 end datetime (optional). */
  end?: string
  groupBy?: string[]
  resolution?: 'hour' | 'day' | 'month'
}

/** Get usage statistics for the calling API key (`self`). */
export async function getUsageSelf(apiKey: string, query: UsageQuery): Promise<UsageResponse> {
  const params: Record<string, string> = { start: query.start }
  if (query.end) params.end = query.end
  if (query.groupBy && query.groupBy.length > 0) params.group_by = query.groupBy.join(',')
  if (query.resolution) params.resolution = query.resolution
  return request<UsageResponse>(apiKey, '/v1/manage/apikey/self/usage', { params })
}

/** Per-model aggregate over a usage response. */
export interface ModelUsage {
  model: string
  spend: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  requests: number
}

/** Aggregated totals from a usage response. */
export interface AggregatedUsage {
  models: ModelUsage[]
  spend: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

/**
 * Flatten a usage response into per-model aggregates and compute grand totals.
 * When the response contains no grouped rows (e.g. no traffic), returns zeros.
 */
export function aggregateByModel(response: UsageResponse): AggregatedUsage {
  const byModel = new Map<string, ModelUsage>()
  const totals = { spend: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 }

  for (const entry of Object.values(response.usage ?? {})) {
    for (const group of entry.grouped_data ?? []) {
      const raw = group.group_by_values?.model_used ?? group.group_by_values?.model_requested ?? 'unknown'
      const model = typeof raw === 'string' && raw.length > 0 ? raw : 'unknown'

      const spend = toNumber(group.spend, 'spend')
      const input = toNumber(group.input_tokens, 'input_tokens')
      const output = toNumber(group.output_tokens, 'output_tokens')
      const total = toNumber(group.total_tokens, 'total_tokens')
      const requests = toNumber(group.completions_requests, 'completions_requests')

      const current = byModel.get(model) ?? { model, spend: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, requests: 0 }
      current.spend += spend
      current.inputTokens += input
      current.outputTokens += output
      current.totalTokens += total
      current.requests += requests
      byModel.set(model, current)

      totals.spend += spend
      totals.inputTokens += input
      totals.outputTokens += output
      totals.totalTokens += total
    }
  }
  return {
    models: [...byModel.values()].sort((a, b) => b.spend - a.spend),
    ...totals
  }
}

/** Sum all spend across every entry in a usage response. */
export function totalSpendFromUsage(response: UsageResponse): number {
  let total = 0
  for (const entry of Object.values(response.usage ?? {})) {
    total += toNumber(entry.spend, 'spend')
  }
  return total
}

/** RFC3339 timestamp for the start of the previous calendar month (UTC). */
export function startOfLastMonth(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString()
}

/** RFC3339 timestamp for the end of the previous calendar month (UTC). */
export function endOfLastMonth(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59)).toISOString()
}

/** RFC3339 timestamp for `days` days ago at midnight UTC. */
export function startOfRollingWindow(days: number, now = new Date()): string {
  const date = new Date(now)
  date.setUTCDate(date.getUTCDate() - days)
  date.setUTCHours(0, 0, 0, 0)
  return date.toISOString()
}

/** Keep only usage entries that fall within the current calendar month. */
export function filterUsageByMonth(response: UsageResponse, now = new Date()): UsageResponse {
  const prefix = dayKey(now).slice(0, 7)
  const filtered: Record<string, UsageEntry> = {}
  for (const [key, entry] of Object.entries(response.usage ?? {})) {
    if (key.startsWith(prefix)) filtered[key] = entry
  }
  return { usage: filtered }
}

/** Format a Date as a `YYYY-MM-DD` key matching the usage response (UTC). */
export function dayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}

/**
 * Sum spend for a specific day from a usage response. The response keys are
 * `YYYY-MM-DD` date strings; `dayKey` defaults to today (UTC).
 */
export function spendForDay(response: UsageResponse, now = new Date()): number {
  const key = dayKey(now)
  const entry = response.usage?.[key]
  if (!entry) return 0
  return toNumber(entry.spend, 'spend')
}

/** Invoke `fn` for each of the `days` completed calendar days before `now` (excluding today). */
function forEachPreviousDay(now: Date, days: number, fn: (date: Date) => void): void {
  for (let offset = 1; offset <= days; offset++) {
    const date = new Date(now)
    date.setUTCDate(date.getUTCDate() - offset)
    fn(date)
  }
}

/**
 * Average daily spend over the last `days` completed calendar days (excluding today).
 * Days with no usage entry count as 0. Returns 0 when `days` <= 0.
 */
export function avgSpendLastNDays(response: UsageResponse, days: number, now = new Date()): number {
  if (days <= 0) return 0
  let total = 0
  forEachPreviousDay(now, days, (date) => {
    total += spendForDay(response, date)
  })
  return total / days
}

export interface TokenBreakdown {
  input: number
  output: number
  total: number
}

/** Sum input/output/total tokens for a specific day. */
export function tokensForDay(response: UsageResponse, now = new Date()): TokenBreakdown {
  const key = dayKey(now)
  const entry = response.usage?.[key]
  if (!entry) return { input: 0, output: 0, total: 0 }
  if (entry.grouped_data && entry.grouped_data.length > 0) {
    return entry.grouped_data.reduce(
      (acc, group) => {
        acc.input += toNumber(group.input_tokens, 'input_tokens')
        acc.output += toNumber(group.output_tokens, 'output_tokens')
        acc.total += toNumber(group.total_tokens, 'total_tokens')
        return acc
      },
      { input: 0, output: 0, total: 0 }
    )
  }
  return {
    input: toNumber(entry.input_tokens, 'input_tokens'),
    output: toNumber(entry.output_tokens, 'output_tokens'),
    total: toNumber(entry.total_tokens, 'total_tokens')
  }
}

/** Average input/output/total tokens over the last `days` completed calendar days (excluding today). */
export function avgTokensLastNDays(response: UsageResponse, days: number, now = new Date()): TokenBreakdown {
  if (days <= 0) return { input: 0, output: 0, total: 0 }
  const totals: TokenBreakdown = { input: 0, output: 0, total: 0 }
  forEachPreviousDay(now, days, (date) => {
    const day = tokensForDay(response, date)
    totals.input += day.input
    totals.output += day.output
    totals.total += day.total
  })
  return {
    input: totals.input / days,
    output: totals.output / days,
    total: totals.total / days
  }
}

/** The metadata key under which Requesty records the session-affinity id. */
export const SESSION_AFFINITY_KEY = 'extra.X-Session-Affinity'

/** Aggregate cost/tokens/requests for a single Requesty session over a usage response. */
export interface SessionSpend {
  spend: number
  requests: number
  inputTokens: number
  outputTokens: number
}

function sessionGroupValue(group: UsageGroupedEntry, sessionIds: ReadonlySet<string>): boolean {
  return sessionIds.has(group.group_by_values?.[SESSION_AFFINITY_KEY] as string)
}

/** An empty session aggregate (all zeros). */
export function emptySessionSpend(): SessionSpend {
  return { spend: 0, requests: 0, inputTokens: 0, outputTokens: 0 }
}

/** Convert a session aggregate to a token breakdown (total = input + output). */
export function sessionSpendTokens(session: SessionSpend): TokenBreakdown {
  return { input: session.inputTokens, output: session.outputTokens, total: session.inputTokens + session.outputTokens }
}

/** Fold matching rows of a single day's `grouped_data` into `total`. */
function accumulateSessionGroups(groups: readonly UsageGroupedEntry[], sessionIds: ReadonlySet<string>, total: SessionSpend): SessionSpend {
  for (const group of groups) {
    if (!sessionGroupValue(group, sessionIds)) continue
    total.spend += toNumber(group.spend, 'spend')
    total.requests += toNumber(group.completions_requests, 'completions_requests')
    total.inputTokens += toNumber(group.input_tokens, 'input_tokens')
    total.outputTokens += toNumber(group.output_tokens, 'output_tokens')
  }
  return total
}

/**
 * Sum spend/tokens/requests for a set of session-affinity ids across every day
 * in a usage response, matching rows whose
 * `group_by_values[SESSION_AFFINITY_KEY]` is in `sessionIds`. A single session
 * id can be passed as `new Set([id])`. Returns zeros when no rows match.
 */
export function sessionSpendForSessionIds(response: UsageResponse, sessionIds: ReadonlySet<string>): SessionSpend {
  let total = emptySessionSpend()
  for (const entry of Object.values(response.usage ?? {})) {
    total = accumulateSessionGroups(entry.grouped_data ?? [], sessionIds, total)
  }
  return total
}

/**
 * Sum spend/tokens/requests for a set of session-affinity ids on the day
 * matching `dayKey(now)` (defaults to today, UTC). Returns zeros when the set
 * has no row that day.
 */
export function sessionSpendForSessionIdsForDay(response: UsageResponse, sessionIds: ReadonlySet<string>, now = new Date()): SessionSpend {
  const entry = response.usage?.[dayKey(now)]
  if (!entry) return emptySessionSpend()
  return accumulateSessionGroups(entry.grouped_data ?? [], sessionIds, emptySessionSpend())
}
