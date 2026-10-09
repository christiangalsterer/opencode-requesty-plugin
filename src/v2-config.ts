import type { ProviderInfo } from '@opencode/client'

export interface V2ConfigDocument {
  type?: 'document' | 'directory'
  path?: string
  info?: {
    providers?: Record<string, ProviderInfo | Record<string, unknown>>
    provider?: Record<string, Record<string, unknown>>
  }
}

export interface RequestyProviderConfig {
  env?: unknown
  options?: Record<string, unknown>
  settings?: Record<string, unknown>
}

export interface RequestyConfig {
  providers: Record<string, RequestyProviderConfig>
  provider: Record<string, RequestyProviderConfig>
}

/** Merge V2 config documents in precedence order into the shared key-detector shape. */
export function normalizeV2ConfigDocuments(entries: readonly V2ConfigDocument[]): RequestyConfig {
  const config: RequestyConfig = { provider: {}, providers: {} }

  for (const entry of entries) {
    const info = entry.info
    if (!info) continue
    mergeProviders(config.provider, info.provider)
    mergeProviders(config.providers, info.providers, true)
  }

  return config
}

function mergeProviders(target: Record<string, RequestyProviderConfig>, source: Record<string, unknown> | undefined, useSettings = false): void {
  for (const [id, value] of Object.entries(source ?? {})) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const provider = value as Record<string, unknown>
    const current = target[id]
    const nextSettings = asRecord(provider.settings)
    const nextOptions = asRecord(provider.options)

    target[id] = {
      ...current,
      ...provider,
      env: provider.env ?? current?.env,
      options: {
        ...current?.options,
        ...nextOptions,
        ...(useSettings ? nextSettings : undefined)
      },
      settings: {
        ...current?.settings,
        ...nextSettings
      }
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}
