// The actor-lifetime proposal (workflow/plans/flow/references/explorations/actor-lifetime/proposal.md, PROPOSED): an actor lives while it is
// used. A use is a consumer (`attach` here) or work in progress: an operation in flight, an unlanded write, a held unknown, a parked ending,
// an armed schedule. With none it is disposed once the host's task is over; a persisted one keeps its record, and the next ensure or send
// restores it. Every expectation below is that rule's, worked out by hand; none was read off a run.
import { issuesFixture } from "../typed/issues.ts";
import { notesFixture } from "../typed/lab-machines.ts";
import { payFixture } from "../typed/pay.ts";
import type { ActorRef } from "../harness.ts";
import { Ctx, type Scenario } from "./ctx.ts";

const P = { actor: "Checkout/Pay", id: "shopper-1" };
const L = { actor: "Issues/List", id: "a" };
const N = { actor: "Notes", id: "a" };
const CART = { cartId: "c1", intentId: "pi1" };
const CAP = { status: "requires_capture", clientSecret: "" };
// How many times the actor went from published to absent: each is a disposal a reader could see.
const gaps = (c: Ctx, a: ActorRef) => {
  const k = c.r.actorKey(a);
  let was = false;
  let n = 0;
  for (const f of c.r.frames()) {
    const here = (f.view as Record<string, unknown>)[k] !== undefined;
    if (was && !here) n++;
    was = here;
  }
  return n;
};
const attach = (c: Ctx, a: ActorRef) => c.do({ attach: a });
const detach = (c: Ctx, a: ActorRef) => c.do({ detach: a });
const delivered = (c: Ctx, op: string) => c.r.evidence("delivered").filter((e) => e["op"] === op).length;

