import { defineConfig } from "tsup"

export default defineConfig({
  entry: { tui: "src/index.tsx" },
  format: ["esm"],
  target: "es2022",
  dts: false,
  sourcemap: true,
  clean: true,
  external: ["@opencode-ai/plugin", "@opentui/solid", "@opentui/core", "solid-js"],
  esbuildOptions(options) {
    options.jsx = "automatic"
    options.jsxImportSource = "@opentui/solid"
  },
})
