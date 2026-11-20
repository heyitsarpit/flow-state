// Review H2's traces, on purpose not in the suite and not fixed: the entity confirm path gets a from-scratch redesign in round 8. This runs them and prints what each shows,
// so round 8 starts from a record, and they are never counted as passing. bun round-8/known-failing-h2.ts
import { makeHarness } from "../conformance/drive.ts";
import { deskListenFixture, ticketRef } from "../conformance/fixtures/desk.compiled.ts";
import { Ctx } from "../conformance/scenarios/ctx.ts";
import { port } from "./adapter.ts";

const T = { actor: "Desk/Tickets", id: "a" };
const T1 = ticketRef("t1");
const row = (o: object = {}) => ({ id: "t1", title: "title t1", slug: "title t1", archived: false, readAt: null, revision: 1, ...o });
const make = makeHarness(port);
const start = () => {
  const h = make();
  h.start({ machines: [deskListenFixture], seed: 1 });
  const c = new Ctx(h, T);
  c.ensure();
  return c;
};
const hello = (c: Ctx) => c.do({ feed: "changes", frame: { _feed: "live", proof: "x" } });
const frame = (c: Ctx, f: unknown) => c.do({ feed: "changes", frame: f });
const say = (name: string, want: string, c: Ctx) => {
  const r = c.rec(T1);
  console.log(`${name}\n  want: ${want}\n  got:  ${JSON.stringify({ data: r?.data, uncertain: r?.uncertain, predicted: r?.predicted })}`);
};
{
  const c = start();
  hello(c);
  c.to(T, "Load");
  c.to(T, "Retitle", { id: "t1", title: "new" });
  c.ack?.();
  c.answer("retitle", { ok: { title: "new", revision: 2 } });
  c.answer("list", { ok: [row()] });
  say("A1 retitle ok partial, then list answers whole row v1", "whole row, or marked", c);
}
{
  const c = start();
  hello(c);
  c.to(T, "Load");
  c.to(T, "Archive", { id: "t1" });
  c.answer("archive", { ok: {} });
  frame(c, { _tag: "TicketPatched", patch: { id: "t1", title: "x", revision: 3 } });
  c.answer("list", { ok: [row()] });
  say("A2 204, patch frame v3, list row v1", "archived true and slug present, or marked", c);
}
{
  const c = start();
  hello(c);
  c.to(T, "Load");
  c.do({ feed: "changes", frame: { _tag: "TicketRemoved", ticketId: "t1", revision: 2 } });
  frame(c, { _tag: "TicketPatched", patch: { id: "t1", title: "x", revision: 3 } });
  say("A4 tombstone v2, patch frame v3", "not resurrected as a partial, or marked", c);
}
console.log("\nKnown failing. Not counted. H2 is round 8's, with partial evidence in the fakes and a whole-record oracle first.");
