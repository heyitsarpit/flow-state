// Found by the CLI at the project root. Every Story here belongs to the Checkout app; the challenge and the
// address step alone run in the stand-in host and print `appId: null`.
import { defineConfig } from "flow-state/testing";
import { CheckoutApp } from "./app/app.js";

export default defineConfig({
  apps: [{ app: CheckoutApp, stories: ["features/**/*.story.ts", "app/*.story.ts"] }],
});
