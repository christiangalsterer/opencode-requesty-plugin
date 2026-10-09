import { describe, test } from 'bun:test'
import assert from 'node:assert/strict'
import solidPlugin from '@opentui/solid/bun-plugin'

interface BuildOutput {
  path: string
  text: string
}

interface TuiBuild {
  entry: string
  outputs: BuildOutput[]
}

async function buildTui(): Promise<TuiBuild> {
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
  const outputs = await Promise.all(
    result.outputs.filter((output) => output.kind !== 'sourcemap').map(async (output) => ({ path: output.path, text: await output.text() }))
  )
  const compiledEntry = outputs.find((output) => output.path.endsWith('tui.js'))
  assert.ok(compiledEntry, 'compiled tui.js output not found')
  return { entry: compiledEntry.text, outputs }
}

describe('build output', () => {
  test('pre-compiles TSX with the reactive OpenTUI Solid transform', async () => {
    const build = await buildTui()
    const components = build.outputs.find((output) => output.text.includes('function RequestySidebarWidget'))
    assert.ok(components, 'shared widget component chunk not found')
    // Component props must be lazy accessors, not eagerly evaluated children.
    assert.ok(components.text.includes('get when()'))
    assert.ok(components.text.includes('get children()'))
    // Runtime imports must come from the host-provided modules, not the JSX runtime.
    assert.ok(components.text.includes('from "@opentui/solid"'))
    assert.ok(!components.text.includes('@opentui/solid/jsx-runtime'))
  })

  test('does not eagerly evaluate Show children (the props.tokens regression)', async () => {
    const build = await buildTui()
    const components = build.outputs.find((output) => output.text.includes('function RequestySidebarWidget'))
    assert.ok(components, 'shared widget component chunk not found')
    // The lazy (Babel) transform wraps the deref in a memo inside a `get children()`
    // accessor; the eager (Bun native) transform inlines it into a plain array
    // literal with no memo wrapper.
    assert.ok(components.text.includes('_$memo(() => formatTokenInline(props.tokens.input'))
  })

  test('emits both lazy host adapters and includes their referenced chunks', async () => {
    const build = await buildTui()
    const adapterPaths = [...build.entry.matchAll(/import\("(\.\/[^"]+\.js)"\)/g)].map((match) => match[1])

    assert.match(build.entry, /async tui\(/)
    assert.match(build.entry, /async setup\(/)
    assert.equal(adapterPaths.length, 2, 'dispatcher should lazy-load one adapter per OpenCode major')
    const adapters = adapterPaths.map((path) => build.outputs.find((output) => output.path.endsWith(path.slice(2)))?.text)
    assert.ok(adapters.every(Boolean), 'every lazy adapter import must resolve to a built chunk')
    const v1Adapter = adapters.find((text) => text?.includes('function runV1'))
    const v2Adapter = adapters.find((text) => text?.includes('function runV2'))
    assert.ok(v1Adapter, 'v1 lazy chunk should contain its adapter')
    assert.ok(v2Adapter, 'v2 lazy chunk should contain its adapter')
    assert.ok(!v1Adapter.includes('function runV2'), 'v1 lazy chunk should not bundle v2 adapter code')
    assert.ok(!v2Adapter.includes('function runV1'), 'v2 lazy chunk should not bundle v1 adapter code')
    assert.match(build.entry, /id: "opencode-requesty-plugin"/)
    assert.ok(!/\bserver\s*[:(]/.test(build.entry), 'the TUI module must not also expose a server target')
    assert.ok(
      build.outputs.every((output) => !/\.tsx?(?:[?#]|$)/.test(output.text)),
      'built outputs must not import raw TS/TSX'
    )
  })
})
