// Property tests on the real Runtime (2.10.16). `model()` is gone (T1): finding a sequence nobody wrote is a
// search over generated Stories, shrunk to a literal Story that runs and plays back.
//
// 1. "desk converges": random interleavings of writes, pushes, failures, reordered and lost responses, checked
//    against the Desk fake's own truth. The oracle is the fake, so a filter, order or side effect the ticket
//    domain forgets shows as a failure. `domainPropertyOptions` supplies the steps and the properties.
// 2. "never SAVING with an idle save lane": the editor property that replaces the old explored machine. Its steps
//    are written out: each is an array of step data forms (2.10.1), and the search picks among them.
import { domainPropertyOptions, propertyTest, Story } from "flow-state/testing";
import { DeskSetup } from "../app/setup.js";
import { Editor } from "../features/Tickets/editor/editor.definition.js";
import { Editor42, T42 } from "../features/Tickets/editor/editor.story.js";
import { queueRef } from "../features/Tickets/queue/queue.ref.js";
import { TicketsDomain } from "../features/Tickets/ticket.domain.js";
import { SessionRef } from "../features/Session/session.ref.js";
import { ToastsRef } from "../features/Toasts/toasts.ref.js";
import { test } from "vite-plus/test";
import { Desk, DeskClient } from "./desk.fake.js";

const { E, S, O } = Editor;

const workspace = { workspaceId: "north" };

const North = queueRef("north");

// One base Story: everything the generated steps act on is already open.
const base = (id: string) =>
  Story.app(DeskSetup, { id, fixtures: [DeskClient] })
    .ensure(SessionRef, { input: { userId: "dispatcher-7" } })
    .ensure(ToastsRef)
    .ensure(North, { input: workspace })
    .ensure(Editor42, { input: T42 });

test("desk converges", () =>
  propertyTest(base("desk/property-converges"), {
    // The domain preset keeps the oracle, quietness and Inconclusive rules (C84). Resource keys are
    // TypeScript types, so the read inputs to probe are listed explicitly.
    ...domainPropertyOptions([TicketsDomain], {
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
// that frame is skipped. A plain function over a frame (W25): it returns the violation, or undefined.
const savingNeedsALane = (frame: Story.Frame) => {
  const editor = frame.read(Editor42);

  if (editor === undefined || !S.OPEN.SAVING.is(editor.state)) return undefined;

  // `lane` is `undefined` once the lane is settled, which is the idle row this property looks for.
  const lane = frame.lane({ actor: Editor42, operation: O.save, key: T42 });

  if (lane?.pending || lane?.uncertain) return undefined;

  const endingQueued = frame.inspection?.work.some(
    (item: { item?: string; actor?: unknown }) => item.item === "event" && item.actor === Editor42,
  );

  return endingQueued ? undefined : { state: editor.state, lane };
};

test("the editor is never SAVING with an idle save lane", () =>
  propertyTest(base("desk/property-saving-lane"), {
    steps: [
      // every public event, with a few payloads
      [
        { send: [Editor42, E.TitleChanged({ title: "Replace lobby light" })] },
        { send: [Editor42, E.TitleChanged({ title: "" })] },
        { send: [Editor42, E.SaveRequested()] },
        { send: [Editor42, E.CancelSave()] },
        { send: [Editor42, E.RefreshRequested()] },
        { send: [Editor42, E.Escape()] },
        { send: [Editor42, E.Close()] },
        { send: [Editor42, E.Reopen()] },
      ],
      // hold, release, drop (request and response), duplicate, release({ nth })
      [
        Desk.saveTitle.hold(),
        Desk.saveTitle.release(),
        Desk.saveTitle.release({ nth: 1 }),
        Desk.saveTitle.drop({ at: "request" }),
        Desk.saveTitle.drop({ at: "response" }),
        Desk.saveTitle.duplicate(),
      ],
      // server controls, with their Schema arguments
      [
        Desk.lock({ ...T42, by: "dispatcher-2" }),
        Desk.unlock(T42),
        Desk.renameElsewhere({ ...T42, title: "Renamed elsewhere" }),
      ],
      [{ advance: "1 second" }, { advance: "3 seconds" }, { advance: "1 minute" }],
      // hold and release, close and open, stay paired
      [{ dispose: [Editor42] }, { ensure: [Editor42, { input: T42 }] }],
    ],
    properties: { savingNeedsALane },
    seed: 7,
    runs: 100,
    length: 30,
  }));
