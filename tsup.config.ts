import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts"],
  splitting: false,
  sourcemap: true,
  outDir: "./dist",
  dts: false,
  clean: true,
  treeshake: true,
  noExternal: [/(.*)/], // Include built deps inside the output, @see: https://github.com/egoist/tsup/issues/619#issuecomment-1543253305
})
