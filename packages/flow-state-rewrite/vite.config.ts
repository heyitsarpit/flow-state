import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    clean: true,
    deps: { neverBundle: ["effect"] },
    dts: { generator: "tsgo" },
    entry: ["src/index.ts", "src/react-entry.ts", "src/testing.ts", "src/inspect.ts"],
    fixedExtension: true,
    format: "esm",
    outDir: "dist",
    report: false,
    sourcemap: false,
    tsconfig: "tsconfig.pack.json",
  },
});
