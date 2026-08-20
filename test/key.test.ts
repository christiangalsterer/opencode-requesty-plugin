import { describe, test, beforeEach, afterEach } from 'bun:test'
import assert from 'node:assert/strict'
import { detectApiKey } from '../src/key'

describe('detectApiKey', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    delete process.env.REQUESTY_TEST_KEY
    delete process.env.REQUESTY_EMPTY_KEY
    delete process.env.REQUESTY_WHITESPACE_KEY
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  test('returns error when no providers are configured', () => {
    const result = detectApiKey({})
    assert.equal(result.ok, false)
    assert.ok((result as { reason: string }).reason.includes('No Requesty API key found'))
  })

  test('detects canonical provider.requesty.options.apiKey', () => {
    const result = detectApiKey({
      provider: { requesty: { options: { apiKey: 'sk-test' } } }
    })
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.apiKey, 'sk-test')
    assert.ok(result.source.includes('requesty'))
  })

  test('detects custom provider with Requesty baseURL', () => {
    const result = detectApiKey({
      provider: {
        'requesty-export': {
          options: {
            baseURL: 'https://api-v2.requesty.ai/v1',
            apiKey: 'sk-custom'
          }
        }
      }
    })
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.apiKey, 'sk-custom')
    assert.ok(result.source.includes('requesty-export'))
  })

  test('isRequestyProvider handles malformed baseURL (catch block)', () => {
    const result = detectApiKey({
      provider: {
        bad: {
          options: {
            baseURL: 'not a valid url',
            apiKey: 'sk-bad'
          }
        }
      }
    })
    assert.equal(result.ok, false)
  })

  test('trims whitespace from a plain API key', () => {
    const result = detectApiKey({
      provider: { requesty: { options: { apiKey: '  sk-padded  ' } } }
    })
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.apiKey, 'sk-padded')
  })

  test('resolves {env:VAR} and trims whitespace', () => {
    process.env.REQUESTY_TEST_KEY = '  sk-from-env\n'
    const result = detectApiKey({
      provider: { requesty: { options: { apiKey: '{env:REQUESTY_TEST_KEY}' } } }
    })
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.apiKey, 'sk-from-env')
  })

  test('empty string API key is rejected', () => {
    const result = detectApiKey({
      provider: { requesty: { options: { apiKey: '' } } }
    })
    assert.equal(result.ok, false)
  })

  test('whitespace-only API key is rejected', () => {
    const result = detectApiKey({
      provider: { requesty: { options: { apiKey: '   ' } } }
    })
    assert.equal(result.ok, false)
  })

  test('empty env var is rejected', () => {
    process.env.REQUESTY_EMPTY_KEY = ''
    const result = detectApiKey({
      provider: { requesty: { options: { apiKey: '{env:REQUESTY_EMPTY_KEY}' } } }
    })
    assert.equal(result.ok, false)
  })

  test('whitespace-only env var is rejected', () => {
    process.env.REQUESTY_WHITESPACE_KEY = '  \n  '
    const result = detectApiKey({
      provider: { requesty: { options: { apiKey: '{env:REQUESTY_WHITESPACE_KEY}' } } }
    })
    assert.equal(result.ok, false)
  })

  test('prefers canonical requesty provider over custom Requesty providers', () => {
    const result = detectApiKey({
      provider: {
        'requesty-export': {
          options: { baseURL: 'https://api-v2.requesty.ai', apiKey: 'sk-custom' }
        },
        requesty: {
          options: { apiKey: 'sk-canonical' }
        }
      }
    })
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.apiKey, 'sk-canonical')
    assert.ok(result.source.includes('requesty'))
  })
})
