import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "examples/**/*.test.ts", "examples/**/*.test.tsx"],
  },
});
