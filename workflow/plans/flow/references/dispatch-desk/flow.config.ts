// Found by the CLI at the project root. Every exported Story under a glob is discovered; each declares its
// own id (2.10.1). Machine Stories and the app Stories (`desk/*`) belong to the app and are listed under it.
// Fragment Stories (Comments, Attachments) have no app: they run in the stand-in host, so they are
// top-level and print with `appId: null` (2.10.14).
import { defineConfig } from "flow-state/testing";
import { DeskApp } from "./app/app.js";

export default defineConfig({
  apps: [
    {
      app: DeskApp,
      stories: [
        "features/Tickets/**/*.story.ts",
        "features/Roster/*.story.ts",
        "features/Find/*.story.ts",
        "features/Resolve/*.story.ts", // the wizard alone has no app; its Story prints `appId: null` as the others do
        "features/Presence/*.story.ts", // pending merge 6
        "features/Assistant/*.story.ts", // pending merge 6
      ],
    },
  ],
  stories: ["features/Comments/*.story.ts", "features/Attachments/*.story.ts"],
});
