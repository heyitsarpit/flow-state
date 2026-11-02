// Round 8: make the edge and the tests trustworthy. Worked out by hand from the review's traces, reproduced before they were believed, and convergence-8's decisions. D96-D106 are proposed.
import { Effect } from "effect";
import { chatFixture } from "../fixtures/chat.compiled.ts";
import { refundsFixture } from "../fixtures/refunds.compiled.ts";
import { bareFixture, BareId } from "../fixtures/round7.compiled.ts";
import { businessKeyFixture, copiesFixture, CopiesId, doorsFixture, DoorsId, loopFixture, LoopId, serialBareFixture } from "../fixtures/round8.compiled.ts";
import type { Fixture } from "../harness.ts";
import { Ctx, type Scenario } from "./ctx.ts";

const A = { actor: BareId, id: "a" };
const B = { actor: BareId, id: "b" };
const KEY = `lane/${A.actor}/${A.id}|charge|{}`;
const ACTOR = `actor/${A.actor}/${A.id}`;
const LATER = { captureMs: 2_000_000_000 };
const on = (c0: Ctx, f: Fixture, bounds?: Record<string, number>, a = A) => {
  const c = new Ctx(c0.fresh([f], bounds), a);
  c.namedIssues = c0.namedIssues;
  c.ensure();
  return c;
};
const disk = (c: Ctx, k: string) => c.r.stored().get(k) as any;
const noteOn = (c: Ctx) => disk(c, ACTOR)?.root.memory.note ?? "";
const batches = (c: Ctx) => c.r.outside().batches;
const actorBatches = (c: Ctx, k = ACTOR) => batches(c).filter((b) => b.writes.some((w) => w.key === k));
const held = (c: Ctx) => c.r.row(A, "charge", {})?.uncertain;
// A batch out, so what follows queues behind it. `Go, Go` then merge on one key: the review's H1.
const twoBehindABatchOut = (c: Ctx, go = () => c.send("Go")) => {
  c.send("Note", { text: "x" });
  c.do({ holdPlain: true });
  c.do({ hide: true });
  go();
  go();
};

