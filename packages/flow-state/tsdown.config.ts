import { defineConfig } from "vite-plus/pack";

export default defineConfig({
  clean: true,
  dts: true,
  entry: ["src/index.ts", "src/server.ts"],
  format: ["esm"],
  sourcemap: true,
});
