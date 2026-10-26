// Binding ruling 38 supersedes the mirror/handover example in multi-tab.md §3.3.
// Tabs are independent actors. Only the first persists; opening a second cannot transfer a save.
import { story } from "flow-state/testing";
import { browserSetup } from "../../../app/persistence.js";
import { SlowSave } from "../../../testing/fixtures.js";
import { SessionRef } from "../../Session/session.ref.js";
import { ToastsRef } from "../../Toasts/toasts.ref.js";
import { Editor } from "./editor.definition.js";
import { Editor42, T42 } from "./editor.story.js";

const desk = (id: string) =>
  story
    .app(browserSetup("dispatcher-7"), { id, fixtures: [SlowSave] })
    .ensure(SessionRef, { input: { userId: "dispatcher-7" } })
    .ensure(ToastsRef)
    .ensure(Editor42, { input: T42 })
    .process();

export const secondTabIndependent = desk("ticket-second-tab-independent")
  .openTab("b")
  .ensure(SessionRef, { input: { userId: "dispatcher-7" }, tab: "b" })
  .ensure(ToastsRef, { tab: "b" })
  .ensure(Editor42, { input: T42, tab: "b" })
  .process()
  .send(Editor42, Editor.E.TitleChanged({ title: "Only in tab b" }), { tab: "b" })
  .send(Editor42, Editor.E.SaveRequested(), { tab: "b" })
  .process()
  .checkpoint("b-saving")
  .closeTab("main")
  .process()
  .checkpoint("no-handover")
  .advance("2 seconds")
  .process()
  .checkpoint("b-saved");

// Reopen the same tab after an abrupt close, sharing this run's fresh memory store. The
// acknowledged attempt write precedes adapter invocation, so restore must keep that Attempt.
export const reloaded = desk("ticket-reload")
  .send(Editor42, Editor.E.TitleChanged({ title: "Replace foyer light" }))
  .send(Editor42, Editor.E.SaveRequested())
  .process()
  .checkpoint("saving")
  .closeTab("main")
  .openTab("main")
  .ensure(ToastsRef)
  .ensure(Editor42, { input: T42 }) // adopts the lazy editor and its dormant persisted record
  .process()
  .checkpoint("restored");
