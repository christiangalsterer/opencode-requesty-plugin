import { resolveThresholds, type SpendThresholds } from "./format"

const DEFAULT_REFRESH_INTERVAL_MS = 5 * 60 * 1000
const DEFAULT_MAX_MODELS = 5
const DEFAULT_ORDER = 50

const MIN_REFRESH_INTERVAL_MS = 10 * 1000
const MAX_REFRESH_INTERVAL_MS = 60 * 60 * 1000
const MIN_MAX_MODELS = 1
const MAX_MAX_MODELS = 20

export type SidebarSettings = {
  enabled: boolean
  maxModels: number
  showTokens: boolean
  showKeyName: boolean
  order: number
}

export type PromptSettings = {
  enabled: boolean
  budgetIndicator: boolean
  todaySpend: boolean
  dailyAvg: boolean
  avg7d: boolean
  avg30d: boolean
  showTokens: boolean
  showKeyName: boolean
  monthlyProjection: boolean
  order: number
}

export type DialogSettings = {
  showKeyName: boolean
}

export type PluginSettings = {
  refreshIntervalMs: number
  thresholds: SpendThresholds
  sidebar: SidebarSettings
  prompt: PromptSettings
  dialog: DialogSettings
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return fallback
  if (value < min) return fallback
  if (value > max) return fallback
  return value
}

function parseOrder(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_ORDER
  return value
}

function readSidebarSettings(raw: unknown): SidebarSettings {
  const obj = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {}
  return {
    enabled: typeof obj.enabled === "boolean" ? obj.enabled : true,
    maxModels: typeof obj.maxModels === "number" && obj.maxModels >= MIN_MAX_MODELS ? Math.min(Math.floor(obj.maxModels), MAX_MAX_MODELS) : DEFAULT_MAX_MODELS,
    showTokens: typeof obj.showTokens === "boolean" ? obj.showTokens : true,
    showKeyName: typeof obj.showKeyName === "boolean" ? obj.showKeyName : false,
    order: parseOrder(obj.order),
  }
}

export function readSettings(options: Record<string, unknown> | undefined): PluginSettings {
  return {
    refreshIntervalMs: clampNumber(options?.refreshIntervalMs, MIN_REFRESH_INTERVAL_MS, MAX_REFRESH_INTERVAL_MS, DEFAULT_REFRESH_INTERVAL_MS),
    thresholds: resolveThresholds(options?.warningThreshold, options?.errorThreshold),
    sidebar: readSidebarSettings(options?.sidebar),
    prompt: readPromptSettings(options?.prompt),
    dialog: readDialogSettings(options?.dialog),
  }
}

function readDialogSettings(raw: unknown): DialogSettings {
  const obj = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {}
  return {
    showKeyName: typeof obj.showKeyName === "boolean" ? obj.showKeyName : false,
  }
}

function readPromptSettings(raw: unknown): PromptSettings {
  const obj = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {}
  return {
    enabled: typeof obj.enabled === "boolean" ? obj.enabled : true,
    budgetIndicator: typeof obj.budgetIndicator === "boolean" ? obj.budgetIndicator : true,
    todaySpend: typeof obj.todaySpend === "boolean" ? obj.todaySpend : true,
    dailyAvg: typeof obj.dailyAvg === "boolean" ? obj.dailyAvg : false,
    avg7d: typeof obj["7dAvg"] === "boolean" ? obj["7dAvg"] : false,
    avg30d: typeof obj["30dAvg"] === "boolean" ? obj["30dAvg"] : false,
    showTokens: typeof obj.showTokens === "boolean" ? obj.showTokens : true,
    showKeyName: typeof obj.showKeyName === "boolean" ? obj.showKeyName : false,
    monthlyProjection: typeof obj.monthlyProjection === "boolean" ? obj.monthlyProjection : true,
    order: parseOrder(obj.order),
  }
}
