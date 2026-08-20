/** Requesty Management API client. */

const REQUESTY_ORIGIN = "https://api-v2.requesty.ai"
const REQUEST_TIMEOUT_MS = 10_000

// Injected by opencode host; keeping definition minimal to avoid import dependency.
const logger = {
  warn: (message: string) => console.warn(`[Requesty] ${message}`),
}

export type ApiKeyInfo = {
  id: string
  name: string
  logging: boolean
  monthly_spend: number
  monthly_limit: number
  permissions: {
    manage: "none" | "read" | "write"
    completions: "none" | "read" | "write"
  }
  group?: { id: string }
}

/** The API serializes decimal fields as strings — coerce them to numbers. */
function toNumber(value: unknown, field?: string): number {
  if (typeof value === "number") return value
  if (typeof value === "string") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  if (field) logger.warn(`Failed to coerce field "${field}" to number: ${JSON.stringify(value)}`)
  return 0
}

export type UsageGroupedEntry = {
  group_by_values: Record<string, unknown>
  completions_requests?: number
  spend?: number
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
}

export type UsageEntry = {
  completions_requests?: number
  spend?: number
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
  grouped_data?: UsageGroupedEntry[]
}

export type UsageResponse = {
  usage: Record<string, UsageEntry>
}

export class RequestyApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = "RequestyApiError"
    this.status = status
  }
}

async function request<T>(apiKey: string, path: string, init?: { params?: Record<string, string> }): Promise<T> {
  const url = new URL(path, REQUESTY_ORIGIN.endsWith("/") ? REQUESTY_ORIGIN : REQUESTY_ORIGIN + "/")
  for (const [key, value] of Object.entries(init?.params ?? {})) {
    url.searchParams.set(key, value)
  }
  let response: Response
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
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
      logger.warn(`Failed to parse API error body (HTTP ${response.status}): ${raw.slice(0, 200)}`)
    }
    throw new RequestyApiError(response.status, message)
  }
  return (await response.json()) as T
}

/** Get information about the calling API key (`self`). */
export async function getApiKeySelf(apiKey: string): Promise<ApiKeyInfo> {
  const info = await request<ApiKeyInfo>(apiKey, "/v1/manage/apikey/self")
  return {
    ...info,
    monthly_spend: toNumber(info.monthly_spend, "monthly_spend"),
    monthly_limit: toNumber(info.monthly_limit, "monthly_limit"),
  }
}

export type UsageQuery = {
  /** RFC3339 start datetime (required). */
  start: string
  /** RFC3339 end datetime (optional). */
  end?: string
  groupBy?: string[]
  resolution?: "hour" | "day" | "month"
}

/** Get usage statistics for the calling API key (`self`). */
export function getUsageSelf(apiKey: string, query: UsageQuery): Promise<UsageResponse> {
  const params: Record<string, string> = { start: query.start }
  if (query.end) params.end = query.end
  if (query.groupBy && query.groupBy.length > 0) params.group_by = query.groupBy.join(",")
  if (query.resolution) params.resolution = query.resolution
  return request<UsageResponse>(apiKey, "/v1/manage/apikey/self/usage", { params })
}

/** Per-model aggregate over a usage response. */
export type ModelUsage = {
  model: string
  spend: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  requests: number
}

/** Aggregated totals from a usage response. */
export type AggregatedUsage = {
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
      const raw = group.group_by_values?.model_used ?? group.group_by_values?.model_requested ?? "unknown"
      const model = typeof raw === "string" && raw.length > 0 ? raw : "unknown"
      
      const s = toNumber(group.spend, "spend")
      const i = toNumber(group.input_tokens, "input_tokens")
      const o = toNumber(group.output_tokens, "output_tokens")
      const t = toNumber(group.total_tokens, "total_tokens")
      const r = toNumber(group.completions_requests, "completions_requests")

      const current = byModel.get(model) ?? { model, spend: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, requests: 0 }
      current.spend += s
      current.inputTokens += i
      current.outputTokens += o
      current.totalTokens += t
      current.requests += r
      byModel.set(model, current)

      totals.spend += s
      totals.inputTokens += i
      totals.outputTokens += o
      totals.totalTokens += t
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
    total += toNumber(entry.spend, "spend")
  }
  return total
}

/** RFC3339 timestamp for the start of the current calendar month (UTC). */
export function startOfCurrentMonth(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
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
  return toNumber(entry.spend, "spend")
}

/**
 * Average daily spend over the last `days` completed calendar days (excluding today).
 * Days with no usage entry count as 0. Returns 0 when `days` <= 0.
 */
export function avgSpendLastNDays(response: UsageResponse, days: number, now = new Date()): number {
  if (days <= 0) return 0
  let total = 0
  for (let offset = 1; offset <= days; offset++) {
    const date = new Date(now)
    date.setUTCDate(date.getUTCDate() - offset)
    total += spendForDay(response, date)
  }
  return total / days
}

export type TokenBreakdown = {
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
        acc.input += toNumber(group.input_tokens, "input_tokens")
        acc.output += toNumber(group.output_tokens, "output_tokens")
        acc.total += toNumber(group.total_tokens, "total_tokens")
        return acc
      },
      { input: 0, output: 0, total: 0 },
    )
  }
  return {
    input: toNumber(entry.input_tokens, "input_tokens"),
    output: toNumber(entry.output_tokens, "output_tokens"),
    total: toNumber(entry.total_tokens, "total_tokens"),
  }
}

/** Average input/output/total tokens over the last `days` completed calendar days (excluding today). */
export function avgTokensLastNDays(response: UsageResponse, days: number, now = new Date()): TokenBreakdown {
  if (days <= 0) return { input: 0, output: 0, total: 0 }
  const totals: TokenBreakdown = { input: 0, output: 0, total: 0 }
  for (let offset = 1; offset <= days; offset++) {
    const date = new Date(now)
    date.setUTCDate(date.getUTCDate() - offset)
    const day = tokensForDay(response, date)
    totals.input += day.input
    totals.output += day.output
    totals.total += day.total
  }
  return {
    input: totals.input / days,
    output: totals.output / days,
    total: totals.total / days,
  }
}
