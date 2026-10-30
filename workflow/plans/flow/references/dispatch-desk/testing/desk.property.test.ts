// Property tests on the real Runtime (2.10.16). `model()` is gone (T1): finding a sequence nobody wrote is a
// search over generated Stories, shrunk to a literal Story that runs and plays back.
//
// 1. "desk converges": random interleavings of writes, pushes, failures, reordered and lost responses, checked
//    against the Desk fake's own truth. The oracle is the fake, so a filter, order or side effect the ticket
//    domain forgets shows as a failure.
// 2. "never SAVING with an idle save lane": the editor property that replaces the old explored machine.
//
// design gap: 2.10.16 names the generators' kinds but not their spellings. `Generate.sends`, `.wire`,
// `.controls`, `.advance` and `.lifecycle` below are placeholders for "sends of public events with
// Schema-derived payloads, wire words on endpoints, server controls from their Schemas, advance, lifecycle".
import { Domain, Generate, propertyTest, Story } from "flow-state/testing";
import { DeskSetup } from "../app/setup.js";
import { Editor } from "../features/Tickets/editor/editor.definition.js";
import { Editor42, T42 } from "../features/Tickets/editor/editor.story.js";
import { queueRef } from "../features/Tickets/queue/queue.ref.js";
import { TicketsDomain } from "../features/Tickets/ticket.domain.js";
import { SessionRef } from "../features/Session/session.ref.js";
import { ToastsRef } from "../features/Toasts/toasts.ref.js";
import { test } from "vite-plus/test";
import { Desk, DeskClient } from "./desk.fake.js";

const { S, O } = Editor;

const workspace = { workspaceId: "north" };

const North = queueRef("north");

// One base Story: everything the generated steps act on is already open.
const base = (id: string, properties: ReadonlyArray<ReturnType<typeof Story.property>> = []) =>
  Story.make(DeskSetup, { id, fixtures: [DeskClient], properties })
    .ensure(SessionRef, { input: { userId: "dispatcher-7" } })
    .ensure(ToastsRef)
    .ensure(North, { input: workspace })
    .ensure(Editor42, { input: T42 });

test("desk converges", () =>
  propertyTest(base("desk/property-converges"), {
    // The domain preset keeps the oracle, quietness and Inconclusive rules (C84). Resource keys are
    // TypeScript types, so the read inputs to probe are listed explicitly.
    steps: Domain.propertySteps([TicketsDomain], {
      ticketById: [
        { workspaceId: "north", ticketId: "T-42" },
        { workspaceId: "north", ticketId: "T-43" },
      ],
      list: [
        workspace,
        { ...workspace, status: "open" },
        { ...workspace, assignee: "dispatcher-7" },
        { ...workspace, search: "lobby" },
      ],
      openCount: [workspace],
    }),
    seed: 1,
    runs: 50,
    length: 40,
  }));

// A save lane is the Runtime's truth about "on the wire". The editor is SAVING exactly while its lane is not
// idle: waiting for an answer (`pending`) or holding a lost one (`uncertain`). Anything else is a state the
// machine reached that could not be saved from. The one frame that may differ is between a settlement and the
// ending's turn (2.8.1): the lane is already idle and the ending waits in the mailbox, which `work` lists, so
// that frame is skipped.
const savingNeedsALane = Story.property("never SAVING with an idle save lane", (frame) => {
  const editor = frame.read(Editor42);

  if (editor === undefined || !S.OPEN.SAVING.is(editor)) return undefined;

  const lane = O.save.get(editor, T42);

  if (lane.pending || lane.uncertain) return undefined;

  const endingQueued = frame
    .read(Story.inspection)
    .work.some((item) => "item" in item && item.item === "event" && item.actor === Editor42);

  return endingQueued ? undefined : { state: editor.state, lane };
});

test("the editor is never SAVING with an idle save lane", () =>
  propertyTest(base("desk/property-saving-lane", [savingNeedsALane]), {
    steps: [
      Generate.sends(Editor42), // every public event, payloads from the definition's Schemas
      Generate.wire(Desk.saveTitle), // hold, release, drop (request and response), duplicate, release({ nth })
      Generate.controls(Desk, ["lock", "unlock", "renameElsewhere"]),
      Generate.advance(["1 second", "3 seconds", "1 minute"]),
      Generate.lifecycle(Editor42, ["dispose", "ensure"]), // hold and release, close and open, stay paired
    ],
    seed: 7,
    runs: 100,
    length: 30,
  }));
