import { DEFAULT_BASE_URL } from "./api"
import { resolveThresholds, type SpendThresholds } from "./format"

const DEFAULT_REFRESH_INTERVAL_MS = 5 * 60 * 1000
const DEFAULT_ACTIVITY_DEBOUNCE_MS = 30 * 1000
const DEFAULT_MAX_MODELS = 5

const MIN_REFRESH_INTERVAL_MS = 10 * 1000
const MAX_REFRESH_INTERVAL_MS = 60 * 60 * 1000
const MIN_ACTIVITY_DEBOUNCE_MS = 1 * 1000
const MAX_ACTIVITY_DEBOUNCE_MS = 60 * 60 * 1000
const MIN_MAX_MODELS = 1
const MAX_MAX_MODELS = 20

export type PluginSettings = {
  apiKey?: string
  baseUrl: string
  refreshIntervalMs: number
  activityDebounceMs: number
  maxModels: number
  thresholds: SpendThresholds
  promptIndicator: boolean
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return fallback
  if (value < min) return fallback
  if (value > max) return fallback
  return value
}

export function readSettings(options: Record<string, unknown> | undefined): PluginSettings {
  return {
    apiKey: typeof options?.apiKey === "string" && options.apiKey.length > 0 ? options.apiKey : undefined,
    baseUrl: typeof options?.baseUrl === "string" && options.baseUrl.length > 0 ? options.baseUrl : DEFAULT_BASE_URL,
    refreshIntervalMs: clampNumber(options?.refreshIntervalMs, MIN_REFRESH_INTERVAL_MS, MAX_REFRESH_INTERVAL_MS, DEFAULT_REFRESH_INTERVAL_MS),
    activityDebounceMs: clampNumber(options?.activityDebounceMs, MIN_ACTIVITY_DEBOUNCE_MS, MAX_ACTIVITY_DEBOUNCE_MS, DEFAULT_ACTIVITY_DEBOUNCE_MS),
    maxModels: typeof options?.maxModels === "number" && options.maxModels >= MIN_MAX_MODELS ? Math.min(Math.floor(options.maxModels), MAX_MAX_MODELS) : DEFAULT_MAX_MODELS,
    thresholds: resolveThresholds(options?.warningThreshold, options?.errorThreshold),
    promptIndicator: typeof options?.promptIndicator === "boolean" ? options.promptIndicator : true,
  }
}
