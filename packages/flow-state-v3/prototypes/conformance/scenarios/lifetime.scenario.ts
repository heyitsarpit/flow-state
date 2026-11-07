// Rule 73 and 2.7.17 (decided, OD27; C104-C109): a shared actor lives while it is used. A use is a consumer (`attach` here: a React
// consumer, a snapshots subscription, a bound context consumer or a pre-attach handle), mail not yet processed, or a write lane that is
// InFlight or has waiting commits. Held, armed schedules, placements, stream sessions, reads and parked endings are not uses. With no uses
// for the grace (React O3's 100 ms, on the Runtime Clock) the actor is disposed; a persisted one keeps its record and the Runtime's copy.
// `release` ends a use and disposes nothing (Story.release, OD27 Q4). Every expectation below is the design's, worked out by hand.
import { issuesFixture } from "../typed/issues.ts";
import { notesFixture } from "../typed/lab-machines.ts";
import { payFixture } from "../typed/pay.ts";
import { BareId } from "../typed/round7.ts";
import { serialBareFixture } from "../typed/round8.ts";
import type { ActorRef } from "../harness.ts";
import { Ctx, type Scenario } from "./ctx.ts";

const GRACE = 100; // React O3's grace (React.plan): internal, never a user option
const P = { actor: "Checkout/Pay", id: "shopper-1" };
const L = { actor: "Issues/List", id: "a" };
const N = { actor: "Notes", id: "a" };
const S = { actor: BareId, id: "a" };
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
const release = (c: Ctx, a: ActorRef) => c.do({ release: a });
const delivered = (c: Ctx, op: string) => c.r.evidence("delivered").filter((e) => e["op"] === op).length;
const toCard = (c0: Ctx) => {
  const c = new Ctx(c0.fresh([payFixture]), P);
  attach(c, P);
  c.send("Start", CART);
  c.state("CARD");
  return c;
};

