import { cellsShop } from "./fixtures/cells/machine.ts";
import { paletteApp } from "./fixtures/command-palette/machine.ts";
import { numberApp } from "./fixtures/number-input/machine.ts";
import { shop } from "./fixtures/pay/machine.ts";
import { authApp } from "./fixtures/sign-in/machine.ts";
import { gitApp } from "./fixtures/sync/machine.ts";
import { bank } from "./fixtures/transfers/machine.ts";
import { defineConfig } from "./src/host/testing/index.ts";

const config = defineConfig({
  apps: [
    { app: cellsShop, stories: ["fixtures/cells/stories.ts"] },
    { app: shop, stories: ["fixtures/pay/stories.ts"] },
    { app: authApp, stories: ["fixtures/sign-in/stories.ts"] },
    { app: gitApp, stories: ["fixtures/sync/stories.ts"] },
    { app: bank, stories: ["fixtures/transfers/stories.ts"] },
    { app: paletteApp, stories: ["fixtures/command-palette/stories.ts"] },
    { app: numberApp, stories: ["fixtures/number-input/stories.ts"] },
  ],
});

export default config;
