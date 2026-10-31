// Bulk close and SLA deadlines: machine Stories over the queue, its world the Desk fake. Transcripts;
// queue.bulk.test.ts reads them. Module checkpoints: `bulk-queued`, `bulk-partly-failed` (also the per-row 409 in
// queue.story.ts), `sla-breached`.
import { Story } from "flow-state/testing";
import { Desk } from "../../../testing/desk.fake.js";
import { Queue } from "./queue.definition.js";
import { key, queue } from "./queue.story.js";

const { E } = Queue;

const select = (...ids: ReadonlyArray<string>) =>
  ids.map((ticketId) => E.Select({ ticketId, selected: true }));

// Two bulk closes, one after the other, on the workspace's FIFO (`serialize`): the second waits behind the first
// (`outstanding`), so they land in the order asked (O7). Each predicts its tickets closed at once, many records of
// one entity in one write (E2). T-42 is being worked on: the server skips it, and the answer says so by listing it
// unchanged, so its prediction is replaced by what the server has (`bulk-partly-failed`).
export const bulkQueued = queue("queue/bulk-queued", [Desk.closeMany.hold({ at: "response" })])
  .send(...select("T-101", "T-102", "T-42"), E.CloseSelected())
  .send(...select("T-103", "T-104"), E.CloseSelected())
  .checkpoint("bulk-queued")
  .world(Desk.closeMany.release())
  .checkpoint("bulk-partly-failed");

// Sixty-four bulk operations wait behind the one on the wire; the next is declined `NotSent { Overloaded }` with no
// prediction and no queue join (rule 35, O11), and the notice says so.
export const bulkOverloaded = Array.from({ length: 65 })
  .reduce<ReturnType<typeof queue>>(
    (story, _, n) =>
      story.send(
        E.Select({ ticketId: `T-${String(100 + (n % 40))}`, selected: true }),
        E.CloseSelected(),
      ),
    queue("queue/bulk-overloaded", [Desk.closeMany.hold()]).send(
      ...select("T-101"),
      E.CloseSelected(),
    ),
  )
  .checkpoint("overloaded");

// The answer to a bulk close is lost: every listed ticket is marked uncertain and its repair forced (E17). The head's
// own ending re-sends the same Attempt once; its success clears every mark at once (rule 32).
export const bulkUnsure = queue("queue/bulk-unsure", [
  Desk.closeMany.drop({ at: "response", times: 1 }),
])
  .send(...select("T-101", "T-102"), E.CloseSelected())
  .checkpoint("bulk-resolved");

// A deadline per open row (a keyed schedule): T-43's is at one hour. Jump to just past it (`advance({ to })`, Y5):
// its timer fires once, the notice says so, and the timer is gone while the others still wait.
export const slaBreached = queue("queue/sla-breached")
  .checkpoint("sla-armed")
  .advance({ to: 3_600_001 })
  .checkpoint("sla-breached");

export const T43 = key("T-43");
