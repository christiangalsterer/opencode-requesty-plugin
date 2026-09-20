import { describe, test } from 'bun:test'
import assert from 'node:assert/strict'
import { descendantSessionIDs, MAX_DESCENDANTS, rootSessionID } from '../src/descendants'

/** Build a fetchChildren stub from a parent → children adjacency map. */
function childrenOf(tree: Record<string, string[]>): (id: string) => Promise<string[]> {
  return (id) => Promise.resolve(tree[id] ?? [])
}

describe('descendantSessionIDs', () => {
  test('returns an empty list when the root has no children', async () => {
    const found = await descendantSessionIDs('root', childrenOf({}))
    assert.deepEqual(found, [])
  })

  test('walks a multi-level tree breadth-first', async () => {
    const found = await descendantSessionIDs(
      'root',
      childrenOf({
        root: ['a', 'b'],
        a: ['a1'],
        b: ['b1'],
        a1: ['a1x']
      })
    )
    assert.deepEqual(found, ['a', 'b', 'a1', 'b1', 'a1x'])
  })

  test('never returns the root and de-duplicates a shared child', async () => {
    const found = await descendantSessionIDs(
      'root',
      childrenOf({
        root: ['a', 'b'],
        a: ['shared'],
        b: ['shared']
      })
    )
    assert.deepEqual(found, ['a', 'b', 'shared'])
    assert.ok(!found.includes('root'))
  })

  test('stops at MAX_DESCENDANTS for a pathological tree', async () => {
    const wide = Array.from({ length: MAX_DESCENDANTS + 50 }, (_, i) => `child-${i}`)
    const found = await descendantSessionIDs('root', childrenOf({ root: wide }))
    assert.equal(found.length, MAX_DESCENDANTS)
    assert.equal(found[0], 'child-0')
    assert.equal(found[MAX_DESCENDANTS - 1], `child-${MAX_DESCENDANTS - 1}`)
  })

  test('a rejecting fetchChildren resolves the children found so far without throwing', async () => {
    const found = await descendantSessionIDs('root', (id) => {
      if (id === 'root') return Promise.resolve(['a', 'b'])
      return Promise.reject(new Error('nope'))
    })
    assert.deepEqual(found, ['a', 'b'])
  })

  test('a rejecting fetchChildren on the root resolves an empty list', async () => {
    const found = await descendantSessionIDs('root', () => Promise.reject(new Error('nope')))
    assert.deepEqual(found, [])
  })
})

describe('rootSessionID', () => {
  /** Build a getParent stub from a child → parent map. */
  function parentOf(tree: Record<string, string>): (id: string) => string | undefined {
    return (id) => tree[id]
  }

  test('returns the input when the session has no parent', () => {
    assert.equal(rootSessionID('root', parentOf({})), 'root')
  })

  test('walks a single level up to the root', () => {
    assert.equal(rootSessionID('child', parentOf({ child: 'root' })), 'root')
  })

  test('walks multiple levels up to the root', () => {
    assert.equal(rootSessionID('grandchild', parentOf({ grandchild: 'child', child: 'root' })), 'root')
  })

  test('stops on a cyclic parent chain without hanging', () => {
    assert.equal(rootSessionID('a', parentOf({ a: 'a' })), 'a')
    assert.equal(rootSessionID('a', parentOf({ a: 'b', b: 'a' })), 'b')
  })

  test('stops when a parent id is unknown', () => {
    assert.equal(rootSessionID('child', parentOf({ child: 'missing' })), 'missing')
  })
})
