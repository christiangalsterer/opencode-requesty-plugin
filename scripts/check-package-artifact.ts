import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temporary = await mkdtemp(path.join(os.tmpdir(), 'requesty-plugin-package-'))

try {
  const packed = Bun.spawnSync([process.execPath, 'pm', 'pack', '--ignore-scripts', '--destination', temporary, '--quiet'], { cwd: root })
  if (packed.exitCode !== 0) {
    throw new Error(packed.stderr.toString() || 'bun pm pack failed')
  }

  const archives = (await readdir(temporary)).filter((name) => name.endsWith('.tgz'))
  if (archives.length !== 1) {
    throw new Error(`Expected one package tarball, found ${archives.length}`)
  }
  const archive = archives[0]
  if (!archive) {
    throw new Error('Packed tarball name was empty')
  }

  const unpacked = Bun.spawnSync(['tar', '-xzf', path.join(temporary, archive), '-C', temporary])
  if (unpacked.exitCode !== 0) {
    throw new Error(unpacked.stderr.toString() || 'tar extraction failed')
  }

  const packageRoot = path.join(temporary, 'package')
  const manifest = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8')) as {
    exports?: { './tui'?: { import?: string } }
  }
  const entry = manifest.exports?.['./tui']?.import
  if (!entry) {
    throw new Error('Package is missing exports["./tui"].import')
  }

  const entryPath = path.join(packageRoot, entry)
  const entrySource = await readFile(entryPath, 'utf8')
  if (!entrySource.includes('async tui(') || !entrySource.includes('async setup(')) {
    throw new Error('Packed TUI entrypoint is missing a v1 tui or v2 setup adapter')
  }

  const chunks = [...entrySource.matchAll(/import\("([^"]+\.js)"\)/g)].map((match) => match[1]).filter(Boolean)
  if (chunks.length !== 2) {
    throw new Error(`Expected two lazy adapter chunks, found ${chunks.length}`)
  }
  await Promise.all(chunks.map((chunk) => readFile(path.resolve(path.dirname(entryPath), chunk))))

  const plugin = await import(`${pathToFileURL(entryPath).href}?package-check=${Date.now()}`)
  if (plugin.default?.id !== 'opencode-requesty-plugin') {
    throw new Error('Packed plugin has an unexpected id')
  }
  if (typeof plugin.default?.tui !== 'function' || typeof plugin.default?.setup !== 'function') {
    throw new Error('Packed plugin must expose both the v1 tui and v2 setup adapters')
  }
} finally {
  await rm(temporary, { recursive: true, force: true })
}
