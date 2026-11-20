// Round 13: the dispatch desk's ticket list (`conformance/typed/desk.ts`, Desk/Tickets), its writes only: entity Stories wait for the entity round
// (HANDOFF step 3b), so these read lanes, endings and the server, not the store.
// Source: `fetch` to the tickets API behind the fixture's `FakeApi`, one route per contract (`rename`, `archive`, ...), keyed by the Attempt's id.
import { Schema } from "effect";
import { deskFixture } from "../../conformance/typed/desk.ts";
import { Fake } from "./fake.ts";
import { Story } from "./story.ts";

const S = Schema;
type Ticket = { readonly id: string; readonly title: string; readonly revision: number; readonly archived: boolean };
type Truth = { readonly tickets: Readonly<Record<string, Ticket>> }; // user-defined
const bump = (t: Truth, id: string, f: (x: Ticket) => Partial<Ticket>): Truth => {
  const x = t.tickets[id] ?? { id, title: "", revision: 0, archived: false };
  return { tickets: { ...t.tickets, [id]: { ...x, ...f(x), revision: x.revision + 1 } } };
};
export const Tickets = Fake.server("Tickets", {
  truth: { tickets: S.Record(S.String, S.Struct({ id: S.String, title: S.String, revision: S.Number, archived: S.Boolean })) },
  initial: { tickets: { t1: { id: "t1", title: "Leak in 4B", revision: 1, archived: false } } } as Truth,
  endpoints: {
    rename: Fake.call<Truth>({
      request: { id: S.String, title: S.String },
      handle: (t, req: { id: string; title: string }) => {
        const next = bump(t, req.id, () => ({ title: req.title }));
        return { truth: next, response: { ok: next.tickets[req.id] } };
      },
    }),
    archive: Fake.call<Truth>({
      request: { id: S.String },
      handle: (t, req: { id: string }) => {
        const next = bump(t, req.id, () => ({ archived: true }));
        return { truth: next, response: { ok: next.tickets[req.id] } };
      },
    }),
  },
});

const desk = (id: string) => Story.machine(deskFixture, { id, fakes: [Tickets] });
const E = desk("desk/events").E;

// `rename` is `latest`: a second rename of one ticket while the first is in transit supersedes it, and the server ends with the last title.
export const renameLatest = desk("desk/rename-latest")
  .world(Tickets.rename.hold())
  .send(E["Rename"]!({ id: "t1", title: "Leak in 4B (urgent)" }), E["Rename"]!({ id: "t1", title: "Leak in 4C" }))
  .checkpoint("renaming")
  .world(Tickets.rename.release())
  .checkpoint("renamed");

// `archive` is `reject`: a second press while the first is in transit declines, and nothing more is sent.
export const archiveTwice = desk("desk/archive-twice")
  .world(Tickets.archive.hold())
  .send(E["Archive"]!({ id: "t1" }), E["Archive"]!({ id: "t1" }))
  .checkpoint("archiving")
  .world(Tickets.archive.release())
  .checkpoint("archived");

export const deskStories = [renameLatest, archiveTwice];
