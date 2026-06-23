import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*.{js,jsx,ts,tsx,json,jsonc,md,css,html,yaml,yml}": "vp check --fix",
  },
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  fmt: {
    ignorePatterns: [],
  },
  test: {
    include: ["packages/**/*.test.ts", "examples/**/*.test.ts", "examples/**/*.test.tsx"],
  },
});
