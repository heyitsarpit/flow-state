import { manifests } from "./fixtures/index.ts";
import { defineConfig } from "./src/host/testing/index.ts";

const config = defineConfig({
  apps: manifests.map((m) => ({
    app: m.app,
    stories: [`fixtures/${m.name}/stories/*.ts`],
  })),
});

export default config;
