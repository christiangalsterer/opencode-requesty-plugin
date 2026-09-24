import { describe, test } from 'bun:test'
import assert from 'node:assert/strict'
import solidPlugin from '@opentui/solid/bun-plugin'

async function buildTui(): Promise<string> {
  // `write: false` is supported at runtime but missing from the installed bun-types.
  const config = {
    entrypoints: [`${import.meta.dir}/../src/tui.tsx`],
    target: 'bun',
    format: 'esm',
    splitting: true,
    sourcemap: 'external',
    packages: 'external',
    write: false,
    plugins: [solidPlugin]
  } as Bun.BuildConfig & { write: boolean }
  const result = await Bun.build(config)
  assert.ok(result.success, `build failed: ${result.logs.join('\n')}`)
  const entry = result.outputs.find((output) => output.path.endsWith('tui.js'))
  assert.ok(entry, 'tui.js output not found')
  return entry.text()
}

describe('build output', () => {
  test('pre-compiles TSX with the reactive OpenTUI Solid transform', async () => {
    const output = await buildTui()
    // Component props must be lazy accessors, not eagerly evaluated children.
    assert.ok(output.includes('get when()'))
    assert.ok(output.includes('get children()'))
    // Runtime imports must come from the host-provided modules, not the JSX runtime.
    assert.ok(output.includes('from "@opentui/solid"'))
    assert.ok(!output.includes('@opentui/solid/jsx-runtime'))
  })

  test('does not eagerly evaluate Show children (the props.tokens regression)', async () => {
    const output = await buildTui()
    // The lazy (Babel) transform wraps the deref in a memo inside a `get children()`
    // accessor; the eager (Bun native) transform inlines it into a plain array
    // literal with no memo wrapper.
    assert.ok(output.includes('_$memo(() => formatTokenInline(props.tokens.input'))
  })
})
