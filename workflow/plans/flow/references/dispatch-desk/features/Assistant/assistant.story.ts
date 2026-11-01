// Assistant Stories: tokens, Stop mid-stream, a truncated body, a stall, a refusal, a reload while asking.
// Each runs the machine over the model fake, paced by wire words, never by injected results. Transcripts;
// assistant.test.ts reads them. Module checkpoints ("AS"): `streaming`, `regenerated`.
// Pending merge 6: written against merge-6-streams/proposal-v2.md revision 7.1, 4.4.
import { Story } from "flow-state/testing";
import { DeskSetup } from "../../app/setup.js";
import { Assistant as Model, AssistantFake, textAfter } from "../../testing/assistant.fake.js";
import { SessionRef } from "../Session/session.ref.js";
import { Assistant } from "./assistant.definition.js";
import { AssistantMachine } from "./assistant.machine.js";
import { assistantRef } from "./assistant.ref.js";

const { E } = Assistant;

export const T42 = { workspaceId: "north", ticketId: "T-42" }; // also the lane key

const ask = (id: string) =>
  Story.make(AssistantMachine, { id, input: T42, fixtures: [AssistantFake] }).send(
    E.Ask({ prompt: "Suggest a reply" }),
  );

// Two tokens arrive and the rest is held. The text is the row's `progress`; `last` is untouched.
// design gap: M6 2.10.9 gives `hold()` only "frames stop"; `after` (let n frames through first) is this
// file's spelling for pacing a body.
const midStream = (id: string) => ask(id).world(Model.suggest.hold({ after: 2 }));

export const answered = ask("assistant/answered").checkpoint("answered");

export const streaming = midStream("assistant/streaming").checkpoint("streaming");

// Regenerate while the reply streams: the first Attempt is interrupted (its fetch aborted) and its ending is
// evidence, the second starts with empty progress, and its answer is the one shown (O8).
export const regenerated = midStream("assistant/regenerated")
  .send(E.Regenerate())
  .checkpoint("regenerating")
  .world(Model.suggest.release())
  .checkpoint("regenerated");

// Stop while the body is open: the fetch is aborted, the partial text is kept as incomplete, and nothing is held
// past the ending's own turn, so the next Ask is admitted. The server may still have been charged (FC70).
export const stopped = midStream("assistant/stopped").send(E.Stop()).checkpoint("stopped");

// The next Ask starts a new Attempt with empty progress (FC30): the old text stays in `last` until it ends.
export const askedAgain = midStream("assistant/asked-again")
  .send(E.Stop())
  .world(Model.suggest.release())
  .send(E.Ask({ prompt: "Suggest a reply" }))
  .checkpoint("answered-again");

// The body ends cleanly without `done`: the answer is not complete (FC80), whatever arrived.
export const truncated = Story.make(AssistantMachine, {
  id: "assistant/truncated",
  input: T42,
  fixtures: [AssistantFake],
  world: [Model.truncate({ ...T42, after: 4 })],
})
  .send(E.Ask({ prompt: "Suggest a reply" }))
  .checkpoint("cut");

// 20 seconds of silence: the stall fails the commit and the machine hears `Cut` with the partial text.
export const stalled = midStream("assistant/stalled").advance("20 seconds").checkpoint("cut");

// A 4xx: definite, nothing was generated, nothing is held.
export const refused = Story.make(AssistantMachine, {
  id: "assistant/refused",
  input: T42,
  fixtures: [AssistantFake],
  world: [Model.refuse({ ...T42, status: 429 })],
})
  .send(E.Ask({ prompt: "Suggest a reply" }))
  .checkpoint("refused");

// A reload while asking: progress is never persisted, so the held Attempt arrives as `Restored` and the reply shows
// as incomplete with no text.
export const reloaded = Story.make(DeskSetup, {
  id: "assistant/reloaded",
  fixtures: [AssistantFake], // the setup provides every other port; only the model is faked
})
  .ensure(SessionRef, { input: { userId: "dispatcher-7" } })
  .ensure(assistantRef(T42), { input: T42 })
  .world(Model.suggest.hold({ after: 2 }))
  .send(assistantRef(T42), E.Ask({ prompt: "Suggest a reply" }))
  .reload()
  .checkpoint("reloaded");