export const round8Scenarios: readonly Scenario[] = [
  {
    id: "REV8-H1",
    kind: "fault",
    fixtures: [serialBareFixture()],
    actor: A,
    cites: ["D96", "D26", "O6"],
    variants: {
      // The review's trace, `Note holdPlain FLUSH Go Go ack ack KILL Go`: the lane on disk said "not acknowledged" while att-1 was at the server.
      "a-plain-write-behind-a-ticket-cannot-unsay-a-send"(c0) {
        const c = on(c0, serialBareFixture(), LATER);
        twoBehindABatchOut(c);
        c.ack();
        c.ack();
        c.eq("at the server", c.reqs("charge").length, 1);
        c.reload();
        c.eq("a hold", held(c), true);
        c.eq("unknown, not NotSent", c.endings("charge").find((e) => e["attempt"] === c.reqs("charge")[0]!.idempotencyKey && e["reason"] === "Restored")?.["channel"], "unknown");
        c.do({ holdPlain: false });
        c.send("Go");
        c.do({ storage: "ack" });
        c.eq("no second key beside an undecided first", c.keys("charge").length, 1);
      },
      // H1's real shape: the store goes slow only after the ticket's ack, so the next batch is still out at the kill.
      "the-same-with-a-store-that-goes-slow-after-the-ack"(c0) {
        const c = on(c0, serialBareFixture(), LATER);
        twoBehindABatchOut(c);
        c.do({ holdPlain: false });
        c.do({ slowAfterAck: true });
        c.ack();
        c.ack();
        c.eq("the second batch landed before the send", c.reqs("charge").length, 1);
        c.reload();
        c.eq("a hold", held(c), true);
        c.eq("no NotSent for what left", c.r.evidence("ending").filter((e) => e["attempt"] === c.reqs("charge")[0]!.idempotencyKey && e["channel"] === "failure").length, 0);
      },
      // `Checkout/Refunds`, which the review only read: persisted, serialize, no plain memory of its own. A ticket on another charge is the batch out.
      "checkout-refunds-does-not-send-a-second-key"(c0) {
        const M = { actor: "Checkout/Refunds", id: "merchant-1" };
        const c = new Ctx(c0.fresh([refundsFixture], LATER), M);
        c.namedIssues = c0.namedIssues;
        c.ensure();
        const ask = (chargeId: string) => c.to(M, "RefundAsked", { orderId: `o-${chargeId}`, chargeId, amountCents: 1 });
        ask("ch0"); // its ticket is the batch out
        ask("ch1");
        ask("ch1"); // merges: head and one behind
        c.do({ holdPlain: true });
        c.ack(); // ch0's batch; ch1's goes out, with its ticket
        c.ack(); // ch1's: a request leaves; what follows stays out
        const keys = () => c.reqs("refund").filter((q) => q.input.chargeId === "ch1").map((q) => q.idempotencyKey);
        c.eq("one send on ch1", keys().length, 1);
        c.reload();
        c.do({ holdPlain: false });
        ask("ch1");
        c.do({ storage: "ack" });
        c.do({ storage: "ack" });
        c.eq("no second key on ch1", [...new Set(keys())].length, 1);
        c.eq("what is restored is unknown, and may resend under its own key", c.r.evidence("ending").find((e) => e["attempt"] === keys()[0] && e["reason"] === "Restored")?.["channel"], "unknown");
      },
      // What `acked` was also for: `W` truly never left.
      "a-queued-commit-still-restores-not-sent"(c0) {
        const c = on(c0, serialBareFixture(), LATER);
        c.send("Go");
        c.send("Go");
        c.ack();
        c.do({ hide: true });
        c.eq("both on disk", [!!disk(c, KEY)?.head, disk(c, KEY)?.w.length], [true, 1]);
        const [first, second] = [disk(c, KEY).head.id, disk(c, KEY).w[0].id];
        c.reload();
        const of = (id: string) => c.r.evidence("ending").find((e) => e["attempt"] === id && e["reason"] !== undefined);
        c.eq("the head may have left", [of(first)?.["channel"], of(first)?.["reason"]], ["unknown", "Restored"]);
        c.eq("W never did", [of(second)?.["channel"], of(second)?.["reason"]], ["failure", "Restored"]);
      },
      // A refusal is known: the store said no. It leaves no hold, kill or no kill.
      "a-refused-first-send-leaves-no-hold"(c0) {
        c0.namedIssues.push("StorageFailure");
        const c = on(c0, serialBareFixture(), LATER);
        c.send("Go");
        c.do({ storage: "refuse" });
        c.eq("declined", c.lastEnding("charge")?.["reason"], "StorageRefused");
        c.eq("no request", c.reqs("charge").length, 0);
        c.do({ hide: true });
        c.reload();
        c.eq("no lane on disk", disk(c, KEY), undefined);
        c.yes("no hold", !held(c));
        c.send("Go");
        c.ack();
        c.eq("a press sends", c.reqs("charge").length, 1);
      },
      // A refused head with one behind: the one behind becomes the head, and that is a first send.
      "a-refused-head-promotes-what-waits"(c0) {
        c0.namedIssues.push("StorageFailure");
        const c = on(c0, serialBareFixture(), LATER);
        c.send("Go");
        c.send("Go");
        c.do({ storage: "refuse" });
        c.ack();
        c.eq("the one behind went", c.reqs("charge").length, 1);
      },
      // Pessimistic, stated: the batch landed and nobody heard. Sent or not, nobody knows.
      // D107, review M1: `Go Go ack KILL`. `W`'s answer ran over the hold's prompt, and left `U`.
      "a-restored-hold-is-the-last-route"(c0) {
        const c = on(c0, serialBareFixture());
        c.send("Go");
        c.send("Go");
        c.ack();
        c.reload();
        c.state("U");
        c.eq("a hold", held(c), true);
      },
      "a-landed-ticket-nobody-heard-is-a-hold"(c0) {
        const c = on(c0, serialBareFixture(), LATER);
        c.send("Go");
        c.do({ storage: "landNoAck" });
        c.reload();
        c.eq("a hold", held(c), true);
        c.eq("unknown", c.lastEnding("charge")?.["channel"], "unknown");
      },
      // The bit that could lie is gone from the record.
      "a-head-on-disk-has-no-acknowledged-bit"(c0) {
        const c = on(c0, serialBareFixture(), LATER);
        c.send("Go");
        c.ack();
        c.do({ hide: true });
        c.yes("a head", !!disk(c, KEY)?.head);
        c.eq("no bit", "acked" in disk(c, KEY).head, false);
      },
      // Oracle (h)'s meaning, per case: when a request starts, its Attempt is the head on disk.
      "a-request-starts-with-its-attempt-the-head-on-disk"(c0) {
        const c = on(c0, serialBareFixture(), LATER);
        twoBehindABatchOut(c);
        c.ack();
        c.ack();
        c.eq("the head on disk is the one at the server", disk(c, KEY).head.id, c.reqs("charge")[0]!.idempotencyKey);
      },
    },
  },
  {
    id: "REV8-M2",
    kind: "fault",
    fixtures: [serialBareFixture()],
    actor: A,
    cites: ["D97", "D80"],
    namedIssues: ["StorageFailure"],
    variants: {
      // The review's trace: `Note out, hide, Note newest, hide, ack`. Disk said `out` until the timer.
      "an-answer-to-a-hidden-page-issues-at-once"(c0) {
        const c = on(c0, serialBareFixture(), { captureMs: 5_000 });
        c.do({ hide: true }); // the actor's first record is not in this
        c.send("Note", { text: "out" });
        c.do({ holdPlain: true });
        c.do({ hide: true }); // `out` is out; the page is visible again
        c.send("Note", { text: "newest" }); // visible: its window starts
        c.do({ hide: true, stay: true }); // the page goes, with a batch out, so this hide cannot issue
        c.do({ holdPlain: false });
        c.do({ storage: "ack" });
        c.eq("no timer waited", noteOn(c), "newest");
      },
      "a-visible-page-still-waits-its-window"(c0) {
        const c = on(c0, serialBareFixture(), { captureMs: 5_000 });
        c.do({ hide: true });
        c.send("Note", { text: "out" });
        c.do({ holdPlain: true });
        c.do({ hide: true });
        c.send("Note", { text: "newest" });
        c.do({ holdPlain: false });
        c.do({ storage: "ack" });
        c.eq("waits", noteOn(c), "out");
        c.advance(5_000);
        c.eq("then lands", noteOn(c), "newest");
      },
      // D97's guard: hidden is not a reason to retry at once. A hot loop would use the hide's only task.
      "a-hidden-page-keeps-its-backoff"(c0) {
        const c = on(c0, serialBareFixture(), { captureMs: 5_000 });
        c.do({ hide: true });
        const n = batches(c).length;
        c.do({ hide: true, stay: true });
        c.fault({ storageFails: 50 });
        c.send("Note", { text: "x" });
        c.eq("one try", batches(c).length, n + 1);
        c.advance(1_000);
        c.eq("then one more", batches(c).length, n + 2);
      },
    },
  },
  {
    id: "REV8-FATAL",
    kind: "fault",
    fixtures: [serialBareFixture()],
    actor: A,
    cites: ["D98"],
    namedIssues: ["Fatal"],
    variants: {
      // `runAfterDrain` re-deferred for ever: mail left by a fatal still counted as work.
      "a-fatal-with-mail-left-does-not-spin"(c0) {
        const c = on(c0, serialBareFixture());
        c.do({ fault: { throwInCoreAfter: 2 } });
        c.send("Two");
        c.yes("fatal", c.r.quiet().fatal);
        c.yes("settled, with no spin", c.r.quiet().idle);
        c.eq("what was published still lands", noteOn(c), "two");
      },
      "a-fatal-stops-the-fibers"(c0) {
        const c = on(c0, serialBareFixture());
        c.send("Go");
        c.ack();
        c.eq("one on the wire", c.r.outside().live, 1);
        c.fault({ throwInCore: true });
        c.send("Note", { text: "x" }); // the turn's core code throws, with the send still on the wire
        c.yes("fatal", c.r.quiet().fatal);
        c.eq("none left", c.r.outside().live, 0);
      },
    },
  },
  {
    id: "REV8-M3",
    kind: "fault",
    fixtures: [copiesFixture],
    actor: { actor: CopiesId, id: "a" },
    cites: ["D99"],
    namedIssues: ["RecordQuarantined"],
    variants: {
      // Actor lands, `meta` does not, kill: the next boot took the same number. Each new copy then gets ids already on disk, and a read's ending goes to whoever has that id first.
      "a-boot-lost-apart-from-its-records-reaches-no-other-copy"(c0) {
        const X = { actor: CopiesId, id: "a" };
        const c = new Ctx(c0.fresh([copiesFixture], { captureMs: 0 }), X);
        c.namedIssues = c0.namedIssues;
        c.ensure();
        c.send("Add", { id: "y" });
        c.reload(); // boot 2. Its first batch has `meta` in its own scope
        c.do({ holdPlain: true });
        c.send("Add", { id: "z" });
        c.do({ storage: "ack", match: "actor/" }); // the actor's batch lands. `meta`'s does not
        c.do({ holdPlain: false });
        c.reload();
        for (const id of ["p", "q", "r", "s", "t", "u"]) c.send("Add", { id });
        const all = ["x", "y", "z", "p", "q", "r", "s", "t", "u"];
        for (const id of all) {
          c.into([`c:${id}`], "Load", { tag: id });
          c.answer("load", { ok: id }, { tag: id });
        }
        for (const id of all) c.eq(`copy ${id} got its own read`, c.inner([`c:${id}`])?.memory.got, id);
      },
      "frame-numbers-do-not-repeat-across-a-lost-meta"(c0) {
        const X = { actor: CopiesId, id: "a" };
        const c = new Ctx(c0.fresh([copiesFixture], { captureMs: 0 }), X);
        c.namedIssues = c0.namedIssues;
        c.ensure();
        c.reload();
        c.do({ holdPlain: true });
        c.send("Note", { text: "n" });
        c.do({ storage: "ack", match: "actor/" });
        c.do({ holdPlain: false });
        c.reload();
        c.send("Note", { text: "m" });
        const seq = c.r.frames().map((f) => f.seq);
        c.eq("no repeat", new Set(seq).size, seq.length);
      },
      // D99's other half: a poison actor's record stays back, and only its lane says which boot wrote it.
      "a-lane-alone-still-floors-the-boot"(c0) {
        c0.namedIssues.push("UnencodableValue", "StorageFailure");
        const c = on(c0, serialBareFixture(), { captureMs: 0 });
        c.fault({ storageFails: 1 }); // the new boot's first actor write fails, so its record never says this boot
        c.reload();
        c.send("NoteBad"); // and from here it cannot go
        c.send("Go");
        c.ack();
        c.yes("the lane says this boot", disk(c, KEY)?.boot > disk(c, ACTOR)?.boot);
        c.reload();
        const seq = c.r.frames().map((f) => f.seq);
        c.eq("no repeat", new Set(seq).size, seq.length);
      },
      // D111: a hold's record is rewritten only when it changes.
      "a-hold-does-not-rewrite-per-boot"(c0) {
        const c = on(c0, serialBareFixture(), { captureMs: 0 });
        c.send("Go");
        c.ack();
        c.answer("charge", { lost: true });
        c.reload();
        const n = batches(c).filter((b) => b.writes.some((w) => w.key === KEY)).length;
        c.reload();
        c.reload();
        c.eq("two more boots, no write of the lane", batches(c).filter((b) => b.writes.some((w) => w.key === KEY)).length, n);
      },
    },
  },
  {
    id: "REV8-M9",
    kind: "fault",
    fixtures: [doorsFixture],
    actor: { actor: DoorsId, id: "a" },
    cites: ["D100", "O5"],
    namedIssues: ["UnencodableValue"],
    variants: {
      // The review's trace: a server's `1n` on a success with a guard key. `InvalidTurn`, redelivered, `InvalidTurn`, `W` for good, even with a later alternative that matched.
      "a-guard-key-that-cannot-encode-denies-that-alternative"(c0) {
        const D = { actor: DoorsId, id: "a" };
        const c = on(c0, doorsFixture, undefined, D);
        c.send("Go");
        c.ack();
        c.answer("charge", { ok: { v: 1n } });
        c.state("C");
        c.eq("no refused turn", c.r.issues().filter((i) => i.code === "InvalidTurn").length, 0);
        c.yes("named", c.r.issues().some((i) => i.code === "UnencodableValue"));
      },
      "a-guard-key-with-no-other-alternative-stays"(c0) {
        const D = { actor: DoorsId, id: "a" };
        const c = on(c0, doorsFixture, undefined, D);
        c.send("OnlyKeyed", { v: 1n });
        c.state("A");
        c.eq("no refused turn", c.r.issues().filter((i) => i.code === "InvalidTurn").length, 0);
      },
      "a-guard-key-that-encodes-still-asks"(c0) {
        c0.namedIssues.length = 0;
        const D = { actor: DoorsId, id: "a" };
        const c = on(c0, doorsFixture, undefined, D);
        c.send("Go");
        c.ack();
        c.answer("charge", { ok: { v: "fine" } });
        c.state("B");
      },
      "a-lookup-whose-input-cannot-encode-ends-as-a-failure"(c0) {
        const D = { actor: DoorsId, id: "a" };
        const c = on(c0, doorsFixture, undefined, D);
        c.send("Look", { v: 1n });
        c.eq("nothing went out", c.reqs("read").length, 0);
        c.eq("the turn ran", c.mem().looked, true);
        c.eq("through its outcomes", c.mem().last, "failed");
        c.yes("named", c.r.issues().some((i) => i.code === "UnencodableValue"));
      },
      "a-lookup-whose-key-cannot-encode-ends-as-a-failure"(c0) {
        const D = { actor: DoorsId, id: "a" };
        const c = on(c0, doorsFixture, undefined, D);
        c.send("LookKeyBad");
        c.eq("nothing went out", c.reqs("readKey").length, 0);
        c.eq("through its outcomes", c.mem().last, "failed");
      },
      // `latest`: the newest ask replaces what was open, even when it cannot go.
      "a-bad-lookup-replaces-an-open-one"(c0) {
        const D = { actor: DoorsId, id: "a" };
        const c = on(c0, doorsFixture, undefined, D);
        c.send("Look", { v: "first" });
        c.eq("open", c.reqs("read").length, 1);
        c.send("Look", { v: 1n });
        c.eq("no answer pending", c.r.outside().open.filter((o) => o.op === "read").length, 0);
        c.eq("failed", c.mem().last, "failed");
      },
      "a-module-value-that-cannot-encode-is-dropped-and-named"(c0) {
        const C = { actor: "Lab/Chat", id: "a" };
        const c = new Ctx(c0.fresh([chatFixture()]), C);
        c.namedIssues = c0.namedIssues;
        c.ensure();
        c.send("Jump", { at: 1n });
        c.eq("no refused turn", c.r.issues().filter((i) => i.code === "InvalidTurn").length, 0);
        c.yes("named by the operation, not the edge's poison report", c.r.issues().some((i) => i.code === "UnencodableValue" && i.origin === "Lab/Chat messages"));
      },
      // D108: a commit that cannot encode was refused by nobody's store. Its reason says what happened.
      "a-commit-that-cannot-encode-says-so"(c0) {
        const D = { actor: DoorsId, id: "a" };
        const c = on(c0, doorsFixture, undefined, D);
        c.send("GoOther", { v: 1n });
        c.eq("the reason", c.lastEnding("other")?.["reason"], "Unencodable");
        c.eq("nothing sent", c.reqs("other").length, 0);
      },
      // D108: the door `resetOn` was. A value with no text is one constant: nothing resets, and it is named.
      "a-reset-value-that-cannot-encode-resets-nothing"(c0) {
        const X = { actor: CopiesId, id: "a" };
        const c = new Ctx(c0.fresh([copiesFixture], { captureMs: 0 }), X);
        c.namedIssues = c0.namedIssues;
        c.ensure();
        c.send("BadReset");
        c.eq("no refused turn", c.r.issues().filter((i) => i.code === "InvalidTurn").length, 0);
        c.yes("the turn ran", c.mem().bad === 1n);
        c.yes("named", c.r.issues().some((i) => i.code === "UnencodableValue"));
      },
      // A fourth door, found reading the first three: a key on `cancel` or `retry`. No lane can have a key with no text.
      "a-members-key-that-cannot-encode-does-nothing-and-the-turn-runs"(c0) {
        const D = { actor: DoorsId, id: "a" };
        const c = on(c0, doorsFixture, undefined, D);
        c.send("CancelBad", { v: 1n });
        c.eq("cancel: the turn ran", c.mem().cancels, 1);
        c.send("RetryBad", { v: 1n });
        c.eq("retry: the turn ran", c.mem().retries, 1);
        c.eq("no refused turn", c.r.issues().filter((i) => i.code === "InvalidTurn").length, 0);
      },
    },
  },
  {
    id: "REV8-KEPT",
    kind: "fault",
    fixtures: [doorsFixture],
    actor: { actor: DoorsId, id: "a" },
    cites: ["D109", "D50"],
    namedIssues: ["InvalidTurn"],
    variants: {
      // Review M4: a charge that succeeded, a handler that throws on this value. `InvalidTurn` twice, state `W`, `waits: []`, for good.
      "a-refused-ending-is-kept-named-and-delivered-at-the-next-boot"(c0) {
        const D = { actor: DoorsId, id: "a" };
        const c = on(c0, doorsFixture, { captureMs: 0 }, D);
        c.send("GoBoom");
        c.ack();
        c.answer("boom", { ok: { v: "boom" } });
        c.state("W");
        c.eq("refused twice", c.r.issues().filter((i) => i.code === "InvalidTurn").length, 2);
        c.yes("a wait says so", c.r.quiet().waits.some((w) => w.kind === "parked" && (w as any).op === "boom"));
        c.do({ hide: true });
        (globalThis as any).__healed = true; // a release that fixes the closure
        try {
          c.reload();
        } finally {
          (globalThis as any).__healed = false;
        }
        c.state("B");
        c.eq("delivered", c.mem().last, "delivered");
        c.eq("no wait left", c.r.quiet().waits.filter((w) => w.kind === "parked").length, 0);
      },
      "a-hold-needs-nothing-kept-its-lane-holds-it"(c0) {
        const c = on(c0, serialBareFixture(), { captureMs: 0 });
        c.send("Go");
        c.ack();
        c.do({ fault: { throwIn: "on.Unsure[0]", times: 2 } });
        c.answer("charge", { lost: true });
        c.eq("held", held(c), true);
      },
      "a-reads-refused-ending-is-a-stranded-wait"(c0) {
        const D = { actor: DoorsId, id: "a" };
        const c = on(c0, doorsFixture, { captureMs: 0 }, D);
        c.send("ReadBoom");
        c.answer("readBoom", { ok: {} });
        c.yes("a wait says so", c.r.quiet().waits.some((w) => w.kind === "stranded" && (w as any).op === "readBoom"));
        c.send("ReadBoom");
        c.eq("the next ask clears it", c.r.quiet().waits.filter((w) => w.kind === "stranded").length, 0);
      },
    },
  },
  {
    id: "REV8-STORM",
    kind: "fault",
    fixtures: [doorsFixture],
    actor: { actor: DoorsId, id: "a" },
    cites: ["D110"],
    namedIssues: ["TurnStorm", "UnencodableValue", "Defect"],
    variants: {
      // Review M5: 1.8 GB in 1.6 s. A failure with no I/O and a handler that asks again.
      "a-lookup-that-fails-at-once-and-asks-again-stops"(c0) {
        const D = { actor: DoorsId, id: "a" };
        const c = on(c0, doorsFixture, { captureMs: 0, askMax: 16 }, D);
        c.send("LoopLook");
        c.yes("settled, so it stopped", c.r.quiet().idle);
        c.eq("named once", c.r.issues().filter((i) => i.code === "TurnStorm").length, 1);
        c.yes("a wait says so", c.r.quiet().waits.some((w) => w.kind === "stranded" && (w as any).op === "readLoop"));
        c.eq("bounded", c.mem().loops, 16);
      },
      "a-commit-that-throws-at-once-and-asks-again-stops"(c0) {
        const L = { actor: LoopId, id: "a" };
        const c = on(c0, loopFixture, { askMax: 16 }, L);
        c.send("Go");
        c.yes("settled, so it stopped", c.r.quiet().idle);
        c.eq("named once", c.r.issues().filter((i) => i.code === "TurnStorm").length, 1);
        c.yes("bounded", c.mem().loops <= 16);
      },
      "the-budget-comes-back-with-time"(c0) {
        const D = { actor: DoorsId, id: "a" };
        const c = on(c0, doorsFixture, { captureMs: 0, askMax: 16 }, D);
        c.send("LoopLook");
        c.advance(1_000);
        c.send("LoopGood");
        c.eq("it goes", c.reqs("readLoop").length, 1);
        c.eq("no stranded wait", c.r.quiet().waits.filter((w) => w.kind === "stranded").length, 0);
      },
      "the-default-budget-lets-an-ordinary-burst-through"(c0) {
        const D = { actor: DoorsId, id: "a" };
        const c = on(c0, doorsFixture, { captureMs: 0 }, D);
        for (let i = 0; i < 200; i++) c.send("Look", { v: `v${i}` });
        c.eq("all asked", c.reqs("read").length, 200);
      },
    },
  },
  {
    id: "REV8-WIPE",
    kind: "fault",
    fixtures: [bareFixture()],
    actor: A,
    cites: ["D106", "O6"],
    variants: {
      // H3 restated: everything on the origin can go, an older hold too. With the Attempt's key the server sees a second key. A stated limit, pinned so it cannot go quiet.
      "a-wiped-hold-with-the-attempts-key-gives-a-second-key"(c0) {
        const c = on(c0, bareFixture());
        c.send("Go");
        c.ack();
        c.answer("charge", { lost: true });
        c.eq("held", held(c), true);
        c.do({ reload: true, wipe: true });
        c.eq("no actor", c.r.state(A), undefined);
        c.ensure();
        c.yes("no hold", !held(c));
        c.send("Go");
        c.ack();
        c.eq("a second key beside an undecided first: the limit", c.keys("charge").length, 2);
        c.eq("both undecided", c.r.outside().mayHave.length, 2);
      },
      // The rule for money: only a key the server recognises prevents duplicates.
      "a-wiped-hold-with-a-business-key-is-one-key"(c0) {
        const c = on(c0, businessKeyFixture());
        c.send("Go");
        c.ack();
        c.answer("charge", { lost: true });
        c.do({ reload: true, wipe: true });
        c.ensure();
        c.send("Go");
        c.ack();
        c.eq("two sends", c.reqs("charge").length, 2);
        c.eq("one key", c.keys("charge").length, 1);
      },
      // A send in flight and a wipe, nothing said.
      "a-wipe-while-on-the-wire-boots-clean"(c0) {
        const c = on(c0, bareFixture());
        c.send("Go");
        c.ack();
        c.do({ reload: true, wipe: true });
        c.eq("no issue", c.r.issues().length, 0);
        c.ensure();
        c.state("A");
      },
    },
  },
  {
    id: "REV8-PINS",
    kind: "fault",
    fixtures: [serialBareFixture()],
    actor: A,
    cites: ["D102", "D80", "D84", "D88", "D72", "D83", "D89", "D29", "L6"],
    namedIssues: ["UnencodableValue", "StorageFailure", "RecordQuarantined", "InvalidTurn"],
    variants: {
      // edge.ticket-batch-carries-only-its-own: a hide with two actors.
      "D80-a-hide-flushes-every-actor"(c0) {
        const c = on(c0, serialBareFixture(), LATER);
        c.ensure(B);
        c.do({ hide: true });
        c.send("Note", { text: "a" });
        c.to(B, "Note", { text: "b" });
        c.do({ hide: true });
        c.eq("a", disk(c, ACTOR).root.memory.note, "a");
        c.eq("b", disk(c, `actor/${B.actor}/${B.id}`).root.memory.note, "b");
      },
      // driver.cut-mid-drain, driver.after-drain-ignores-work: a drain's two turns are one cut, past a yield.
      "D84-batches-go-after-the-drain"(c0) {
        const c = on(c0, serialBareFixture(), { drainMs: -1, captureMs: 0 });
        c.send("Two");
        c.state("A");
        const notes = actorBatches(c).map((b) => JSON.parse(b.writes.find((w) => w.key === ACTOR)!.value!).root.memory.note);
        c.eq("never the mid-drain cut", notes.includes("two"), false);
        c.eq("the end of the drain", notes.at(-1), "after");
      },
      // edge.poison-holds-lanes: a poison actor's commit still leaves, and its deletes stay.
      "D89-poison-lanes-go-ahead-of-the-record"(c0) {
        const c = on(c0, serialBareFixture(), { captureMs: 0 });
        c.send("Note", { text: "good" });
        c.send("NoteBad");
        c.send("Go");
        c.ack();
        c.eq("the commit left", c.reqs("charge").length, 1);
        c.yes("its lane is on disk", !!disk(c, KEY)?.head);
        c.eq("the record stays the last good", noteOn(c), "good");
      },
      "D89-poison-holds-a-delete-back-so-a-hold-is-kept"(c0) {
        const c = on(c0, serialBareFixture());
        c.send("Note", { text: "good" });
        c.send("Go");
        c.ack();
        c.send("NoteBad");
        c.answer("charge", { ok: {} });
        c.yes("the lane is not deleted ahead of the memory that goes with it", !!disk(c, KEY)?.head);
        c.reload();
        c.eq("a pessimistic hold, never a lost one", held(c), true);
      },
      // durable.owed-record-deleted: a restored ending is only on disk until it is delivered. A hide and a kill mid-drain, as real as any.
      "D72-a-parked-ending-survives-a-kill-before-delivery"(c0) {
        const c = on(c0, serialBareFixture(), { drainMs: -1 });
        c.send("Go");
        c.ack();
        c.dispose();
        c.answer("charge", { ok: {} });
        c.do({ hide: true });
        c.yes("parked on disk", (disk(c, KEY)?.parked ?? []).length > 0);
        c.fault({ afterYield: [{ hide: true }, { reload: true }] });
        c.reload();
        c.eq("both boots owed it", c.r.evidence("unparked").length, 2);
      },
      // durable.firing-not-saved: a firing still in mail has not committed. The disk keeps it.
      // The record is written only by what else happens: a `Note` ahead of the firing in mail, and a hide and a kill right after that `Note`'s turn.
      "L6-a-firing-before-its-turn-survives-a-kill"(c0) {
        const c = on(c0, serialBareFixture(), { drainMs: -1, captureMs: 0 });
        c.send("Arm");
        c.state("T");
        c.h.raw({ send: A, event: "Note", payload: { text: "ahead" } }); // in mail, its turn not run
        c.fault({ afterYield: [{ advanceNow: 1_000 }, { nextYield: [{ hide: true }, { reload: true }] }] });
        c.advance(0);
        c.state("A");
        c.eq("once", c.mem().fired, 1);
      },
      // turn.timers-not-reaped: rule 1, a left state's schedules are cancelled, not only fenced when they fire.
      "rule1-a-left-states-schedule-is-gone"(c0) {
        const c = on(c0, serialBareFixture(), { captureMs: 0 });
        const before = c.r.outside().timers.length;
        c.send("Arm");
        c.eq("armed", c.r.outside().timers.length, before + 1);
        c.send("No");
        c.state("A");
        c.eq("gone", c.r.outside().timers.length, before);
      },
      // turn.overlap-allowed: two parts of one turn writing one key of one copy.
      "D57-two-raises-writing-one-key-refuse-the-turn"(c0) {
        const X = { actor: CopiesId, id: "a" };
        const c = new Ctx(c0.fresh([copiesFixture], { captureMs: 0 }), X);
        c.namedIssues = c0.namedIssues;
        c.ensure();
        c.send("RaiseTwice");
        c.yes("refused", c.r.issues().some((i) => i.code === "InvalidTurn"));
        c.eq("neither wrote", c.inner(["c:x"])?.memory.got, null);
      },
      // turn.keyless-idle-ignores-quarantine.
      "D88-a-keyless-idle-sees-a-quarantined-hold"(c0) {
        const c = on(c0, serialBareFixture());
        c.send("Go");
        c.ack();
        c.fault({ corruptStored: { match: "|charge|", edit: () => "not json" } });
        c.reload();
        c.send("IfIdleK");
        c.eq("denied", c.mem().peeks, 0);
      },
      // gate.lane-id-unchecked: the id must be what `laneKey` makes of the key. A body whose key moved would make an idle guard miss the hold.
      "D88-a-lane-record-whose-id-disagrees-is-quarantined"(c0) {
        const c = on(c0, serialBareFixture());
        c.send("Go");
        c.ack();
        c.fault({ corruptStored: { match: "|charge|", edit: (raw: string) => raw.replace(`"key":{}`, `"key":{"a":1}`) } });
        c.reload();
        c.yes("named", c.r.issues().some((i) => i.code === "RecordQuarantined"));
        c.send("IfIdleK");
        c.eq("it holds", c.mem().peeks, 0);
      },
      // gate.nan-is-null: what `canon` cannot tell apart it says apart.
      "D65-NaN-is-not-null"(c0) {
        const D = { actor: DoorsId, id: "a" };
        const c = on(c0, doorsFixture, undefined, D);
        c.send("GoOther", { v: Number.NaN });
        c.ack();
        c.send("GoOther", { v: null });
        c.ack();
        c.eq("two lanes", c.reqs("other").length, 2);
      },
      // gate.map-is-object: a Map has no text, so it is poison, not `{}`.
      "D89-a-map-is-poison-not-an-empty-object"(c0) {
        const c = on(c0, serialBareFixture(), { captureMs: 0 });
        c.send("Note", { text: "good" });
        c.send("NoteMap");
        c.eq("the last good capture", noteOn(c), "good");
        c.yes("named", c.r.issues().some((i) => i.code === "UnencodableValue"));
      },
      // gate.schedule-unbounded: past 2^31 - 1 a browser fires at once.
      "L10-a-schedule-past-the-bound-is-refused"(c0) {
        const c = on(c0, serialBareFixture());
        c.send("ArmFar");
        c.state("A");
        c.yes("refused", c.r.issues().some((i) => i.code === "InvalidTurn"));
      },
      // edge.no-retry-cap, and the gaps' growth.
      "D83-a-retry-is-capped"(c0) {
        const c = on(c0, serialBareFixture(), { captureMs: 0, retryMaxMs: 4_000 });
        c.fault({ storageFails: 12 });
        const n = batches(c).length;
        c.send("Note", { text: "x" });
        c.advance(60_000);
        const at = batches(c).slice(n).map((b) => b.at);
        const gaps = at.slice(1).map((t, i) => t - at[i]!);
        c.eq("grows, then stays at the cap", gaps.slice(0, 5), [1_000, 2_000, 4_000, 4_000, 4_000]);
        c.eq("landed in the end", noteOn(c), "x");
      },
      // edge.backoff-overridden: a new write during backoff does not jump it.
      "D83-a-new-write-does-not-jump-the-backoff"(c0) {
        const c = on(c0, serialBareFixture(), { captureMs: 0 });
        c.fault({ storageFails: 1 });
        const n = batches(c).length;
        c.send("Note", { text: "x" });
        c.eq("one try", batches(c).length, n + 1);
        c.send("Note", { text: "y" });
        c.eq("still one", batches(c).length, n + 1);
        c.advance(1_000);
        c.eq("then the newest", noteOn(c), "y");
      },
      // D111: the lanes on disk are the mint floor, `W` too.
      "D111-a-restored-lane-floors-the-mints"(c0) {
        const c = on(c0, serialBareFixture());
        c.send("Go");
        c.send("Go");
        c.ack();
        c.do({ hide: true });
        c.reload();
        c.send("Go");
        const mints = c.r.evidence("mint").map((e) => e["mint"]);
        c.eq("three mints", mints.length, 3);
        c.yes("the newest is past the one in W", mints[2]! > mints[1]!);
      },
      // lane.queue-unbounded: `W` has a bound, and past it a commit declines.
      "D29-a-full-queue-declines"(c0) {
        const c = on(c0, serialBareFixture(), { captureMs: 0, queueMax: 2 });
        c.send("Go"); // head
        c.send("Go");
        c.send("Go"); // behind it, two
        c.send("Go");
        c.eq("the third behind is declined", c.lastEnding("charge")?.["reason"], "Overloaded");
      },
      // durable.memory-decode-failure-ignored: memory this release cannot decode is quarantined, not fatal.
      "D46-memory-that-cannot-decode-is-quarantined"(c0) {
        const broken: Fixture = {
          id: BareId,
          make: (api) => {
            const m = bareFixture().make(api);
            return { ...m, memory: { ...m.memory, restore: { run: () => { throw new Error("no"); }, at: { definition: BareId, path: "memory.restore" } } } };
          },
        };
        const c = on(c0, broken, { captureMs: 0 });
        c.send("Note", { text: "x" });
        c.reload();
        c.yes("named", c.r.issues().some((i) => i.code === "RecordQuarantined"));
        c.eq("no fatal", c.r.quiet().fatal, false);
      },
      // gate.unknown-closure-allowed: a function under a name the seal does not know is an error.
      "D77-a-closure-the-seal-does-not-know-is-an-error"(c0) {
        const odd: Fixture = {
          id: BareId,
          make: (api) => {
            const m = bareFixture().make(api);
            return { ...m, ops: { charge: { ...m.ops["charge"]!, sneak: () => Effect.void } as never } };
          },
        };
        let threw = "";
        try {
          c0.fresh([odd]);
        } catch (e) {
          threw = String(e);
        }
        c0.yes("refused at the seal", threw.includes("SealUnknownClosure"));
      },
    },
  },
];
