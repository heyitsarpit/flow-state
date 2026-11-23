// Deliberately wrong. Excluded from the app (app/app.ts lists no machine from here) and
// from every Story glob (flow.config.ts), so it never runs; `flow check` reads it as data and must report the line
// below, which findings.test.ts asserts.
// flow check: warning DehydrateCommitInFlight  Findings/WrongSsr (ssr-server): a commit of `save` is in flight at dehydration in OPEN; no client lane exists after hydration (2.10.11)
import { Story } from "flow-state/testing";
import { DeskSetup } from "../../app/setup.js";
import { DeskClient } from "../../testing/desk.fake.js";
import { Editor } from "../../features/Tickets/editor/editor.definition.js";
import { Editor42, T42 } from "../../features/Tickets/editor/editor.story.js";

// WRONG (a Story, read as data): the server render saves, and dehydrates while the save is on the wire. A server
// render should only read.
// A hydration source may not set `world` (MD 2.10.11): the Story that hydrates this one holds the save.
export const wrongSsr = Story.app(DeskSetup, {
  id: "findings/wrong-ssr",
  fixtures: [DeskClient],
})
  .ensure(Editor42, { input: T42 })
  .send(Editor42, Editor.E.TitleChanged({ title: "From the server" }), Editor.E.SaveRequested())
  .dehydrate("page", { within: "1 second" });

export const expected = {
  code: "DehydrateCommitInFlight",
  level: "warning",
  at: "Findings/WrongSsr (ssr-server)",
} as const;
