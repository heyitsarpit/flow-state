import { Fake, samplesOf, Story } from "../../../src/host/testing/index.ts";
import { draftSetup, library } from "../app.ts";
import { Library } from "../machines/library.ts";
import { Docs } from "../server/docs.ts";
import { DocsFake } from "../server/layer.ts";

/**
 * The draft app over its port fake, with the library ensured.
 */
export const draftStory = (id: string) =>
  Story.app(draftSetup, { id, fixtures: [DocsFake] }).ensure(library);

const showPlan = Library.E.Show({ id: "doc-1" });

/**
 * The plan is shown, so its read is saved on the device; the page reloads and the plan is shown
 * again at once, which reads it again, the saved copy being stale.
 */
export const savedEntry = draftStory("draft/saved-entry")
  .send(library, showPlan)
  .checkpoint("loaded")
  .reload()
  .checkpoint("reloaded")
  .send(library, showPlan)
  .checkpoint("asked");

/**
 * The plan is shown and kept shown past a day; a reload finds its saved copy older than `gcTime`
 * and drops it.
 */
export const savedEntryExpired = draftStory("draft/saved-entry-expired")
  .send(library, showPlan)
  .checkpoint("loaded")
  .advance("25 hours")
  .reload({ reattach: false })
  .checkpoint("reloaded");

/**
 * The plan's outline is read with it: saved on the device but kept no time, so a reload never
 * shows it.
 */
export const outlineKeptNoTime = draftStory("draft/outline-kept-no-time")
  .send(library, showPlan)
  .checkpoint("loaded")
  .reload({ reattach: false })
  .checkpoint("reloaded");

const showOther = Library.E.Show({ id: "doc-9" });

const edited = Docs.edit({ id: "doc-1", body: "# Goals\nsecond draft" });

/**
 * The stress run the draft samples print from seed 36: shows of two documents over held, dropped
 * and lost reads whose cleanups die, a forgotten library, reloads that land held writes or refuse
 * the store's load, and an offline spell.
 */
export const seededStress = Story.app(draftSetup, { id: "draft/stress-36", fixtures: [DocsFake] })
  .world(Docs.outline.hold(), Docs.outline.cleanup("dies"))
  .ensure(library)
  .world(Fake.storage.hold())
  .send(library, showPlan)
  .world(Docs.outline.hold())
  .send(library, showPlan)
  .send(library, showPlan)
  .world(edited)
  .send(library, showPlan)
  .send(library, showOther)
  .world(Docs.document.hold())
  .world(Docs.outline.release())
  .send(library, showPlan)
  .send(library, showPlan)
  .send(library, showOther)
  .reload({ reattach: false })
  .send(library, showOther)
  .world(Docs.document.hold())
  .send(library, showPlan)
  .world(Docs.document.hold())
  .send(library, showOther)
  .world(Docs.outline.hold(), Docs.outline.cleanup("fails"))
  .send(library, showOther)
  .world(Docs.outline.drop({ at: "response" }))
  .send(library, showOther)
  .world(Fake.storage.hold())
  .send(library, showOther)
  .send(library, showPlan)
  .send(library, showPlan)
  .world(Docs.outline.hold(), Docs.outline.cleanup("dies"))
  .send(library, showOther)
  .send(library, showPlan)
  .world(Fake.network.offline())
  .send(library, showOther)
  .dispose(library, { how: "forget" })
  .world(edited)
  .send(library, showPlan)
  .send(library, showOther)
  .advance("20 millis")
  .disposeRuntime()
  .reload({ heldWrites: "land" })
  .advance("7 millis")
  .send(library, showOther)
  .world(Fake.storage.refuse())
  .advance("20 millis")
  .send(library, showOther)
  .advance("3 millis")
  .send(library, showOther)
  .send(library, showPlan)
  .advance("16 millis")
  .send(library, showPlan)
  .send(library, showOther)
  .world(Fake.storage.hold())
  .send(library, showPlan)
  .send(library, showPlan)
  .send(library, showOther)
  .send(library, showPlan)
  .send(library, showPlan)
  .send(library, showOther)
  .send(library, showPlan)
  .advance("5 millis")
  .send(library, showOther)
  .advance("2 millis")
  .send(library, showOther)
  .advance("17 millis")
  .send(library, showPlan)
  .send(library, showPlan)
  .send(library, showPlan)
  .advance("18 millis")
  .send(library, showOther)
  .send(library, showOther)
  .send(library, showOther)
  .send(library, showOther)
  .send(library, showOther)
  .send(library, showPlan)
  .world(Fake.storage.refuseLoad())
  .reload({ reattach: false })
  .advance("4 millis")
  .send(library, showPlan)
  .advance("10 millis")
  .send(library, showPlan)
  .send(library, showPlan)
  .send(library, showOther)
  .send(library, showOther)
  .send(library, showPlan)
  .send(library, showOther)
  .send(library, showOther)
  .send(library, showPlan)
  .send(library, showPlan)
  .send(library, showOther)
  .send(library, showPlan)
  .send(library, showOther)
  .advance("8 millis")
  .world(Docs.outline.lose())
  .advance("12 millis")
  .send(library, showPlan)
  .send(library, showOther)
  .send(library, showPlan)
  .send(library, showPlan)
  .advance("15 millis")
  .send(library, showPlan)
  .send(library, showOther)
  .send(library, showPlan)
  .advance("7 millis")
  .world(Docs.outline.lose())
  .advance("1 millis")
  .send(library, showOther)
  .send(library, showOther)
  .advance("7 millis")
  .send(library, showOther)
  .send(library, showPlan)
  .send(library, showPlan)
  .advance("15 millis")
  .send(library, showOther)
  .advance("15 millis")
  .send(library, showOther)
  .advance("56438 millis")
  .world(Fake.network.online())
  .advance("2 minutes")
  .world(Docs.document.release())
  .world(Docs.document.release())
  .world(Docs.document.release())
  .world(Docs.outline.release())
  .advance("2 minutes")
  .advance("2 minutes");

/**
 * Every library Story, by name.
 */
export const stories = { savedEntry, savedEntryExpired, outlineKeptNoTime, seededStress };

/**
 * What the author and the documents service can do around the library, for generated runs: show
 * the plan or a document nobody wrote; a collaborator edits the plan.
 */
export const samples = samplesOf({
  id: "draft",
  story: Story.app(draftSetup, { id: "draft/samples", fixtures: [DocsFake] }),
  names: { setup: "draftSetup", fixtures: ["DocsFake"] },
  actors: { library },
  servers: { Docs },
  failures: [],
  landedFailures: [],
  values: {},
  controls: [edited],
  steps: (story) => story.send(library, showPlan).send(library, showOther),
});
