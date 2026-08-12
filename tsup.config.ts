import { defineConfig } from "tsup"
// @ts-expect-error — no types for @babel/core
import { transformAsync } from "@babel/core"
// @ts-expect-error — no types
import solidPreset from "babel-preset-solid"
// @ts-expect-error — no types
import typescriptPreset from "@babel/preset-typescript"
import { readFileSync } from "node:fs"

const solidBabelPlugin = {
  name: "solid-babel",
  setup(build: any) {
    build.onLoad({ filter: /\.tsx$/ }, async (args: any) => {
      const code = readFileSync(args.path, "utf8")
      const result = await transformAsync(code, {
        filename: args.path,
        configFile: false,
        babelrc: false,
        presets: [
          [solidPreset, { moduleName: "@opentui/solid", generate: "universal" }],
          [typescriptPreset],
        ],
      })
      return { contents: result?.code ?? code, loader: "js" }
    })
  },
}

export default defineConfig({
  entry: { tui: "src/index.tsx" },
  format: ["esm"],
  target: "es2022",
  dts: false,
  sourcemap: true,
  clean: true,
  external: ["@opencode-ai/plugin", "@opentui/solid", "@opentui/core", "solid-js"],
  esbuildOptions(options: any) {
    options.jsx = "preserve"
  },
  esbuildPlugins: [solidBabelPlugin],
})
