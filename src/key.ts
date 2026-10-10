/**
 * Requesty API key detection.
 *
 * Prefers REQUESTY_API_KEY, then reads configured provider keys and declared
 * environment variables for the built-in Requesty provider or custom
 * providers whose baseURL points at a Requesty router. `{env:VAR}` values are
 * interpolated from the plugin process environment.
 *
 * Intentionally does NOT read ~/.local/share/opencode/auth.json.
 */

export type KeyResult = { ok: true; apiKey: string } | { ok: false; reason: string }

const ENV_INTERPOLATION = /^\{env:([^}]+)\}$/
const REQUESTY_HOST = /(^|\.)requesty\.ai$/i

interface ProviderConfig {
  env?: unknown
  options?: {
    apiKey?: unknown
    baseURL?: unknown
    env?: unknown
  }
  settings?: {
    apiKey?: unknown
    baseURL?: unknown
    env?: unknown
  }
}

interface SdkConfigLike {
  provider?: Record<string, ProviderConfig>
  providers?: Record<string, ProviderConfig>
}

function resolveValue(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || raw.trim().length === 0) return undefined
  const match = ENV_INTERPOLATION.exec(raw.trim())
  if (match) {
    const value = process.env[match[1]]
    return value && value.trim().length > 0 ? value.trim() : undefined
  }
  return raw.trim()
}

function isRequestyProvider(name: string, provider: ProviderConfig): boolean {
  if (name === 'requesty') return true
  const baseURL = provider.options?.baseURL ?? provider.settings?.baseURL
  if (typeof baseURL !== 'string') return false
  try {
    return REQUESTY_HOST.test(new URL(baseURL).hostname)
  } catch {
    return false
  }
}

function environmentKey(provider: ProviderConfig): string | undefined {
  const configured = provider.env ?? provider.options?.env ?? provider.settings?.env
  if (!Array.isArray(configured)) return undefined
  for (const name of configured) {
    if (typeof name !== 'string') continue
    const value = resolveValue(`{env:${name}}`)
    if (value) return value
  }
  return undefined
}

function requestyProviders(config: SdkConfigLike | undefined): ProviderConfig[] {
  const providers = { ...config?.provider, ...config?.providers }
  // Preserve stable ordering, preferring the canonical provider when keys tie.
  const names = Object.keys(providers).sort((a, b) => (a === 'requesty' ? -1 : b === 'requesty' ? 1 : a.localeCompare(b)))
  const matches: ProviderConfig[] = []
  for (const name of names) {
    const provider = providers[name]
    if (isRequestyProvider(name, provider)) {
      matches.push(provider)
    }
  }
  return matches
}

export function detectApiKey(config: SdkConfigLike | undefined): KeyResult {
  const providers = requestyProviders(config)
  const configuredKey = providers.map((provider) => resolveValue(provider.options?.apiKey ?? provider.settings?.apiKey)).find(Boolean)
  const providerEnvironmentKey = providers.map(environmentKey).find(Boolean)
  const apiKey = configuredKey ?? providerEnvironmentKey ?? resolveValue('{env:REQUESTY_API_KEY}')
  if (apiKey) return { ok: true, apiKey }

  return {
    ok: false,
    reason: `No Requesty API key found. Add provider.requesty.options.apiKey to opencode.json.`
  }
}