export const lifetimeScenarios: readonly Scenario[] = [
  {
    // Work in progress is a use. Pay's charge is on the wire (and PAYING's schedule armed) when the last consumer goes: the actor stays, hears
    // its ending in the same life, stays while `place` is in flight, and goes once both have settled. Its record is kept: the next attach is PAID.
    id: "LIFE-01",
    kind: "example",
    fixtures: [payFixture],
    actor: P,
    cites: ["lifetime:work-is-a-use", "lifetime:persisted-keeps-record"],
    run(c0) {
      const c = new Ctx(c0.fresh([payFixture]), P);
      attach(c, P);
      c.send("Start", CART);
      c.send("PayRequested", { paymentMethodId: "visa" });
      c.ack();
      detach(c, P);
      c.state("PAYING");
      c.eq("not disposed while the charge is out", gaps(c, P), 0);
      c.answer("pay", { ok: CAP });
      c.state("PLACING");
      c.eq("the same life heard it", c.mem().authorized, true);
      c.ack();
      c.answer("place", { ok: { orderId: "o1" } });
      c.eq("disposed once idle", c.r.state(P), undefined);
      c.eq("disposed once, after the last lane settled", gaps(c, P), 1);
      c.yes("its record kept", c.record(P) !== undefined);
      c.eq("each ending heard once", [delivered(c, "pay"), delivered(c, "place")], [1, 1]);
      attach(c, P);
      c.state("PAID");
      c.eq("restored, not fresh", c.mem().receipt?.orderId, "o1");
      c.eq("one charge", c.reqs("pay").length, 1);
    },
  },
  {
    // A non-persisted actor: busy while its write is out, gone when it lands, and nothing of it is kept. The next attach is a fresh life.
    id: "LIFE-02",
    kind: "example",
    fixtures: [issuesFixture],
    actor: L,
    cites: ["lifetime:work-is-a-use", "lifetime:non-persisted-is-gone"],
    variants: {
      "busy-until-its-write-lands-then-gone"(c) {
        attach(c, L);
        c.to(L, "Toggle", { id: "i1", liked: true });
        detach(c, L);
        c.state("READY", L);
        c.answer("like", { apply: true });
        c.eq("gone once the write landed", c.r.state(L), undefined);
        c.eq("its ending was heard first", delivered(c, "like"), 1);
        c.eq("nothing kept", c.record(L), undefined);
        attach(c, L);
        c.state("READY", L);
        c.eq("a fresh life", c.r.evidence("initial").length, 2);
        c.eq("one request", c.reqs("like").length, 1);
      },
      "idle-with-no-uses-is-gone"(c) {
        attach(c, L);
        c.state("READY", L);
        detach(c, L);
        c.eq("gone", c.r.state(L), undefined);
        c.eq("nothing kept", c.record(L), undefined);
        attach(c, L);
        c.eq("a fresh life", c.r.evidence("initial").length, 2);
      },
    },
  },
  {
    // Runtime O4 under the rule: a send to an absent persisted target restores it from its kept record and then delivers, in the order sent.
    // CardChosen then PayRequested: in order, the card is visa; the other way round it would be mc. A fresh start would charge intent "".
    id: "LIFE-03",
    kind: "example",
    fixtures: [payFixture],
    actor: P,
    cites: ["lifetime:send-restores", "lifetime:persisted-keeps-record"],
    run(c0) {
      const c = new Ctx(c0.fresh([payFixture]), P);
      attach(c, P);
      c.send("Start", CART);
      c.state("CARD");
      detach(c, P);
      c.eq("disposed", c.r.state(P), undefined);
      c.yes("its record kept", c.record(P) !== undefined);
      c.do({ sendMany: [[P, "CardChosen", { paymentMethodId: "mc" }], [P, "PayRequested", { paymentMethodId: "visa" }]] });
      c.state("PAYING");
      c.eq("restored memory", c.mem().intentId, "pi1");
      c.eq("delivered in order", c.mem().paymentMethodId, "visa");
      c.eq("no fresh start", c.r.evidence("initial").length, 1);
      c.ack();
      c.eq("the saved intent is charged", c.reqs("pay").map((q) => (q.input as { intentId: string }).intentId), ["pi1"]);
      c.answer("pay", { ok: CAP });
      c.ack();
      c.answer("place", { ok: { orderId: "o1" } });
      c.eq("no uses and idle again: disposed again", c.r.state(P), undefined);
      c.eq("two disposals", gaps(c, P), 2);
    },
  },
  {
    // "Once the host's current commit has finished": a use that ends and another that begins in one task (StrictMode's remount, a route
    // change) disposes nothing. Uses are counted: one of two ending leaves the actor.
    id: "LIFE-04",
    kind: "example",
    fixtures: [payFixture],
    actor: P,
    cites: ["lifetime:after-the-commit", "lifetime:uses-are-counted"],
    variants: {
      "detach-then-attach-in-one-task-disposes-nothing"(c0) {
        const c = new Ctx(c0.fresh([payFixture]), P);
        attach(c, P);
        c.send("Start", CART);
        c.h.raw({ detach: P });
        attach(c, P);
        c.state("CARD");
        c.eq("never absent", gaps(c, P), 0);
        c.eq("its memory is the same life's", c.mem().intentId, "pi1");
        detach(c, P);
        c.eq("a real unmount still disposes", c.r.state(P), undefined);
      },
      "one-of-two-uses-ending-keeps-it"(c0) {
        const c = new Ctx(c0.fresh([payFixture]), P);
        attach(c, P);
        attach(c, P);
        c.send("Start", CART);
        detach(c, P);
        c.state("CARD");
        c.eq("never absent", gaps(c, P), 0);
        detach(c, P);
        c.eq("the last use ends it", c.r.state(P), undefined);
      },
    },
  },
  {
    // A parked ending awaiting delivery is a use. Notes' d1 copy is removed while its save is out; the save fails and the ending is parked for
    // the path (rule 53). The last consumer has gone, and the actor stays until a d1 copy takes the ending; then it is idle and goes.
    id: "LIFE-05",
    kind: "example",
    fixtures: [notesFixture],
    actor: N,
    cites: ["lifetime:work-is-a-use", "rule:53"],
    run(c) {
      attach(c, N);
      c.send("SetDocs", { docs: ["d1"] });
      c.into(["docs:d1"], "Edited", { body: "mine" });
      c.ack();
      c.send("SetDocs", { docs: [] });
      detach(c, N);
      c.answer("save", { fail: { tag: "Conflict" } });
      c.state("READY");
      c.eq("not disposed while an ending waits", gaps(c, N), 0);
      c.eq("not heard yet", delivered(c, "save"), 0);
      c.send("SetDocs", { docs: ["d1"] });
      c.eq("the new copy heard it", delivered(c, "save"), 1);
      c.eq("then idle, and gone", c.r.state(N), undefined);
    },
  },
];
