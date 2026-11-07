// Rule 73 and 2.7.17 (decided, OD27, OD31; C104-C111, C124-C127): an actor lives while it is used, and until its finite work in flight has
// returned. A use here is the Story's `ensure` (one each), a host `subscribe`, or a mounted local actor. Work in flight: an InFlight write
// lane, a read started in a turn that handles the ending of work in flight (transitively), and an ending owed at `ready`. Schedules wait while
// nothing uses the actor. Free for the grace (100 ms, the Runtime Clock), it ends; a persisted actor keeps its record in the Runtime's copy.
// `detach` ends one use; `dispose` is `disposeActor`. Every expectation below is the design's, worked out by hand from 2.7.17's text.
import { issuesFixture } from "../typed/issues.ts";
import { notesFixture } from "../typed/lab-machines.ts";
import { payFixture } from "../typed/pay.ts";
import { BareId } from "../typed/round7.ts";
import { serialBareFixture } from "../typed/round8.ts";
import { LifeId, lifeFixture } from "../typed/lifetime.ts";
import type { ActorRef } from "../harness.ts";
import { Ctx, type Scenario } from "./ctx.ts";

export const GRACE = 100; // React O3's grace (2.7.17): internal, never a user option, the same for local actors
const P = { actor: "Checkout/Pay", id: "shopper-1" };
const L = { actor: "Issues/List", id: "a" };
const N = { actor: "Notes", id: "a" };
const S = { actor: BareId, id: "a" };
const CART = { cartId: "c1", intentId: "pi1" };
const CAP = { status: "requires_capture", clientSecret: "" };
// How many times the actor went from published to absent: each is an end a reader could see.
export const gaps = (c: Ctx, a: ActorRef) => {
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
export const delivered = (c: Ctx, op: string) => c.r.evidence("delivered").filter((e) => e["op"] === op).length;
export const ends = (c: Ctx, a: ActorRef) => c.r.evidence("ended").filter((e) => e["actor"] === c.r.actorKey(a)).length;
const toCard = (c0: Ctx) => {
  const c = new Ctx(c0.fresh([payFixture]), P);
  c.ensure(P);
  c.send("Start", CART);
  c.state("CARD");
  return c;
};

export const lifetimeScenarios: readonly Scenario[] = [
  {
    // An InFlight write keeps the actor. Pay's charge is out when its last use goes: it stays, hears its endings in the same incarnation, stays
    // while `place` is out, then the grace runs and it ends with its record kept. The next ensure is PAID.
    id: "LIFE-01",
    kind: "example",
    fixtures: [payFixture],
    actor: P,
    cites: ["rule:73", "rule:44", "sec:2.7.17"],
    run(c0) {
      const c = new Ctx(c0.fresh([payFixture]), P);
      c.ensure(P);
      c.send("Start", CART);
      c.send("PayRequested", { paymentMethodId: "visa" });
      c.ack();
      c.detach(P);
      c.advance(GRACE);
      c.state("PAYING");
      c.eq("not ended while the charge is out", gaps(c, P), 0);
      c.answer("pay", { ok: CAP });
      c.state("PLACING");
      c.eq("the same incarnation heard it", c.mem().authorized, true);
      c.ack();
      c.answer("place", { ok: { orderId: "o1" } });
      c.state("PAID");
      c.eq("free, but the grace has not passed", gaps(c, P), 0);
      c.eq("one incarnation throughout", c.incarnations(P), 1);
      c.advance(GRACE);
      c.eq("ended after the grace", c.r.state(P), undefined);
      c.yes("its record kept", c.record(P) !== undefined);
      c.eq("each ending heard once", [delivered(c, "pay"), delivered(c, "place")], [1, 1]);
      c.ensure(P);
      c.state("PAID");
      c.eq("restored, not fresh", c.mem().receipt?.orderId, "o1");
      c.eq("one charge", c.reqs("pay").length, 1);
    },
  },
  {
    // A non-persisted shared actor: kept while its write is out, gone a grace after it lands, nothing kept, and the next ensure is fresh.
    id: "LIFE-02",
    kind: "example",
    fixtures: [issuesFixture],
    actor: L,
    cites: ["rule:73", "sec:2.7.17"],
    variants: {
      "kept-until-its-write-lands-then-gone"(c) {
        c.ensure(L);
        c.to(L, "Toggle", { id: "i1", liked: true });
        c.detach(L);
        c.advance(GRACE);
        c.state("READY", L);
        c.answer("like", { apply: true });
        c.state("READY", L);
        c.advance(GRACE);
        c.eq("gone a grace after the write landed", c.r.state(L), undefined);
        c.eq("its ending was heard first", delivered(c, "like"), 1);
        c.eq("nothing kept", c.record(L), undefined);
        c.ensure(L);
        c.state("READY", L);
        c.eq("a fresh incarnation", c.r.evidence("initial").length, 2);
        c.eq("one request", c.reqs("like").length, 1);
      },
      "free-with-no-uses-is-gone-after-the-grace"(c) {
        c.ensure(L);
        c.detach(L);
        c.state("READY", L);
        c.advance(GRACE);
        c.eq("gone", c.r.state(L), undefined);
        c.eq("nothing kept", c.record(L), undefined);
      },
    },
  },
  {
    // The send table's "ended, persisted, record decodes" row: restored (Return), delivered last, in the order sent. CardChosen then
    // PayRequested: in order, the card is visa. A fresh start would charge intent "". It has no use, so it ends again once free.
    id: "LIFE-03",
    kind: "example",
    fixtures: [payFixture],
    actor: P,
    cites: ["rule:73", "sec:2.7.17", "C105"],
    run(c0) {
      const c = toCard(c0);
      c.detach(P);
      c.advance(GRACE);
      c.eq("ended", c.r.state(P), undefined);
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
      c.eq("no use and free again: ended again", c.r.state(P), undefined);
      c.eq("two ends", gaps(c, P), 2);
    },
  },
  {
    // The grace: a detach then an ensure in one task (Strict Mode), or within the grace (a route change), keeps the same incarnation. Uses count.
    id: "LIFE-04",
    kind: "example",
    fixtures: [payFixture],
    actor: P,
    cites: ["rule:73", "sec:2.7.17", "C109"],
    variants: {
      "detach-then-ensure-in-one-task-ends-nothing"(c0) {
        const c = toCard(c0);
        c.h.raw({ detach: P });
        c.ensure(P);
        c.advance(GRACE);
        c.state("CARD");
        c.eq("never absent", gaps(c, P), 0);
      },
      "an-ensure-within-the-grace-keeps-the-incarnation-and-past-it-ends"(c0) {
        const c = toCard(c0);
        c.detach(P);
        c.advance(GRACE - 1);
        c.ensure(P);
        c.advance(GRACE);
        c.state("CARD");
        c.eq("never absent", gaps(c, P), 0);
        c.eq("its memory is the same incarnation's", c.mem().intentId, "pi1");
        c.detach(P);
        c.advance(GRACE - 1);
        c.state("CARD");
        c.advance(1);
        c.eq("ended once the grace has passed", c.r.state(P), undefined);
      },
      "one-of-two-uses-ending-keeps-it"(c0) {
        const c = toCard(c0);
        c.ensure(P);
        c.detach(P);
        c.advance(GRACE);
        c.state("CARD");
        c.detach(P);
        c.advance(GRACE);
        c.eq("the last use ends it", c.r.state(P), undefined);
      },
    },
  },
  {
    // A parked ending keeps nothing. Notes' d1 copy is removed while its save is out; the unplaced lane is InFlight, so it keeps Notes until
    // the failure lands and is parked for the path (rule 53). Then free, Notes ends after the grace. Notes is persisted, so the parked ending
    // stays on its lane record (rule 44), and the next incarnation's d1 copy hears it once.
    id: "LIFE-05",
    kind: "example",
    fixtures: [notesFixture],
    actor: N,
    cites: ["rule:73", "rule:44", "rule:53"],
    run(c) {
      c.ensure(N);
      c.send("SetDocs", { docs: ["d1"] });
      c.into(["docs:d1"], "Edited", { body: "mine" });
      c.ack();
      c.send("SetDocs", { docs: [] });
      c.detach(N);
      c.advance(GRACE);
      c.state("READY");
      c.answer("save", { fail: { tag: "Conflict" } });
      c.state("READY");
      c.advance(GRACE);
      c.eq("gone: a parked ending keeps nobody", c.r.state(N), undefined);
      c.eq("not heard yet", delivered(c, "save"), 0);
      c.ensure(N);
      c.send("SetDocs", { docs: ["d1"] });
      c.eq("the next incarnation's copy hears it once", delivered(c, "save"), 1);
      c.eq("as the conflict it was", c.inner(["docs:d1"])?.memory.status, "conflict");
    },
  },
  {
    // Held keeps nothing (rule 44 hands it off). Issues' like is unknown and held; its use goes; the actor ends after the grace, the hold is
    // unbound, and the next incarnation hears unknown { Restored } once.
    id: "LIFE-06",
    kind: "example",
    fixtures: [issuesFixture],
    actor: L,
    cites: ["rule:73", "rule:44"],
    run(c) {
      c.ensure(L);
      c.to(L, "Toggle", { id: "i1", liked: true });
      c.answer("like", { lost: true });
      c.answer("repair", { truth: true });
      c.detach(L);
      c.advance(GRACE);
      c.eq("gone, holding", c.r.state(L), undefined);
      c.yes("the hold is unbound", c.r.quiet().waits.some((w) => w.kind === "held" && w.owner === "unbound"));
      c.ensure(L);
      c.eq("handed off once, Restored", c.endings("like").filter((e) => e["reason"] === "Restored").length, 1);
    },
  },
  {
    // An armed schedule keeps nothing. Bare arms a one-second deadline in T and its use goes: it ends after the grace, and the deadline stays
    // with its persisted record; restored after it was due, the overdue one fires once (Machines O5, C124).
    id: "LIFE-07",
    kind: "example",
    fixtures: [serialBareFixture()],
    actor: S,
    cites: ["rule:73", "sec:2.7.17", "C124"],
    run(c0) {
      const c = new Ctx(c0.fresh([serialBareFixture()]), S);
      c.ensure(S);
      c.send("Arm");
      c.state("T");
      c.detach(S);
      c.advance(GRACE);
      c.eq("gone with its deadline armed", c.r.state(S), undefined);
      c.yes("its record kept", c.record(S) !== undefined);
      c.advance(2_000);
      c.ensure(S);
      c.advance(0);
      c.state("A");
      c.eq("the overdue deadline fired once", c.mem().fired, 1);
    },
  },
  {
    // Inverted by OD31: mail is no use and does not restart the grace. A send at 60 ms is delivered to the same incarnation, and the actor
    // ends at 100 ms after the detach, not 160 ms.
    id: "LIFE-08",
    kind: "example",
    fixtures: [payFixture],
    actor: P,
    cites: ["rule:73", "sec:2.7.17"],
    run(c0) {
      const c = toCard(c0);
      c.detach(P);
      c.advance(60);
      c.send("CardChosen", { paymentMethodId: "mc" });
      c.eq("the same incarnation heard it", c.mem().paymentMethodId, "mc");
      c.advance(GRACE - 60 - 1);
      c.state("CARD");
      c.advance(1);
      c.eq("ended at the grace from the detach", c.r.state(P), undefined);
      c.eq("one incarnation", c.incarnations(P), 1);
    },
  },
  {
    // The send table's "no record" row: a send to an ended non-persisted target is SendTargetAbsent { NoRecord }; nothing is created or sent.
    id: "LIFE-09",
    kind: "example",
    fixtures: [issuesFixture],
    actor: L,
    cites: ["rule:73", "C105"],
    namedIssues: ["SendTargetAbsent"],
    run(c) {
      c.ensure(L);
      c.detach(L);
      c.advance(GRACE);
      c.eq("gone", c.r.state(L), undefined);
      c.to(L, "Toggle", { id: "i1", liked: true });
      c.eq("not created", c.r.state(L), undefined);
      c.eq("no request", c.reqs("like").length, 0);
      c.eq(
        "said, with its reason",
        c.r.issues().filter((i) => i.code === "SendTargetAbsent").map((i) => i.input),
        [{ reason: "NoRecord" }],
      );
    },
  },
  {
    // C108: an ensure of an ended persisted identity reads the Runtime's copy. Every publication of Pay after it comes back shows CARD with its
    // intent, never IDLE's initial memory.
    id: "LIFE-10",
    kind: "example",
    fixtures: [payFixture],
    actor: P,
    cites: ["rule:73", "C108"],
    run(c0) {
      const c = toCard(c0);
      c.detach(P);
      c.advance(GRACE);
      c.eq("ended", c.r.state(P), undefined);
      const from = c.r.frames().length;
      c.ensure(P);
      const seen = c.r.frames().slice(from).map((f) => (f.view as Record<string, { state: string; memory: { intentId?: string } } | undefined>)[c.r.actorKey(P)]).filter((v) => v !== undefined);
      c.yes("published again", seen.length > 0);
      c.eq("no flash of initial", seen.map((v) => [v!.state, v!.memory.intentId]), seen.map(() => ["CARD", "pi1"]));
    },
  },
  ...newLifetimeScenarios(),
];

// ── Round 14: LIFE-11..30 (proposal-v5 11.3, proposal-v6 7.1). Every expectation is 2.7.17's text, worked by hand.
function newLifetimeScenarios(): Scenario[] {
  const X = { actor: LifeId, id: "a" };
  const log = (c: Ctx) => (c.r.memory(X) as { log?: readonly string[] } | undefined)?.log;
  const onLife = (c0: Ctx, o: { persisted?: boolean; local?: boolean } = {}) => new Ctx(c0.fresh([lifeFixture(o)]), X);
  // A persisted commit waits for its durable record, then goes (2.7.13); a non-persisted one goes at once.
  const confirm = (c: Ctx, persisted: boolean) => {
    c.send("Confirm");
    if (persisted) c.ack();
    c.eq("on the wire", c.reqs("confirm").length, 1);
  };
  return [
    {
      // A chain of three (rule 73's "work in flight"): the screen leaves mid-confirm. The InFlight confirm keeps the actor; `Confirmed`'s
      // cart read is started in a kept turn, so it keeps; its answer commits `place`, which keeps. One incarnation throughout, then it ends.
      id: "LIFE-11",
      kind: "example",
      fixtures: [lifeFixture({ persisted: false })],
      actor: X,
      cites: ["rule:73", "sec:2.7.17", "C109"],
      run(c0) {
        const c = onLife(c0, { persisted: false });
        c.ensure(X);
        confirm(c, false);
        c.detach(X);
        c.advance(GRACE);
        c.state("CONFIRMING", X);
        c.answer("confirm", { ok: {} });
        c.state("REFRESHING", X);
        c.advance(GRACE);
        c.state("REFRESHING", X);
        c.answer("cart", { ok: {} });
        c.state("PLACING", X);
        c.advance(GRACE);
        c.state("PLACING", X);
        c.answer("place", { ok: {} });
        c.state("DONE", X);
        c.eq("each step heard by the incarnation that started it", log(c), ["confirmed", "cart", "placed"]);
        c.eq("one incarnation", c.incarnations(X), 1);
        c.advance(GRACE);
        c.eq("free at last: ended", c.r.state(X), undefined);
        c.eq("nothing kept: not persisted", c.record(X), undefined);
      },
    },
    {
      // Write, read, write, persisted: a kept read keeps however long it takes, and the record holds the whole chain after the end.
      id: "LIFE-12",
      kind: "example",
      fixtures: [lifeFixture()],
      actor: X,
      cites: ["rule:73", "sec:2.7.17"],
      run(c0) {
        const c = onLife(c0);
        c.ensure(X);
        confirm(c, true);
        c.detach(X);
        c.answer("confirm", { ok: {} });
        c.advance(10_000);
        c.state("REFRESHING", X);
        c.eq("the kept read is listed as work in flight", c.r.inspect(X)?.busy, ["read:cart"]);
        c.answer("cart", { ok: {} });
        c.ack();
        c.answer("place", { ok: {} });
        c.state("DONE", X);
        c.advance(GRACE);
        c.eq("ended", c.r.state(X), undefined);
        c.ensure(X);
        c.eq("restored with the chain", log(c), ["confirmed", "cart", "placed"]);
        c.eq("two incarnations: the one that worked, and the return", c.incarnations(X), 2);
      },
    },
    {
      // A read not started by a kept turn keeps nothing: a press's read is cut by the end, and its answer reaches nobody.
      id: "LIFE-13",
      kind: "example",
      fixtures: [lifeFixture()],
      actor: X,
      cites: ["rule:73", "sec:2.7.17"],
      variants: {
        // Kept as it is (round 14 review): this pins a design hole. The stopped unkept read leaves the persisted actor restored in LOOKING with no
        // read running and nothing to move it: hung on return. 2.7.17 does not say what a return does about a read the end stopped; do not change
        // this case until the design decides.
        "a-pressed-read-is-cut-by-the-end"(c0) {
          const c = onLife(c0);
          c.ensure(X);
          c.send("Look");
          c.detach(X);
          c.advance(GRACE);
          c.eq("ended with its read open", c.r.state(X), undefined);
          c.tryAnswer("look", { ok: {} });
          c.ensure(X);
          c.eq("the next incarnation heard nothing of it", log(c), []);
          c.state("LOOKING", X);
        },
        "a-read-a-send-restore-starts-is-cut-too"(c0) {
          const c = onLife(c0);
          c.ensure(X);
          c.detach(X);
          c.advance(GRACE);
          c.eq("ended", c.r.state(X), undefined);
          c.to(X, "Look");
          c.state("LOOKING", X);
          c.advance(GRACE);
          c.eq("no use, and the read keeps nothing: ended again", c.r.state(X), undefined);
          c.eq("two ends", ends(c, X), 2);
        },
      },
    },
    {
      // Schedules wait while nothing uses the actor (C124). A 50 ms debounce after the detach never fires in the grace; at the end a
      // non-persisted actor loses it and a persisted one keeps it, fired once at the next ensure; a use back within the grace fires it once.
      id: "LIFE-14",
      kind: "example",
      fixtures: [lifeFixture()],
      actor: X,
      cites: ["rule:73", "sec:2.7.17", "C124"],
      variants: {
        "not-persisted-the-debounce-is-lost"(c0) {
          const c = onLife(c0, { persisted: false });
          c.ensure(X);
          c.send("Edit");
          c.detach(X);
          c.advance(60);
          c.eq("due, and it waits", log(c), []);
          c.eq("waiting", c.r.inspect(X)?.waiting, ["save"]);
          c.advance(GRACE);
          c.eq("ended", c.r.state(X), undefined);
          c.ensure(X);
          c.advance(1_000);
          c.eq("never fired: a fresh start", [log(c), c.reqs("save").length], [[], 0]);
        },
        "persisted-it-fires-once-at-the-next-ensure"(c0) {
          const c = onLife(c0);
          c.ensure(X);
          c.send("Edit");
          c.detach(X);
          c.advance(GRACE);
          c.eq("ended, deadline waiting in the record", c.r.state(X), undefined);
          c.eq("no save yet", c.reqs("save").length, 0);
          c.advance(5_000);
          c.ensure(X);
          c.advance(0);
          c.eq("fired once, late", log(c), ["saveDue"]);
          c.ack();
          c.eq("one save", c.reqs("save").length, 1);
        },
        // Only the latest arming waits (round 14 review M1): a send in the grace re-arms the debounce, so the waiting deadline goes; when the use
        // returns nothing is overdue, and the re-armed one fires once, at its own deadline.
        "a-re-armed-debounce-drops-the-waiting-deadline"(c0) {
          const c = onLife(c0);
          c.ensure(X);
          c.send("Edit");
          c.detach(X);
          c.advance(60);
          c.eq("waiting", c.r.inspect(X)?.waiting, ["save"]);
          c.send("Edit");
          c.eq("re-armed, nothing waits", c.r.inspect(X)?.waiting, []);
          c.advance(10);
          c.ensure(X);
          c.eq("the old deadline does not fire", log(c), []);
          c.advance(40);
          c.eq("the re-armed one fires once", log(c), ["saveDue"]);
        },
        "a-use-back-in-the-grace-fires-it-once"(c0) {
          const c = onLife(c0);
          c.ensure(X);
          c.send("Edit");
          c.detach(X);
          c.advance(60);
          c.eq("waits", log(c), []);
          c.ensure(X);
          c.eq("fired once on the use's return", log(c), ["saveDue"]);
          c.advance(GRACE);
          c.eq("the same incarnation", c.incarnations(X), 1);
        },
      },
    },
    {
      // A heartbeat whose write outlasts its period: after the detach the next tick waits; the ping on the wire keeps the actor; when it
      // returns the actor is free, the waiting tick never fires, and it ends.
      id: "LIFE-15",
      kind: "example",
      fixtures: [lifeFixture({ persisted: false })],
      actor: X,
      cites: ["rule:73", "sec:2.7.17"],
      run(c0) {
        const c = onLife(c0, { persisted: false });
        c.ensure(X);
        c.send("Beat");
        c.advance(30);
        c.eq("one beat, one ping out", [log(c), c.reqs("ping").length], [["beat"], 1]);
        c.detach(X);
        c.advance(500);
        c.eq("kept by the ping; the next tick waits", [c.r.state(X), log(c)], ["BEAT", ["beat"]]);
        c.answer("ping", { ok: {} });
        c.eq("the same incarnation hears it", log(c), ["beat", "pinged"]);
        c.advance(GRACE);
        c.eq("ended; the waiting tick never fired", [c.r.state(X), c.reqs("ping").length], [undefined, 1]);
      },
    },
    {
      // The grace's fence: an expiry whose deadline is not the armed one does nothing. A use comes back at 50 ms and goes at once; the
      // first timer fires anyway (a cancel lost the race), and the actor ends only at the second deadline.
      id: "LIFE-16",
      kind: "example",
      fixtures: [lifeFixture({ persisted: false })],
      actor: X,
      cites: ["rule:73", "sec:2.7.17"],
      run(c0) {
        const c = onLife(c0, { persisted: false });
        c.ensure(X);
        c.detach(X);
        c.advance(50);
        c.fault({ lateCancel: 1 });
        c.ensure(X);
        c.detach(X);
        c.advance(50);
        c.state("IDLE", X);
        c.advance(49);
        c.state("IDLE", X);
        c.advance(1);
        c.eq("ended at the armed deadline", c.r.state(X), undefined);
      },
    },
    {
      // Held keeps nothing, and unknown { Restored } is heard once per incarnation: each return after an end is a new one (rule 44, C126).
      id: "LIFE-17",
      kind: "example",
      fixtures: [lifeFixture()],
      actor: X,
      cites: ["rule:73", "rule:44", "C126"],
      run(c0) {
        const c = onLife(c0);
        c.ensure(X);
        confirm(c, true);
        c.answer("confirm", { lost: true });
        c.eq("held", log(c), ["confirmUnsure"]);
        for (let i = 0; i < 2; i++) {
          c.detach(X);
          c.advance(GRACE);
          c.eq("held keeps nothing: ended", c.r.state(X), undefined);
          c.ensure(X);
        }
        c.eq("Restored once per return", c.endings("confirm").filter((e) => e["reason"] === "Restored").length, 2);
        c.eq("heard by each incarnation", log(c), ["confirmUnsure", "confirmUnsure", "confirmUnsure"]);
      },
    },
    {
      // Ready (C106): a record no lane owes stays a record at ready, and a handle reads it; one whose lane was InFlight at capture is restored
      // live, hears unknown { Restored }, then, with no use, ends.
      id: "LIFE-18",
      kind: "example",
      fixtures: [lifeFixture()],
      actor: X,
      cites: ["rule:73", "C106"],
      variants: {
        "a-plain-record-stays-a-record"(c0) {
          const c = onLife(c0);
          c.ensure(X);
          c.send("Look");
          c.answer("look", { ok: {} });
          c.do({ hide: true });
          c.detach(X);
          c.reload();
          c.eq("not live", c.r.state(X), undefined);
          c.eq("the handle reads the record", c.snap(X), { lifecycle: "active", state: "IDLE", memory: { log: ["looked"], blob: null } });
          c.to(X, "Look");
          c.eq("a send restores it", [c.r.state(X), log(c)], ["LOOKING", ["looked"]]);
        },
        "owed-an-ending-it-is-woken"(c0) {
          const c = onLife(c0);
          c.ensure(X);
          confirm(c, true);
          c.detach(X);
          c.reload();
          c.eq("woken at ready, heard Restored", log(c), ["confirmUnsure"]);
          c.advance(GRACE);
          c.eq("then ended", c.r.state(X), undefined);
        },
      },
    },
    {
      // The record at the end, and reads that follow the identity (2.7.17 Reads): an ended persisted identity reads as its record (active),
      // an ended non-persisted one as its terminal snapshot (disposed), one never created as the pre-attach snapshot.
      id: "LIFE-21",
      kind: "example",
      fixtures: [lifeFixture()],
      actor: X,
      cites: ["rule:73", "C108"],
      variants: {
        "persisted-reads-its-record"(c0) {
          const c = onLife(c0);
          c.eq("never created", c.snap(X), { lifecycle: "pre-attach" });
          c.ensure(X);
          c.send("Look");
          c.answer("look", { ok: {} });
          c.detach(X);
          c.advance(GRACE);
          c.eq("ended", c.r.state(X), undefined);
          c.yes("its record is on disk, encoded in the end step", c.record(X) !== undefined);
          c.eq("the handle reads the record, never initial", c.snap(X), { lifecycle: "active", state: "IDLE", memory: { log: ["looked"], blob: null } });
        },
        "not-persisted-reads-its-terminal-snapshot"(c0) {
          const c = onLife(c0, { persisted: false });
          c.ensure(X);
          c.send("Look");
          c.answer("look", { ok: {} });
          c.detach(X);
          c.advance(GRACE);
          c.eq("terminal", c.snap(X), { lifecycle: "disposed", state: "IDLE", memory: { log: ["looked"], blob: null } });
        },
      },
    },
    {
      // An unencodable record (Persistence O5): memory that really cannot encode (a bigint, as HIGH-02's), so the record the end step encodes
      // with the driver's codec fails. The end waits, retried at each expiry, the diagnostic once; once the memory encodes again, it ends.
      id: "LIFE-22",
      kind: "example",
      fixtures: [lifeFixture()],
      actor: X,
      cites: ["rule:73", "sec:2.7.17"],
      namedIssues: ["RecordUnencodable", "UnencodableValue"],
      run(c0) {
        const c = onLife(c0);
        c.ensure(X);
        c.send("Poison");
        c.detach(X);
        c.advance(GRACE);
        c.state("IDLE", X);
        c.advance(GRACE);
        c.state("IDLE", X);
        c.eq("said once", c.r.issues().filter((i) => i.code === "RecordUnencodable").length, 1);
        c.send("Heal");
        c.advance(GRACE);
        c.eq("ended once it encodes", c.r.state(X), undefined);
        c.eq("one end", ends(c, X), 1);
      },
    },
    {
      // The send table's rows this runtime can reach (2.7.17 Sends): disposed (`disposeActor`) has no record; a record that does not decode
      // is RecordUndecodable and stays for an ensure, which discards it (RestoreDiscarded) and creates from input.
      id: "LIFE-23",
      kind: "example",
      fixtures: [lifeFixture()],
      actor: X,
      cites: ["rule:73", "C105"],
      namedIssues: ["SendTargetAbsent", "RecordQuarantined"],
      variants: {
        "disposed-is-no-record"(c0) {
          const c = onLife(c0);
          c.ensure(X);
          c.dispose(X);
          c.eq("its record is removed", c.record(X), undefined);
          c.to(X, "Look");
          c.eq("not created", c.r.state(X), undefined);
          c.eq("why", c.r.issues().filter((i) => i.code === "SendTargetAbsent").map((i) => i.input), [{ reason: "NoRecord" }]);
        },
        "undecodable-then-an-ensure-discards-it"(c0) {
          const c = onLife(c0);
          c.ensure(X);
          c.send("Look");
          c.answer("look", { ok: {} });
          c.do({ hide: true });
          c.detach(X);
          c.fault({ corruptStored: { match: "actor/", edit: () => "{{{" } });
          c.reload();
          c.to(X, "Look");
          c.eq("dropped", c.r.state(X), undefined);
          c.eq("why", c.r.issues().filter((i) => i.code === "SendTargetAbsent").map((i) => i.input), [{ reason: "RecordUndecodable" }]);
          c.ensure(X);
          c.eq("discarded and created from input", [c.r.evidence("RestoreDiscarded").length, log(c)], [1, []]);
        },
      },
    },
    {
      // Uses by kind (rule 73, OD27 Q2): a host ensure is no use; a subscription is; on an identity with no actor it waits, and the create
      // finds it held, in either order.
      id: "LIFE-24",
      kind: "example",
      fixtures: [lifeFixture({ persisted: false })],
      actor: X,
      cites: ["rule:73", "C105"],
      variants: {
        "a-host-ensure-alone-keeps-nothing"(c0) {
          const c = onLife(c0, { persisted: false });
          c.do({ hostEnsure: X });
          c.advance(GRACE);
          c.eq("ended", c.r.state(X), undefined);
        },
        "subscribe-then-ensure-keeps"(c0) {
          const c = onLife(c0, { persisted: false });
          c.do({ subscribe: X });
          c.eq("nothing created", c.r.state(X), undefined);
          c.do({ hostEnsure: X });
          c.advance(GRACE * 5);
          c.eq("the waiting subscription holds it", [c.r.state(X), c.r.inspect(X)?.uses], ["IDLE", ["host"]]);
          c.do({ unsubscribe: X });
          c.advance(GRACE);
          c.eq("its end ends it", c.r.state(X), undefined);
        },
        "ensure-then-subscribe-in-one-task-keeps"(c0) {
          const c = onLife(c0, { persisted: false });
          c.h.raw({ hostEnsure: X });
          c.do({ subscribe: X });
          c.advance(GRACE * 5);
          c.state("IDLE", X);
        },
      },
    },
    {
      // Local actors (2.7.17 Scope, React O3): a mounted local actor gets the in-flight exception, and a remount of an equal identity while
      // the old one is kept only by work disposes it at once; the new one adopts the lane and hears the ending.
      id: "LIFE-27",
      kind: "example",
      fixtures: [lifeFixture({ local: true })],
      actor: X,
      cites: ["rule:73", "sec:2.7.17", "C108"],
      variants: {
        "unmounted-mid-confirm-it-finishes-the-chain"(c0) {
          const c = onLife(c0, { local: true });
          c.do({ mount: X });
          confirm(c, false);
          c.do({ unmount: X });
          c.advance(GRACE);
          c.state("CONFIRMING", X);
          c.answer("confirm", { ok: {} });
          c.answer("cart", { ok: {} });
          c.answer("place", { ok: {} });
          c.eq("one incarnation placed it", [log(c), c.incarnations(X)], [["confirmed", "cart", "placed"], 1]);
          c.advance(GRACE);
          c.eq("then ended", c.r.state(X), undefined);
        },
        "a-remount-while-kept-adopts-the-ending"(c0) {
          const c = onLife(c0, { local: true });
          c.do({ mount: X });
          confirm(c, false);
          c.do({ unmount: X });
          c.advance(GRACE);
          c.do({ mount: X });
          c.eq("the old one disposed at once, a new incarnation", [c.r.evidence("remounted").length, c.incarnations(X), c.r.state(X)], [1, 2, "IDLE"]);
          c.answer("confirm", { ok: {} });
          c.eq("the remounted screen hears it", log(c), ["confirmed"]);
          c.state("REFRESHING", X);
        },
      },
    },
    {
      // T3's parking path (proposal-v5 11.3): Runtime disposal with the commit on the wire; within the bound its ending (unknown, as Runtime O6
      // interrupts it) is parked; at the reload the identity, which no use holds, is owed it and is woken at ready; delivered once; then,
      // with no use, it ends.
      id: "LIFE-28",
      kind: "example",
      fixtures: [lifeFixture()],
      actor: X,
      cites: ["rule:73", "rule:44", "C106"],
      run(c0) {
        const c = onLife(c0);
        c.ensure(X);
        confirm(c, true);
        c.detach(X);
        c.do({ disposeRuntime: true });
        c.tryAnswer("confirm", { ok: {} });
        c.reload();
        c.eq("woken at ready, heard once", log(c), ["confirmUnsure"]);
        c.eq("delivered once", delivered(c, "confirm"), 1);
        c.advance(GRACE);
        c.eq("then ended", c.r.state(X), undefined);
      },
    },
    {
      // `EndedWithWork` (2.7.17 Diagnostics): once per machine and kind of work per Runtime; none for an end with nothing live.
      id: "LIFE-29",
      kind: "example",
      fixtures: [lifeFixture({ persisted: false })],
      actor: X,
      cites: ["rule:73", "C125"],
      run(c0) {
        const c = onLife(c0, { persisted: false });
        c.ensure(X);
        c.detach(X);
        c.advance(GRACE);
        c.eq("nothing live: no warning", c.r.evidence("EndedWithWork").length, 0);
        for (let i = 0; i < 2; i++) {
          c.ensure(X);
          c.send("Edit");
          c.detach(X);
          c.advance(GRACE);
          c.eq("ended", c.r.state(X), undefined);
        }
        c.eq("once for the schedule; not persisted, so its deadline is lost", c.r.evidence("EndedWithWork").map((e) => [e["work"], e["persisted"]]), [["schedule", false]]);
        c.eq("each end lists what it stopped", c.r.evidence("ended").map((e) => e["stopped"]), [[], ["schedule:save"], ["schedule:save"]]);
      },
    },
    {
      // A create soon after an end (2.7.17 Diagnostics): within 5 s it carries how long ago; at 5 s it does not.
      id: "LIFE-30",
      kind: "example",
      fixtures: [lifeFixture({ persisted: false })],
      actor: X,
      cites: ["rule:73", "C111"],
      run(c0) {
        const c = onLife(c0, { persisted: false });
        c.ensure(X);
        c.detach(X);
        c.advance(GRACE);
        c.advance(340);
        c.ensure(X);
        c.eq("marked with its age", c.r.evidence("createdSoonAfterEnd").map((e) => e["ms"]), [340]);
        c.detach(X);
        c.advance(GRACE);
        c.advance(5_000);
        c.ensure(X);
        c.eq("at 5 s, no mark", c.r.evidence("createdSoonAfterEnd").length, 1);
      },
    },
  ];
}
