import { describe, expect, test } from 'bun:test'
import { normalizeV2ConfigDocuments } from '../src/v2-config'

describe('normalizeV2ConfigDocuments', () => {
  test('merges v1 provider options across documents in precedence order', () => {
    const config = normalizeV2ConfigDocuments([
      { type: 'document', info: { provider: { requesty: { options: { baseURL: 'https://api.requesty.ai' } } } } },
      { type: 'document', info: { provider: { requesty: { options: { apiKey: 'sk-later-document' } } } } }
    ])

    expect(config.provider.requesty?.options).toEqual({
      baseURL: 'https://api.requesty.ai',
      apiKey: 'sk-later-document'
    })
  })

  test('merges v2 provider settings and retains declared environment variables', () => {
    const config = normalizeV2ConfigDocuments([
      {
        type: 'document',
        info: {
          providers: {
            requesty: { env: ['REQUESTY_API_KEY'], settings: { baseURL: 'https://api-v2.requesty.ai/v1' } }
          }
        }
      },
      {
        type: 'document',
        info: {
          providers: {
            requesty: { settings: { apiKey: '{env:REQUESTY_API_KEY}' } }
          }
        }
      }
    ])

    expect(config.providers.requesty).toMatchObject({
      env: ['REQUESTY_API_KEY'],
      options: { baseURL: 'https://api-v2.requesty.ai/v1', apiKey: '{env:REQUESTY_API_KEY}' },
      settings: { baseURL: 'https://api-v2.requesty.ai/v1', apiKey: '{env:REQUESTY_API_KEY}' }
    })
  })

  test('keeps legacy and v2 provider maps distinct when both are present', () => {
    const config = normalizeV2ConfigDocuments([
      {
        type: 'document',
        info: {
          provider: { requesty: { options: { apiKey: 'sk-v1', baseURL: 'https://api.requesty.ai' } } },
          providers: { requesty: { settings: { apiKey: 'sk-v2' } } }
        }
      }
    ])

    expect(config.provider.requesty?.options?.apiKey).toBe('sk-v1')
    expect(config.providers.requesty?.options?.apiKey).toBe('sk-v2')
  })
})
