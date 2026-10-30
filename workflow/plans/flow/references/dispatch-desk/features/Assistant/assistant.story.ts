// Assistant Stories: tokens, Stop mid-stream, a truncated body, a stall, a refusal, a reload while asking.
// Each runs the machine over the model fake, paced by wire words, never by injected results.
// Pending merge 6: written against merge-6-streams/proposal-v2.md revision 7.1, 4.4.
import { Story } from "flow-state/testing";
import { DeskSetup } from "../../app/setup.js";
import { Assistant as Model, AssistantFake, textAfter } from "../../testing/assistant.fake.js";
import { SessionRef } from "../Session/session.ref.js";
import { Assistant } from "./assistant.definition.js";
import { AssistantMachine } from "./assistant.machine.js";
import { assistantRef } from "./assistant.ref.js";

const { S, E } = Assistant;

const T42 = { workspaceId: "north", ticketId: "T-42" }; // also the lane key

const ask = (id: string) =>
  Story.make(AssistantMachine, { id, input: T42, fixtures: [AssistantFake] }).send(
    E.Ask({ prompt: "Suggest a reply" }),
  );

// Two tokens arrive and the rest is held. The text is the row's `progress`; `last` is untouched.
// design gap: M6 2.10.9 gives `hold()` only "frames stop"; `after` (let n frames through first) is this
// file's spelling for pacing a body.
const midStream = (id: string) => ask(id).world(Model.suggest.hold({ after: 2 }));

export const answered = ask("assistant/answered")
  .expect({
    state: S.IDLE,
    memory: { last: textAfter(10), incomplete: false },
    operations: { suggest: [] }, // the lane is gone
  })
  .expect(Model.suggest, [{ phase: "closed", code: 1000 }]);

export const streaming = midStream("assistant/streaming").expect({
  state: S.ASKING,
  memory: { last: "" },
  operations: { suggest: [{ key: T42, pending: true, progress: { text: textAfter(2) } }] },
});

// Stop while the body is open: the fetch is aborted, the partial text is kept as incomplete, and the
// ending's handler releases the hold, so the next Ask is admitted. The server may still have been
// charged; nothing in a browser reports it (FC70).
export const stopped = midStream("assistant/stopped")
  .send(E.Stop())
  .expect({
    state: S.IDLE,
    memory: { last: textAfter(2), incomplete: true },
    operations: { suggest: [] }, // released, not held: no lane
  })
  .expect(Story.inspection, { lanes: [] });

// The next Ask starts a new Attempt with empty progress (FC30): the old text stays in `last` until it ends.
export const askedAgain = midStream("assistant/asked-again")
  .send(E.Stop())
  .world(Model.suggest.release())
  .send(E.Ask({ prompt: "Suggest a reply" }))
  .expect({
    state: S.IDLE,
    memory: { last: textAfter(10), incomplete: false },
  });

// The body ends cleanly without `done`: the answer is not complete (FC80), whatever arrived.
export const truncated = Story.make(AssistantMachine, {
  id: "assistant/truncated",
  input: T42,
  fixtures: [AssistantFake],
  world: [Model.truncate({ ...T42, after: 4 })],
})
  .send(E.Ask({ prompt: "Suggest a reply" }))
  .expect({
    state: S.IDLE,
    memory: { last: textAfter(4), incomplete: true },
    operations: { suggest: [] },
  });

// 20 seconds of silence: the stall fails the commit and the machine hears `Cut` with the partial text.
export const stalled = midStream("assistant/stalled")
  .advance("20 seconds")
  .expect({
    state: S.IDLE,
    memory: { last: textAfter(2), incomplete: true },
  });

// A 4xx: definite, nothing was generated, nothing is held.
export const refused = Story.make(AssistantMachine, {
  id: "assistant/refused",
  input: T42,
  fixtures: [AssistantFake],
  world: [Model.refuse({ ...T42, status: 429 })],
})
  .send(E.Ask({ prompt: "Suggest a reply" }))
  .expect({
    state: S.IDLE,
    memory: { last: "", incomplete: false, refused: true },
    operations: { suggest: [] },
  });

// A reload while asking: progress is never persisted, so the held Attempt arrives as `Restored` and the
// reply shows as incomplete with no text. App Story (reload is a tab step), so it waits for B11's setup.
export const reloaded = Story.make(DeskSetup, {
  id: "assistant/reloaded",
  fixtures: [AssistantFake], // the setup provides every other port; only the model is faked
})
  .ensure(SessionRef, { input: { userId: "dispatcher-7" } })
  .ensure(assistantRef(T42), { input: T42 })
  .world(Model.suggest.hold({ after: 2 }))
  .send(assistantRef(T42), E.Ask({ prompt: "Suggest a reply" }))
  .reload()
  .expect(assistantRef(T42), {
    state: S.IDLE,
    memory: { last: "", incomplete: true },
    operations: { suggest: [] },
  })
  .expect(Model.suggest, [{ phase: "closed", code: 1001 }]); // the page went away; the server may finish