export const lifetimeScenarios: readonly Scenario[] = [
  {
    // An InFlight write is a use. Pay's charge is out when its last consumer goes: it stays, hears its endings in the same life, stays while
    // `place` is out, then the grace runs and it goes with its record kept. The next attach is PAID.
    id: "LIFE-01",
    kind: "example",
    fixtures: [payFixture],
    actor: P,
    cites: ["rule:73", "rule:44", "sec:2.7.17"],
    run(c0) {
      const c = new Ctx(c0.fresh([payFixture]), P);
      attach(c, P);
      c.send("Start", CART);
      c.send("PayRequested", { paymentMethodId: "visa" });
      c.ack();
      release(c, P);
      c.advance(GRACE);
      c.state("PAYING");
      c.eq("not disposed while the charge is out", gaps(c, P), 0);
      c.answer("pay", { ok: CAP });
      c.state("PLACING");
      c.eq("the same life heard it", c.mem().authorized, true);
      c.ack();
      c.answer("place", { ok: { orderId: "o1" } });
      c.state("PAID");
      c.eq("idle, but the grace has not passed", gaps(c, P), 0);
      c.advance(GRACE);
      c.eq("disposed after the grace", c.r.state(P), undefined);
      c.yes("its record kept", c.record(P) !== undefined);
      c.eq("each ending heard once", [delivered(c, "pay"), delivered(c, "place")], [1, 1]);
      attach(c, P);
      c.state("PAID");
      c.eq("restored, not fresh", c.mem().receipt?.orderId, "o1");
      c.eq("one charge", c.reqs("pay").length, 1);
    },
  },
  {
    // A non-persisted shared actor: busy while its write is out, gone a grace after it lands, nothing kept, and the next attach is fresh.
    id: "LIFE-02",
    kind: "example",
    fixtures: [issuesFixture],
    actor: L,
    cites: ["rule:73", "sec:2.7.17"],
    variants: {
      "busy-until-its-write-lands-then-gone"(c) {
        attach(c, L);
        c.to(L, "Toggle", { id: "i1", liked: true });
        release(c, L);
        c.advance(GRACE);
        c.state("READY", L);
        c.answer("like", { apply: true });
        c.state("READY", L);
        c.advance(GRACE);
        c.eq("gone a grace after the write landed", c.r.state(L), undefined);
        c.eq("its ending was heard first", delivered(c, "like"), 1);
        c.eq("nothing kept", c.record(L), undefined);
        attach(c, L);
        c.state("READY", L);
        c.eq("a fresh life", c.r.evidence("initial").length, 2);
        c.eq("one request", c.reqs("like").length, 1);
      },
      "idle-with-no-uses-is-gone-after-the-grace"(c) {
        attach(c, L);
        release(c, L);
        c.state("READY", L);
        c.advance(GRACE);
        c.eq("gone", c.r.state(L), undefined);
        c.eq("nothing kept", c.record(L), undefined);
      },
    },
  },
  {
    // C105: a send to an absent persisted target restores it from its record and delivers, in the order sent. CardChosen then PayRequested:
    // in order, the card is visa; the other way round, mc. A fresh start would charge intent "". It has no uses, so it goes again once idle.
    id: "LIFE-03",
    kind: "example",
    fixtures: [payFixture],
    actor: P,
    cites: ["rule:73", "sec:2.7.17", "C105"],
    run(c0) {
      const c = toCard(c0);
      release(c, P);
      c.advance(GRACE);
      c.eq("disposed", c.r.state(P), undefined);
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
      c.state("PAID");
      c.advance(GRACE);
      c.eq("no uses and idle again: disposed again", c.r.state(P), undefined);
      c.eq("two disposals", gaps(c, P), 2);
    },
  },
  {
    // The grace: a release then an attach in one task (Strict Mode), or within the grace (a route change), keeps the same incarnation. Uses are counted.
    id: "LIFE-04",
    kind: "example",
    fixtures: [payFixture],
    actor: P,
    cites: ["rule:73", "sec:2.7.17", "C109"],
    variants: {
      "release-then-attach-in-one-task-disposes-nothing"(c0) {
        const c = toCard(c0);
        c.h.raw({ release: P });
        attach(c, P);
        c.advance(GRACE);
        c.state("CARD");
        c.eq("never absent", gaps(c, P), 0);
      },
      "an-attach-within-the-grace-keeps-the-incarnation-and-past-it-is-disposed"(c0) {
        const c = toCard(c0);
        release(c, P);
        c.advance(GRACE - 1);
        attach(c, P);
        c.advance(GRACE);
        c.state("CARD");
        c.eq("never absent", gaps(c, P), 0);
        c.eq("its memory is the same life's", c.mem().intentId, "pi1");
        release(c, P);
        c.advance(GRACE - 1);
        c.state("CARD");
        c.advance(1);
        c.eq("disposed once the grace has passed", c.r.state(P), undefined);
      },
      "one-of-two-uses-ending-keeps-it"(c0) {
        const c = toCard(c0);
        attach(c, P);
        release(c, P);
        c.advance(GRACE);
        c.state("CARD");
        release(c, P);
        c.advance(GRACE);
        c.eq("the last use ends it", c.r.state(P), undefined);
      },
    },
  },
  {
    // A parked ending is not a use. Notes' d1 copy is removed while its save is out; the save fails and is parked for the path (rule 53).
    // Once idle the actor goes after the grace. Notes is persisted, so the parked ending stays on its lane record for the identity (rule 44),
    // and the next incarnation's d1 copy hears it once.
    id: "LIFE-05",
    kind: "example",
    fixtures: [notesFixture],
    actor: N,
    cites: ["rule:73", "rule:44", "rule:53"],
    run(c) {
      attach(c, N);
      c.send("SetDocs", { docs: ["d1"] });
      c.into(["docs:d1"], "Edited", { body: "mine" });
      c.ack();
      c.send("SetDocs", { docs: [] });
      release(c, N);
      c.answer("save", { fail: { tag: "Conflict" } });
      c.state("READY");
      c.advance(GRACE);
      c.eq("gone: a parked ending keeps nobody", c.r.state(N), undefined);
      c.eq("not heard yet", delivered(c, "save"), 0);
      attach(c, N);
      c.send("SetDocs", { docs: ["d1"] });
      c.eq("the next incarnation's copy hears it once", delivered(c, "save"), 1);
      c.eq("as the conflict it was", c.inner(["docs:d1"])?.memory.status, "conflict");
    },
  },
  {
    // Held is not a use (rule 44 hands it off). Issues' like is unknown and held; its consumer goes; the actor goes after the grace, the hold is
    // unbound, and the next incarnation hears unknown { Restored } once.
    id: "LIFE-06",
    kind: "example",
    fixtures: [issuesFixture],
    actor: L,
    cites: ["rule:73", "rule:44"],
    run(c) {
      attach(c, L);
      c.to(L, "Toggle", { id: "i1", liked: true });
      c.answer("like", { lost: true });
      c.answer("repair", { truth: true });
      release(c, L);
      c.advance(GRACE);
      c.eq("gone, holding", c.r.state(L), undefined);
      c.yes("the hold is unbound", c.r.quiet().waits.some((w) => w.kind === "held" && w.owner === "unbound"));
      attach(c, L);
      c.eq("handed off once, Restored", c.endings("like").filter((e) => e["reason"] === "Restored").length, 1);
    },
  },
  {
    // An armed schedule is not a use. Bare arms a one-second deadline in T and its consumer goes: it is disposed after the grace, and the
    // deadline stays with its persisted record; restored after it was due, the overdue one fires once (Machines O5).
    id: "LIFE-07",
    kind: "example",
    fixtures: [serialBareFixture()],
    actor: S,
    cites: ["rule:73", "sec:2.7.17"],
    run(c0) {
      const c = new Ctx(c0.fresh([serialBareFixture()]), S);
      attach(c, S);
      c.send("Arm");
      c.state("T");
      release(c, S);
      c.advance(GRACE);
      c.eq("gone with its deadline armed", c.r.state(S), undefined);
      c.yes("its record kept", c.record(S) !== undefined);
      c.advance(2_000);
      attach(c, S);
      c.advance(0);
      c.state("A");
      c.eq("the overdue deadline fired once", c.mem().fired, 1);
    },
  },
  {
    // Mail not yet processed is a use, so a send during the grace cancels it, and the grace starts again once the send is turned.
    id: "LIFE-08",
    kind: "example",
    fixtures: [payFixture],
    actor: P,
    cites: ["rule:73", "sec:2.7.17"],
    run(c0) {
      const c = toCard(c0);
      release(c, P);
      c.advance(60);
      c.send("CardChosen", { paymentMethodId: "mc" });
      c.eq("the same incarnation heard it", c.mem().paymentMethodId, "mc");
      c.advance(60);
      c.state("CARD");
      c.eq("never absent", gaps(c, P), 0);
      c.advance(GRACE - 60);
      c.eq("gone a grace after the send", c.r.state(P), undefined);
    },
  },
  {
    // C105: a send to an absent target that is not persisted is SendTargetAbsent { NotPersisted }; nothing is created, nothing is sent.
    id: "LIFE-09",
    kind: "example",
    fixtures: [issuesFixture],
    actor: L,
    cites: ["rule:73", "C105"],
    namedIssues: ["SendTargetAbsent"],
    run(c) {
      attach(c, L);
      release(c, L);
      c.advance(GRACE);
      c.eq("gone", c.r.state(L), undefined);
      c.to(L, "Toggle", { id: "i1", liked: true });
      c.eq("not created", c.r.state(L), undefined);
      c.eq("no request", c.reqs("like").length, 0);
      c.eq(
        "said, with its reason",
        c.r.issues().filter((i) => i.code === "SendTargetAbsent").map((i) => i.input),
        [{ reason: "NotPersisted" }],
      );
    },
  },
  {
    // C108: a pre-attach handle of a disposed persisted identity reads the Runtime's copy. Every publication of Pay after it comes back shows
    // CARD with its intent, never IDLE's initial memory.
    id: "LIFE-10",
    kind: "example",
    fixtures: [payFixture],
    actor: P,
    cites: ["rule:73", "C108"],
    run(c0) {
      const c = toCard(c0);
      release(c, P);
      c.advance(GRACE);
      c.eq("disposed", c.r.state(P), undefined);
      const from = c.r.frames().length;
      attach(c, P);
      const seen = c.r.frames().slice(from).map((f) => (f.view as Record<string, { state: string; memory: { intentId?: string } } | undefined>)[c.r.actorKey(P)]).filter((v) => v !== undefined);
      c.yes("published again", seen.length > 0);
      c.eq("no flash of initial", seen.map((v) => [v!.state, v!.memory.intentId]), seen.map(() => ["CARD", "pi1"]));
    },
  },
];
