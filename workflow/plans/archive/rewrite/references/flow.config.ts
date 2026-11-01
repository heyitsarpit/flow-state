// Project configuration found by the CLI at the project root (D37). Replaces the old behaviour
// gateway: every exported Story under the glob is discovered; each declares its own stable id.
import { defineConfig } from "flow-state/testing";
import { DeskApp } from "./app/app.js";

export default defineConfig({
  apps: [{ app: DeskApp, stories: "features/**/*.story.ts" }],
});

// A project with several apps lists each with its own glob; CLI commands then take --app <id>.
// Story ids are namespaced by app id: dispatch-desk/ticket-save.
