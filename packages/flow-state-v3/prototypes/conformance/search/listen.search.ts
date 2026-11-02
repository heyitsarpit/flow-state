// SEARCH-LISTEN: frames crossed with writes that carry no row, reads, repairs and another device. D67's oracle: no silent wrongness.
// When nothing is outstanding, the feed has said all the server has, and the store shows a record unmarked and unpredicted, it is
// what the server holds, on the field the writes change. `shape`: the entity declares a version, or none.
import {
  deskListenFixture,
  deskListenNoVersionFixture,
  ticketRef,
} from "../fixtures/desk.compiled.ts";
import type { Harness, Step } from "../harness.ts";
import { checkClaims, checkEndings, checkMints } from "../scenarios/ctx.ts";
import { bfs, Oracle, type Action, type Report } from "./engine.ts";

const T = { actor: "Desk/Tickets", id: "a" };
const T1 = ticketRef("t1");
const open = (op: string) => (h: Harness) =>
  h.read.outside().open.some((o) => o.op === op && !o.never);
const feedOpen = (h: Harness) => h.read.outside().feeds.some((f) => f.open && !f.closing);
const ACTIONS: readonly Action[] = [
  { name: "Load", step: { send: T, event: "Load" } },
  { name: "Archive", step: { send: T, event: "Archive", payload: { id: "t1" } } },
  { name: "Rename", step: { send: T, event: "Rename", payload: { id: "t1", title: "mine" } } },
  { name: "archive.ok", step: { answer: "archive", with: { apply: true } }, on: open("archive") },
  { name: "archive.lost", step: { answer: "archive", with: { lost: true } }, on: open("archive") },
  {
    name: "archive.landed",
    step: { answer: "archive", with: { applyLost: true } },
    on: open("archive"),
  },
  { name: "rename.ok", step: { answer: "rename", with: { apply: true } }, on: open("rename") },
  { name: "Reconcile", step: { send: T, event: "Reconcile", payload: { id: "t1" } } },
  { name: "list.truth", step: { answer: "list", with: { truth: true } }, on: open("list") },
  { name: "repair.truth", step: { answer: "repair", with: { truth: true } }, on: open("repair") },
  {
    name: "repair.fail",
    step: { answer: "repair", with: { fail: { tag: "NoResponse" } } },
    on: open("repair"),
  },
  { name: "hello", step: { feed: "changes", frame: { _feed: "live", proof: "x" } }, on: feedOpen },
  { name: "frame.now", step: { feed: "changes", frame: "NOW" }, on: feedOpen }, // the server's row as it stands
  { name: "frame.was", step: { feed: "changes", frame: "WAS" }, on: feedOpen }, // the row as first loaded: late, from before everything
  {
    name: "other",
    step: {
      fault: {
        mutateServer: (s: any) => ({
          tickets: {
            ...s.tickets,
            t1: {
              ...s.tickets.t1,
              title: `other${s.tickets.t1.revision}`,
              revision: s.tickets.t1.revision + 1,
            },
          },
        }),
      },
    },
  },
  { name: "t30s", step: { advance: 30_000 } },
];
// With no version a frame that arrives out of its server's order is silently applied: the search found it at depth 3 (hello other
// frame.now frame.was). D67's stated limit for an unversioned entity, and the owner's question: so there it counts as being behind.
const bumps = (s: readonly Action[], shape: "version" | "none") => {
  // How many moves the server made since the feed last told all, as the search can see it: `other` moved it, `frame.now` told it.
  let behind = 0;
  for (const a of s) {
    if (a.name === "other" || (shape === "none" && a.name === "frame.was")) behind++;
    if (a.name === "frame.now" || a.name === "list.truth" || a.name === "repair.truth") behind = 0;
  }
  return behind;
};
export const searchListen = (
  make: () => Harness,
  shape: "version" | "none",
  o: { depth: number; maxStates: number; deadlineMs: number },
): Report => {
  const fixture = shape === "version" ? deskListenFixture : deskListenNoVersionFixture;
  const boot = () => {
    const h = make();
    const inner = h.do.bind(h);
    const first = { id: "t1", title: "title t1", slug: "title t1", archived: false, readAt: null };
    const strip = (r: any) => (shape === "version" ? r : (({ revision: _r, ...x }) => x)(r));
    h.do = (s: Step) => {
      if ("feed" in s && s.frame === "NOW") {
        const r = h.read.truth().server.tickets.t1;
        if (r) inner({ ...s, frame: { _tag: "TicketUpdated", ticket: strip(r) } });
        else inner({ ...s, frame: { _tag: "TicketRemoved", ticketId: "t1", revision: 99 } });
      } else if ("feed" in s && s.frame === "WAS")
        inner({ ...s, frame: { _tag: "TicketUpdated", ticket: strip({ ...first, revision: 1 }) } });
      else inner(s);
    };
    h.start({ machines: [fixture], seed: 1 });
    inner({ ensure: T });
    inner({ send: T, event: "Load" });
    inner({ answer: "list", with: { truth: true } });
    return h;
  };
  let behindNow = 0;
  return bfs({
    make: boot,
    actions: ACTIONS,
    depth: o.depth,
    maxStates: o.maxStates,
    deadlineMs: o.deadlineMs,
    extra: (s) => {
      behindNow = bumps(s, shape);
      return `${behindNow}`;
    },
    edge(_pre, post) {
      if (post.read.quiet().fatal) throw new Oracle("fatal");
      const i = post.read
        .issues()
        .find((x) => x.code === "Fatal" || x.code === "ModuleDefect" || x.code === "CannotOccur");
      if (i) throw new Oracle(`${i.code} ${i.origin ?? ""} ${String(i.input ?? "")}`);
    },
    state(h) {
      checkClaims(h.read);
      checkEndings(h.read);
      checkMints(h.read);
      const r = h.read.record(T1);
      const out = h.read.outside();
      const q = h.read.quiet();
      const busy =
        out.open.length > 0 ||
        out.lost > 0 ||
        out.mayHave.length > 0 ||
        q.waits.some((w) => w.kind !== "timer");
      if (r && !busy && !r.predicted && !r.uncertain && behindNow === 0) {
        const t = h.read.truth().server.tickets.t1;
        if (t && (r.data?.archived !== t.archived || r.data?.title !== t.title))
          throw new Oracle(
            `silently wrong: shows ${JSON.stringify(r.data)}, server ${JSON.stringify(t)}`,
          );
      }
    },
  });
};
