import { describe, test } from 'bun:test'
import assert from 'node:assert/strict'
import type { TuiRouteCurrent } from '@opencode-ai/plugin/tui'
import { sessionIDFromRoute } from '../src/route'

describe('sessionIDFromRoute', () => {
  test('returns undefined for the home route', () => {
    assert.equal(sessionIDFromRoute({ name: 'home' } as TuiRouteCurrent), undefined)
  })

  test('returns the session id for the session route', () => {
    assert.equal(sessionIDFromRoute({ name: 'session', params: { sessionID: 'ses_x' } } as TuiRouteCurrent), 'ses_x')
  })

  test('returns undefined for an empty session id', () => {
    assert.equal(sessionIDFromRoute({ name: 'session', params: { sessionID: '' } } as TuiRouteCurrent), undefined)
  })

  test('returns undefined for an unknown route without params', () => {
    assert.equal(sessionIDFromRoute({ name: 'demo' } as TuiRouteCurrent), undefined)
  })

  test('ignores a sessionID param on a non-session route', () => {
    assert.equal(sessionIDFromRoute({ name: 'demo', params: { sessionID: 'ses_x' } } as TuiRouteCurrent), undefined)
  })
})
