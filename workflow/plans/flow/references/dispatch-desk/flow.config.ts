// Found by the CLI at the project root (CommandLine.plan O6). Every exported Story under the glob is
// discovered; each declares its own id, namespaced by the app: dispatch-desk/ticket-save.
import { defineConfig } from "flow-state/testing";
import { DeskApp } from "./app/app.js";

export default defineConfig({
  apps: [{ app: DeskApp, stories: "features/**/*.story.ts" }],
});
