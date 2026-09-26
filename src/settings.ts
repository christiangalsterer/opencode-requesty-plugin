import { type ProjectionBasis, resolveThresholds, type SpendThresholds } from './format'

const DEFAULT_REFRESH_INTERVAL_MS = 5 * 60 * 1000
const DEFAULT_MAX_MODELS = 5
const DEFAULT_ORDER = 50

const MIN_REFRESH_INTERVAL_MS = 10 * 1000
const MAX_REFRESH_INTERVAL_MS = 60 * 60 * 1000
const MIN_MAX_MODELS = 1
const MAX_MAX_MODELS = 20

/** Default projection basis: per-weekday profile measured from recent usage. */
const DEFAULT_PROJECTION_BASIS: ProjectionBasis = 'weekday'

/** Default history window (days) sampled for the weekday profile — 4 full weeks. */
export const DEFAULT_PROJECTION_HISTORY_DAYS = 28

/**
 * Bounds for the sampled history window. The upper bound stays below the API's
 * 90-day per-request range limit so the usage window still fits in one request
 * (a window starting at midnight `n` days ago spans slightly more than `n` days).
 */
const MIN_PROJECTION_HISTORY_DAYS = 7
const MAX_PROJECTION_HISTORY_DAYS = 84

const PROJECTION_BASES: readonly ProjectionBasis[] = ['calendar', 'workdays', 'weekday']

export interface ProjectionSettings {
  basis: ProjectionBasis
  /** Completed days of history sampled for the `weekday` basis. */
  historyDays: number
}

export interface SidebarSettings {
  enabled: boolean
  maxModels: number
  showTokens: boolean
  showKeyName: boolean
  showSessionInfo: boolean
  order: number
}

export interface PromptSettings {
  enabled: boolean
  budgetIndicator: boolean
  todaySpend: boolean
  dailyAvg: boolean
  avg7d: boolean
  avg30d: boolean
  showTokens: boolean
  showKeyName: boolean
  showSessionInfo: boolean
  monthlyProjection: boolean
  order: number
}

export interface DialogSettings {
  showKeyName: boolean
}

export interface PluginSettings {
  refreshIntervalMs: number
  thresholds: SpendThresholds
  projection: ProjectionSettings
  sidebar: SidebarSettings
  prompt: PromptSettings
  dialog: DialogSettings
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return fallback
  if (value < min) return fallback
  if (value > max) return fallback
  return value
}

function parseOrder(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_ORDER
  return value
}

function readSidebarSettings(raw: unknown): SidebarSettings {
  const obj = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  return {
    enabled: typeof obj.enabled === 'boolean' ? obj.enabled : true,
    maxModels:
      typeof obj.maxModels === 'number' && obj.maxModels >= MIN_MAX_MODELS ? Math.min(Math.floor(obj.maxModels), MAX_MAX_MODELS) : DEFAULT_MAX_MODELS,
    showTokens: typeof obj.showTokens === 'boolean' ? obj.showTokens : true,
    showKeyName: typeof obj.showKeyName === 'boolean' ? obj.showKeyName : false,
    showSessionInfo: typeof obj.showSessionInfo === 'boolean' ? obj.showSessionInfo : true,
    order: parseOrder(obj.order)
  }
}

export function readSettings(options: Record<string, unknown> | undefined): PluginSettings {
  return {
    refreshIntervalMs: clampNumber(options?.refreshIntervalMs, MIN_REFRESH_INTERVAL_MS, MAX_REFRESH_INTERVAL_MS, DEFAULT_REFRESH_INTERVAL_MS),
    thresholds: resolveThresholds(options?.warningThreshold, options?.errorThreshold),
    projection: readProjectionSettings(options?.projection),
    sidebar: readSidebarSettings(options?.sidebar),
    prompt: readPromptSettings(options?.prompt),
    dialog: readDialogSettings(options?.dialog)
  }
}

function readProjectionSettings(raw: unknown): ProjectionSettings {
  const obj = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const basis = PROJECTION_BASES.find((candidate) => candidate === obj.basis) ?? DEFAULT_PROJECTION_BASIS
  return {
    basis,
    historyDays: Math.floor(clampNumber(obj.historyDays, MIN_PROJECTION_HISTORY_DAYS, MAX_PROJECTION_HISTORY_DAYS, DEFAULT_PROJECTION_HISTORY_DAYS))
  }
}

function readDialogSettings(raw: unknown): DialogSettings {
  const obj = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  return {
    showKeyName: typeof obj.showKeyName === 'boolean' ? obj.showKeyName : false
  }
}

function readPromptSettings(raw: unknown): PromptSettings {
  const obj = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  return {
    enabled: typeof obj.enabled === 'boolean' ? obj.enabled : true,
    budgetIndicator: typeof obj.budgetIndicator === 'boolean' ? obj.budgetIndicator : true,
    todaySpend: typeof obj.todaySpend === 'boolean' ? obj.todaySpend : true,
    dailyAvg: typeof obj.dailyAvg === 'boolean' ? obj.dailyAvg : false,
    avg7d: typeof obj['7dAvg'] === 'boolean' ? obj['7dAvg'] : false,
    avg30d: typeof obj['30dAvg'] === 'boolean' ? obj['30dAvg'] : false,
    showTokens: typeof obj.showTokens === 'boolean' ? obj.showTokens : true,
    showKeyName: typeof obj.showKeyName === 'boolean' ? obj.showKeyName : false,
    showSessionInfo: typeof obj.showSessionInfo === 'boolean' ? obj.showSessionInfo : true,
    monthlyProjection: typeof obj.monthlyProjection === 'boolean' ? obj.monthlyProjection : true,
    order: parseOrder(obj.order)
  }
}
