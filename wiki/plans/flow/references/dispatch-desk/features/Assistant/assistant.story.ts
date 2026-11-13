// Assistant Stories: tokens, Stop mid-stream, a truncated body, a stall, a refusal, a reload while asking.
// Each runs the machine over the model fake, paced by wire words, never by injected results. assistant.test.ts reads them.
import { Story } from "flow-state/testing";
import { DeskSetup } from "../../app/setup.js";
import { SessionRef } from "../Session/session.ref.js";
import { Assistant as Model, AssistantFake } from "../../testing/assistant.fake.js";
import { Assistant } from "./assistant.definition.js";
import { AssistantMachine } from "./assistant.machine.js";
import { assistantRef } from "./assistant.ref.js";

const { E } = Assistant;

export const T42 = { workspaceId: "north", ticketId: "T-42" }; // also the lane key

const ask = (id: string) =>
  Story.machine(AssistantMachine, { id, input: T42, fixtures: [AssistantFake] }).send(
    E.Ask({ prompt: "Suggest a reply" }),
  );

// Two tokens arrive and the rest is held. The hold is set in the world before the Ask, so it is standing when the
// stream opens; set after the Ask, the stream would already have finished inside the Ask's settle.
const midStream = (id: string) =>
  Story.machine(AssistantMachine, {
    id,
    input: T42,
    fixtures: [AssistantFake],
    world: [Model.suggest.hold({ after: 2 })],
  }).send(E.Ask({ prompt: "Suggest a reply" }));

export const answered = ask("assistant/answered").checkpoint("answered");

export const streaming = midStream("assistant/streaming").checkpoint("streaming");

// Regenerate while the reply streams: the first Attempt is interrupted (its fetch aborted) and its ending is evidence.
// The standing `after: 2` would also cover the new connection, so a plain `hold()` for it is set first.
export const regenerated = midStream("assistant/regenerated")
  .world(Model.suggest.hold())
  .send(E.Regenerate())
  .checkpoint("regenerating")
  .world(Model.suggest.release())
  .checkpoint("regenerated");

// Stop while the body is open: the fetch is aborted, the partial text is kept as incomplete, and nothing is held past the ending.
export const stopped = midStream("assistant/stopped").send(E.Stop()).checkpoint("stopped");

// The next Ask starts a new Attempt with empty progress: the old text stays in `last` until it ends.
export const askedAgain = midStream("assistant/asked-again")
  .send(E.Stop())
  .world(Model.suggest.release())
  .send(E.Ask({ prompt: "Suggest a reply" }))
  .checkpoint("answeredAgain");

// The body ends cleanly without `done`: the answer is not complete, whatever arrived.
export const truncated = Story.machine(AssistantMachine, {
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
export const refused = Story.machine(AssistantMachine, {
  id: "assistant/refused",
  input: T42,
  fixtures: [AssistantFake],
  world: [Model.refuse({ ...T42, status: 429 })],
})
  .send(E.Ask({ prompt: "Suggest a reply" }))
  .checkpoint("refused");

// A reload while asking: progress is never persisted, so the held Attempt arrives as `Restored` and the reply shows as incomplete.
export const reloaded = Story.app(DeskSetup, {
  id: "assistant/reloaded",
  fixtures: [AssistantFake],
})
  .ensure(SessionRef, { input: { userId: "dispatcher-7" } })
  .ensure(assistantRef(T42), { input: T42 })
  .world(Model.suggest.hold({ after: 2 }))
  .send(assistantRef(T42), E.Ask({ prompt: "Suggest a reply" }))
  .reload()
  .checkpoint("reloaded");
