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

export type PromptSettings = {
  enabled: boolean
  budgetIndicator: boolean
  dailySpend: boolean
}

export type PluginSettings = {
  baseUrl: string
  refreshIntervalMs: number
  activityDebounceMs: number
  maxModels: number
  thresholds: SpendThresholds
  prompt: PromptSettings
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return fallback
  if (value < min) return fallback
  if (value > max) return fallback
  return value
}

export function readSettings(options: Record<string, unknown> | undefined): PluginSettings {
  return {
    baseUrl: typeof options?.baseUrl === "string" && options.baseUrl.length > 0 ? options.baseUrl : DEFAULT_BASE_URL,
    refreshIntervalMs: clampNumber(options?.refreshIntervalMs, MIN_REFRESH_INTERVAL_MS, MAX_REFRESH_INTERVAL_MS, DEFAULT_REFRESH_INTERVAL_MS),
    activityDebounceMs: clampNumber(options?.activityDebounceMs, MIN_ACTIVITY_DEBOUNCE_MS, MAX_ACTIVITY_DEBOUNCE_MS, DEFAULT_ACTIVITY_DEBOUNCE_MS),
    maxModels: typeof options?.maxModels === "number" && options.maxModels >= MIN_MAX_MODELS ? Math.min(Math.floor(options.maxModels), MAX_MAX_MODELS) : DEFAULT_MAX_MODELS,
    thresholds: resolveThresholds(options?.warningThreshold, options?.errorThreshold),
    prompt: readPromptSettings(options?.prompt),
  }
}

function readPromptSettings(raw: unknown): PromptSettings {
  const obj = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {}
  return {
    enabled: typeof obj.enabled === "boolean" ? obj.enabled : true,
    budgetIndicator: typeof obj.budgetIndicator === "boolean" ? obj.budgetIndicator : true,
    dailySpend: typeof obj.dailySpend === "boolean" ? obj.dailySpend : true,
  }
}
