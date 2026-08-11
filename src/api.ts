/**
 * Requesty Management API client.
 *
 * Docs: https://docs.requesty.ai/api-reference/management-apis
 * Base URL: https://api-v2.requesty.ai (global)
 *
 * Note: the usage endpoint is documented as `GET /v1/manage/apikey/{id}/usage`
 * with a JSON request body. Node/undici fetch refuses to send a body with GET,
 * and the server does not accept POST on this route (404). Query parameters
 * carry the same fields instead (verified: authentication reaches the handler
 * with query params).
 */

export const DEFAULT_BASE_URL = "https://api-v2.requesty.ai"
const REQUEST_TIMEOUT_MS = 10_000

export type ApiKeyInfo = {
  id: string
  name: string
  logging: boolean
  /** Amount spent this month in USD. The API returns decimals as strings; coerced to number. */
  monthly_spend: number
  /** Monthly spending limit in USD. 0 means unlimited. Coerced to number. */
  monthly_limit: number
  permissions: {
    manage: "none" | "read" | "write"
    completions: "none" | "read" | "write"
  }
  group?: { id: string }
}

/** The API serializes decimal fields as strings — coerce them to numbers. */
function toNumber(value: unknown): number {
  if (typeof value === "number") return value
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
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

async function request<T>(baseUrl: string, apiKey: string, path: string, init?: { params?: Record<string, string> }): Promise<T> {
  const url = new URL(path, baseUrl.endsWith("/") ? baseUrl : baseUrl + "/")
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
    try {
      const body = (await response.json()) as { error?: { message?: string } }
      if (body?.error?.message) message = body.error.message
    } catch {
      // keep generic message
    }
    throw new RequestyApiError(response.status, message)
  }
  return (await response.json()) as T
}

/** Get information about the calling API key (`self`). */
export async function getApiKeySelf(baseUrl: string, apiKey: string): Promise<ApiKeyInfo> {
  const info = await request<ApiKeyInfo>(baseUrl, apiKey, "/v1/manage/apikey/self")
  return {
    ...info,
    monthly_spend: toNumber(info.monthly_spend),
    monthly_limit: toNumber(info.monthly_limit),
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
export function getUsageSelf(baseUrl: string, apiKey: string, query: UsageQuery): Promise<UsageResponse> {
  const params: Record<string, string> = { start: query.start }
  if (query.end) params.end = query.end
  if (query.groupBy && query.groupBy.length > 0) params.group_by = query.groupBy.join(",")
  if (query.resolution) params.resolution = query.resolution
  return request<UsageResponse>(baseUrl, apiKey, "/v1/manage/apikey/self/usage", { params })
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

/**
 * Flatten a usage response into per-model aggregates. When the response
 * contains no grouped rows (e.g. no traffic), an empty array is returned.
 */
export function aggregateByModel(response: UsageResponse): ModelUsage[] {
  const byModel = new Map<string, ModelUsage>()
  for (const entry of Object.values(response.usage ?? {})) {
    for (const group of entry.grouped_data ?? []) {
      const raw = group.group_by_values?.model_used ?? group.group_by_values?.model_requested ?? "unknown"
      const model = typeof raw === "string" && raw.length > 0 ? raw : "unknown"
      const current = byModel.get(model) ?? { model, spend: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, requests: 0 }
      current.spend += toNumber(group.spend)
      current.inputTokens += toNumber(group.input_tokens)
      current.outputTokens += toNumber(group.output_tokens)
      current.totalTokens += toNumber(group.total_tokens)
      current.requests += toNumber(group.completions_requests)
      byModel.set(model, current)
    }
  }
  return [...byModel.values()].sort((a, b) => b.spend - a.spend)
}

/** RFC3339 timestamp for the start of the current calendar month (UTC). */
export function startOfCurrentMonth(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

/** Format a Date as a `YYYY-MM-DD` key matching the usage response (UTC). */
export function dayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}

function toNumberOrZero(value: unknown): number {
  if (typeof value === "number") return value
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

/**
 * Sum spend for a specific day from a usage response. The response keys are
 * `YYYY-MM-DD` date strings; `dayKey` defaults to today (UTC).
 */
export function spendForDay(response: UsageResponse, now = new Date()): number {
  const key = dayKey(now)
  const entry = response.usage?.[key]
  if (!entry) return 0
  return toNumberOrZero(entry.spend)
}
