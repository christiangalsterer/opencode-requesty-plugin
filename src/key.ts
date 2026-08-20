/**
 * Requesty API key detection.
 *
 * Reads `provider.*.options.apiKey` from the merged opencode config for any
 * provider whose baseURL points at a Requesty router (the built-in
 * `requesty` provider, or custom entries like `requesty-export`),
 * with `{env:VAR}` interpolation resolved.
 *
 * Intentionally does NOT read ~/.local/share/opencode/auth.json.
 */

export type KeyResult = { ok: true; apiKey: string; source: string } | { ok: false; reason: string }

const ENV_INTERPOLATION = /^\{env:([^}]+)\}$/
const REQUESTY_HOST = /(^|\.)requesty\.ai$/i

type ProviderConfig = {
  options?: {
    apiKey?: unknown
    baseURL?: unknown
  }
}

type SdkConfigLike = {
  provider?: Record<string, ProviderConfig>
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

function isRequestyProvider(provider: ProviderConfig, name: string): boolean {
  if (name === 'requesty') return true
  const baseURL = provider.options?.baseURL
  if (typeof baseURL !== 'string') return false
  try {
    return REQUESTY_HOST.test(new URL(baseURL).hostname)
  } catch {
    return false
  }
}

function fromConfig(config: SdkConfigLike | undefined): { apiKey: string; providerName: string } | undefined {
  const providers = config?.provider
  if (!providers) return undefined
  // Prefer the canonical provider id, then any custom Requesty provider.
  const names = Object.keys(providers).sort((a, b) => (a === 'requesty' ? -1 : b === 'requesty' ? 1 : a.localeCompare(b)))
  for (const name of names) {
    const provider = providers[name]
    if (!isRequestyProvider(provider, name)) continue
    const apiKey = resolveValue(provider.options?.apiKey)
    if (apiKey) return { apiKey, providerName: name }
  }
  return undefined
}

export function detectApiKey(config: SdkConfigLike | undefined): KeyResult {
  const fromOpencodeConfig = fromConfig(config)
  if (fromOpencodeConfig) {
    return { ok: true, apiKey: fromOpencodeConfig.apiKey, source: `opencode provider config (${fromOpencodeConfig.providerName})` }
  }

  return {
    ok: false,
    reason: `No Requesty API key found. Add provider.requesty.options.apiKey to opencode.json.`
  }
}
