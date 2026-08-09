/**
 * Requesty API key detection.
 *
 * Detection order (first match wins):
 *   1. Plugin options `apiKey` (from the plugin tuple in opencode.json)
 *   2. `REQUESTY_API_KEY` environment variable
 *   3. `provider.*.options.apiKey` from the merged opencode config for any
 *      provider whose baseURL points at a Requesty router (the built-in
 *      `requesty` provider, or custom entries like `requesty-export`),
 *      with `{env:VAR_NAME}` interpolation resolved
 *
 * Intentionally does NOT read ~/.local/share/opencode/auth.json.
 */

export type KeyResult =
  | { ok: true; apiKey: string; source: string }
  | { ok: false; reason: string }

const ENV_VAR = "REQUESTY_API_KEY"
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
  if (typeof raw !== "string" || raw.length === 0) return undefined
  const match = ENV_INTERPOLATION.exec(raw.trim())
  if (match) {
    const value = process.env[match[1]]
    return value && value.length > 0 ? value : undefined
  }
  return raw
}

function isRequestyProvider(provider: ProviderConfig, name: string): boolean {
  if (name === "requesty") return true
  const baseURL = provider.options?.baseURL
  if (typeof baseURL !== "string") return false
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
  const names = Object.keys(providers).sort((a, b) => (a === "requesty" ? -1 : b === "requesty" ? 1 : a.localeCompare(b)))
  for (const name of names) {
    const provider = providers[name]
    if (!isRequestyProvider(provider, name)) continue
    const apiKey = resolveValue(provider.options?.apiKey)
    if (apiKey) return { apiKey, providerName: name }
  }
  return undefined
}

export function detectApiKey(options: Record<string, unknown> | undefined, config: SdkConfigLike | undefined): KeyResult {
  const fromOptions = resolveValue(options?.apiKey)
  if (fromOptions) {
    return { ok: true, apiKey: fromOptions, source: "plugin options" }
  }

  const fromEnv = process.env[ENV_VAR]
  if (fromEnv && fromEnv.length > 0) {
    return { ok: true, apiKey: fromEnv, source: `${ENV_VAR} env var` }
  }

  const fromOpencodeConfig = fromConfig(config)
  if (fromOpencodeConfig) {
    return { ok: true, apiKey: fromOpencodeConfig.apiKey, source: `opencode provider config (${fromOpencodeConfig.providerName})` }
  }

  return {
    ok: false,
    reason: `No Requesty API key found. Set ${ENV_VAR}, add provider.requesty.options.apiKey to opencode.json, or pass apiKey via plugin options.`,
  }
}
