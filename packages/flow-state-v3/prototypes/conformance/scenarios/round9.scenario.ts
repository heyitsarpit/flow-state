// Round 9, part one: what round 8's final review found. Each case was seen failing on round 8's code, or says why it pins what was already true: red-round-9.txt. D114-D120 are proposed.
import { chatFixture } from "../fixtures/chat.compiled.ts";
import { doorsFixture, DoorsId, loopFixture, LoopId, serialBareFixture } from "../fixtures/round8.compiled.ts";
import { BareId } from "../fixtures/round7.compiled.ts";
import { bulkFixture, BulkId, keptFixture, KeptId } from "../fixtures/round9.compiled.ts";
import type { Fixture } from "../harness.ts";
import { Ctx, type Scenario } from "./ctx.ts";

const K = { actor: KeptId, id: "a" };
const BK = { actor: BulkId, id: "a" };
const D = { actor: DoorsId, id: "a" };
const A = { actor: BareId, id: "a" };
const on = (c0: Ctx, f: Fixture, a: { actor: string; id: string }, bounds?: Record<string, number>) => {
  const c = new Ctx(c0.fresh([f], { captureMs: 0, ...bounds }), a);
  c.namedIssues = c0.namedIssues;
  c.ensure();
  return c;
};
const waits = (c: Ctx, kind: string) => c.r.quiet().waits.filter((w) => w.kind === kind);
const refusals = (c: Ctx) => c.r.issues().filter((i) => i.code === "InvalidTurn").length;
const code = (c: Ctx, x: string) => c.r.issues().filter((i) => i.code === x).length;
const healed = (f: () => void) => {
  (globalThis as any).__healed = true;
  try {
    f();
  } finally {
    (globalThis as any).__healed = false;
  }
};
const SAVE_NOT_SENT = "operations.save.NotSent";
const lane = (c: Ctx, id = '{"id":"a"}') => c.r.stored().get(`lane/${KeptId}/a|save|${id}`) as any;

export const round9Scenarios: readonly Scenario[] = [
  {
    id: "REV9-M1",
    kind: "fault",
    fixtures: [keptFixture()],
    actor: K,
    cites: ["D114", "D109"],
    namedIssues: ["InvalidTurn", "UnencodableValue"],
    variants: {
      // The review's trace, with the mapper's own read. A decline's input was `undefined`, so `c.input.id` threw, twice, and the ending went.
      "a-decline-carries-what-the-turn-asked-to-send"(c0) {
        const c = on(c0, keptFixture(), K);
        c.send("Go", { id: "a", at: new Set() });
        c.state("A");
        c.eq("the mapper read it", c.mem().last, "no:a:Unencodable");
        c.eq("no refusal", refusals(c), 0);
      },
      // The line at fault: a refused NotSent has no attempt, and `undefined === undefined` read as a hold.
      "a-refused-not-sent-is-parked-and-the-wait-says-so"(c0) {
        const c = on(c0, keptFixture(), K);
        c.do({ fault: { throwIn: SAVE_NOT_SENT, times: 2 } });
        c.send("Go", { id: "a", at: new Set() });
        c.state("W");
        c.eq("refused twice", refusals(c), 2);
        c.eq("the parked wait", waits(c, "parked").map((w: any) => w.op), ["save"]);
        c.reload();
        c.state("A");
        c.eq("delivered at the next boot", c.mem().last, "no:a:Unencodable");
        c.eq("no wait left", waits(c, "parked").length, 0);
      },
      // A parked input that cannot be carried is written without it: a kept decline must not stop the disk.
      "a-kept-decline-whose-input-cannot-be-carried-still-lands"(c0) {
        const c = on(c0, keptFixture(), K);
        c.do({ fault: { throwIn: SAVE_NOT_SENT, times: 2 } });
        c.send("Go", { id: "a", at: 1n });
        c.eq("no fatal", c.r.quiet().fatal, false);
        const l = lane(c, "null"); // a decline names no lane of its own: the door refused before its key
        c.eq("parked", (l?.parked ?? []).length, 1);
        c.eq("only what cannot be carried stands in", l.parked[0].input, { id: "a", at: { unencodable: true } });
        c.reload();
        c.eq("a mapper still reads the rest", c.mem().last, "no:a:Unencodable");
      },
      // Every decline, not only `Unencodable`.
      "a-refused-rejected-is-kept-too"(c0) {
        const c = on(c0, keptFixture(), K);
        c.send("Go");
        c.ack();
        c.do({ fault: { throwIn: SAVE_NOT_SENT, times: 2 } });
        c.send("Go");
        c.eq("refused twice", refusals(c), 2);
        c.eq("the head is on the wire and the parked ending beside it", [waits(c, "wire").length, waits(c, "parked").length], [1, 1]);
      },
      // Review's survivor `d109.hold-parked-too`: a hold's lane already holds it, so nothing is parked.
      "a-hold-parks-nothing"(c0) {
        const c = on(c0, keptFixture(), K);
        c.send("Go");
        c.ack();
        c.do({ fault: { throwIn: "operations.save.unknown", times: 2 } });
        c.answer("save", { lost: true });
        c.eq("refused twice", refusals(c), 2);
        c.eq("held", (c.r.row(K, "save", { id: "a" }) as any)?.uncertain, true);
        c.eq("no parked wait", waits(c, "parked").length, 0);
        c.eq("no parked entry", lane(c).parked.length, 0);
      },
      // A key door refuses after the input was fine: the mapper still reads the input.
      "a-key-with-no-name-still-carries-the-input"(c0) {
        const c = on(c0, keptFixture(), K);
        c.send("GoOddKey");
        c.eq("the mapper read it", c.mem().last, "odd:kept");
      },
    },
  },
  {
    id: "REV9-BURST",
    kind: "fault",
    fixtures: [bulkFixture],
    actor: BK,
    cites: ["D115", "H1"],
    namedIssues: ["TurnStorm"],
    variants: {
      // The review's H1: 256 went, 44 never started and never ended, and the wait saying so was erased.
      "300-sends-in-one-tick-all-end"(c0) {
        const c = on(c0, bulkFixture, BK);
        for (let i = 0; i < 300; i++) c.send("Del", { id: `m${i}` });
        c.eq("all went", c.reqs("del").length, 300);
        for (let i = 0; i < 300; i++) c.answer("del", { ok: {} });
        c.eq("all done", c.mem().done, 300);
        c.eq("nothing left deleting", c.mem().deleting.length, 0);
        c.eq("no storm", code(c, "TurnStorm"), 0);
      },
      "300-rows-each-asking-once-all-end"(c0) {
        const c = on(c0, bulkFixture, BK);
        c.send("Rows", { ids: Array.from({ length: 300 }, (_, i) => `r${i}`) });
        c.advance(0);
        c.eq("all asked", c.reqs("rowRead").length, 300);
        for (let i = 0; i < 300; i++) c.answer("rowRead", { ok: {} });
        const left = Array.from({ length: 300 }, (_, i) => c.r.inner(BK, [`row:r${i}`]) as any).filter((x) => x?.state !== "D");
        c.eq("all done", left.length, 0);
        c.eq("no storm", code(c, "TurnStorm"), 0);
      },
      // A queue over a local source: a chain with no I/O that is a correct program. It yields; it is not cut.
      "a-queue-over-a-local-source-finishes"(c0) {
        const c = on(c0, bulkFixture, BK, { endingChain: 16 });
        c.send("Drain", { queue: 200 });
        c.yes("it yielded to the page, so a view was published", c.r.quiet().idle);
        c.yes("a yield says so", waits(c, "paced").length === 1);
        c.advance(0);
        c.eq("all ran", c.mem().ran, 200);
        c.eq("a success is never a storm", code(c, "TurnStorm"), 0);
        c.eq("no wait left", waits(c, "paced").length, 0);
      },
      // M4: `now - at` went negative, so the window never renewed: 255 asked, 145 cut.
      "a-clock-set-back-stops-nothing"(c0) {
        const c = on(c0, doorsFixture, D);
        c.send("Look", { v: "first" });
        c.do({ clockBack: 3_600_000 });
        for (let i = 0; i < 400; i++) {
          c.send("Look", { v: `v${i}` });
          c.advance(1_000);
        }
        c.eq("all asked", c.reqs("read").length, 401);
        c.eq("no storm", code(c, "TurnStorm"), 0);
      },
    },
  },
  {
    id: "REV9-SPIN",
    kind: "fault",
    fixtures: [doorsFixture],
    actor: D,
    cites: ["D115", "H1"],
    namedIssues: ["TurnStorm", "UnencodableValue", "Defect"],
    variants: {
      "a-spin-stops-spinning-and-its-ending-is-not-lost"(c0) {
        const c = on(c0, doorsFixture, D, { endingChain: 16 });
        c.send("LoopLook");
        c.yes("settled", c.r.quiet().idle);
        c.eq("bounded", c.mem().loops, 16);
        c.eq("named once", code(c, "TurnStorm"), 1);
        c.eq("a wait says it is paced", waits(c, "paced").map((w: any) => w.op), ["readLoop"]);
      },
      // It goes on, as a loop over a failing network does, and slower each time, up to the cap.
      "a-paced-failure-backs-off"(c0) {
        const c = on(c0, doorsFixture, D, { endingChain: 16, retryMaxMs: 4_000 });
        c.send("LoopLook");
        const at = (ms: number) => {
          c.advance(ms);
          return c.mem().loops;
        };
        c.eq("not yet", at(999), 16);
        c.eq("one at 1 s", at(1), 17);
        c.eq("then 2 s", [at(1_999), at(1)], [17, 18]);
        c.eq("then 4 s", [at(3_999), at(1)], [18, 19]);
        c.eq("the cap", [at(3_999), at(1)], [19, 20]);
        c.eq("still named once", code(c, "TurnStorm"), 1);
      },
      // A press is not part of the chain, and its good read goes at once.
      "a-press-beside-a-spin-goes-at-once"(c0) {
        const c = on(c0, doorsFixture, D, { endingChain: 16 });
        c.send("LoopLook");
        c.send("LoopGood");
        c.eq("it goes", c.reqs("readLoop").length, 1);
      },
      // A real answer breaks a chain: only an ending with no I/O since its ask counts.
      "a-real-answer-breaks-the-chain"(c0) {
        c0.namedIssues.length = 0;
        const c = on(c0, doorsFixture, D, { endingChain: 2 });
        for (let i = 0; i < 12; i++) {
          c.send("Look", { v: "fine" });
          c.answer("read", { ok: "x" });
        }
        c.eq("no wait", waits(c, "paced").length, 0);
        c.eq("none paced", c.mem().last, "x");
      },
      "a-commit-that-throws-at-once-and-asks-again-is-paced"(c0) {
        const L = { actor: LoopId, id: "a" };
        const c = on(c0, loopFixture, L, { endingChain: 16 });
        c.send("Go");
        c.yes("settled", c.r.quiet().idle);
        c.eq("named once", code(c, "TurnStorm"), 1);
        c.yes("bounded", c.mem().loops <= 16);
        c.eq("a wait", waits(c, "paced").length, 1);
      },
      // The drain ends, so what comes after it runs: this is what the spin starved.
      "listeners-hear-a-spin"(c0) {
        const c = on(c0, doorsFixture, D, { endingChain: 16 });
        let heard = 0;
        c.h.subscribe(() => void heard++);
        c.send("LoopLook");
        c.yes("heard", heard > 0);
      },
      "a-spin-with-the-clock-set-back-is-still-paced"(c0) {
        const c = on(c0, doorsFixture, D, { endingChain: 16 });
        c.do({ clockBack: 3_600_000 });
        c.send("LoopLook");
        c.yes("settled", c.r.quiet().idle);
        c.eq("bounded", c.mem().loops, 16);
        c.advance(1_000);
        c.eq("one more", c.mem().loops, 17);
      },
      // `latest`: an older answer waiting its turn goes when a newer ask comes, as one on the wire does.
      "a-newer-ask-replaces-a-paced-read"(c0) {
        const c = on(c0, doorsFixture, D, { endingChain: 16 });
        c.send("LoopLook");
        c.send("LoopGood");
        c.eq("no wait", waits(c, "paced").length, 0);
        c.advance(60_000);
        c.eq("the loop is over", c.mem().loops, 16);
        c.answer("readLoop", { ok: {} });
      },
      // Rule 52: a freeze interrupts a read, and one waiting its turn is a read.
      "a-freeze-interrupts-a-paced-read"(c0) {
        const c = on(c0, keptFixture(), K, { endingChain: 2 });
        c.send("ToP");
        c.into(["rz"], "Spin");
        c.eq("paced", waits(c, "paced").length, 1);
        c.send("Leave");
        c.eq("frozen, nothing waits", waits(c, "paced").length, 0);
        c.advance(60_000);
        c.eq("no more", (c.r.inner(K, ["rz"]) as any)?.memory.n, 2);
        c.send("ToP");
        c.eq("it heard, at the thaw", (c.r.inner(K, ["rz"]) as any)?.memory.stopped, true);
      },
      "a-kill-while-paced-boots-clean"(c0) {
        const c = on(c0, doorsFixture, D, { endingChain: 16 });
        c.send("LoopLook");
        c.reload();
        c.eq("nothing paced", waits(c, "paced").length, 0);
        c.advance(60_000);
        c.eq("no more", code(c, "TurnStorm"), 1);
      },
      "a-dispose-while-paced-ends-it"(c0) {
        const c = on(c0, doorsFixture, D, { endingChain: 16 });
        c.send("LoopLook");
        c.dispose();
        c.advance(60_000);
        c.eq("no wait", waits(c, "paced").length, 0);
      },
    },
  },
  {
    id: "REV9-KEPT",
    kind: "fault",
    fixtures: [keptFixture()],
    actor: K,
    cites: ["D118", "D109", "D50"],
    namedIssues: ["InvalidTurn", "UnencodableValue"],
    variants: {
      // M2: `GiveUp`'s patch throws. `T`, `waits: []`, and the next record dropped the timer.
      "a-refused-deadline-stays-on-the-record"(c0) {
        const c = on(c0, keptFixture(), K);
        c.send("Arm");
        c.advance(1_500);
        c.eq("refused twice", refusals(c), 2);
        c.state("T");
        c.eq("a wait says so", waits(c, "parked").map((w: any) => w.op), ["GiveUp"]);
        c.send("Note", { text: "x" });
        c.do({ hide: true });
        healed(() => {
          c.reload();
          c.advance(5_000);
        });
        c.state("A");
        c.eq("it ran", c.mem().gaveUp, true);
        c.eq("no wait left", waits(c, "parked").length, 0);
      },
      // Rule 1: a schedule of a state that was left is cancelled. A kept firing is one.
      "a-kept-deadline-goes-with-its-activation"(c0) {
        const c = on(c0, keptFixture(), K);
        c.send("Arm");
        c.advance(1_500);
        c.send("Leave");
        c.state("A");
        c.eq("no wait", waits(c, "parked").length, 0);
        healed(() => {
          c.reload();
          c.advance(5_000);
        });
        c.eq("it did not run", c.mem().gaveUp, undefined);
      },
      // A retired identity carries its timers. A kept firing is one.
      "a-kept-deadline-goes-with-a-disposed-actor-and-comes-back"(c0) {
        const c = on(c0, keptFixture(), K);
        c.send("Arm");
        c.advance(1_500);
        c.dispose();
        c.eq("nothing kept for nobody", waits(c, "parked").length, 0);
        healed(() => {
          c.ensure();
          c.advance(5_000);
        });
        c.eq("it ran", c.mem().gaveUp, true);
      },
      // M3: is `W` a stuck state? Yes. So the app can read it, and leave it.
      "a-kept-success-is-visible-and-blocks-its-key"(c0) {
        const c = on(c0, keptFixture(), K);
        c.send("Go");
        c.ack();
        c.answer("save", { ok: { v: "boom" } });
        c.state("W");
        c.eq("the row says so", (c.r.row(K, "save", { id: "a" }) as any)?.undelivered, 1);
        c.send("IfIdle");
        c.eq("idle denies", c.mem().presses, 0);
        c.send("Go");
        c.eq("no second key beside a success nobody heard", c.keys("save").length, 1);
        c.eq("it declines", c.lastEnding("save")?.["reason"], "Rejected");
      },
      "cancel-lets-a-kept-ending-go"(c0) {
        const c = on(c0, keptFixture(), K);
        c.send("Go");
        c.ack();
        c.answer("save", { ok: { v: "boom" } });
        c.send("Forget");
        c.eq("no row", c.r.row(K, "save", { id: "a" }), undefined);
        c.eq("no wait", waits(c, "parked").length, 0);
        c.eq("nothing on disk", lane(c), undefined);
        c.send("IfIdle");
        c.eq("idle again", c.mem().presses, 1);
      },
      "a-kept-ending-delivered-at-boot-frees-its-key"(c0) {
        const c = on(c0, keptFixture(), K);
        c.send("Go");
        c.ack();
        c.answer("save", { ok: { v: "boom" } });
        healed(() => c.reload());
        c.state("B");
        c.send("IfIdle");
        c.eq("idle", c.mem().presses, 1);
      },
      // Refused again at the next boot: kept again, and the same row.
      "still-broken-at-boot-is-kept-again"(c0) {
        const c = on(c0, keptFixture(), K);
        c.send("Go");
        c.ack();
        c.answer("save", { ok: { v: "boom" } });
        c.reload();
        c.eq("two more", refusals(c), 4);
        c.eq("the row", (c.r.row(K, "save", { id: "a" }) as any)?.undelivered, 1);
      },
      // Review's `d109.unpersisted-parks`: no disk, so nothing outlives the tab. The row is still true while it lives.
      "unpersisted-keeps-it-on-the-lane"(c0) {
        const f = keptFixture({ persisted: false });
        const c = on(c0, f, K);
        c.send("Go");
        c.answer("save", { ok: { v: "boom" } });
        c.eq("a wait", waits(c, "parked").length, 1);
        c.eq("the row", (c.r.row(K, "save", { id: "a" }) as any)?.undelivered, 1);
        c.eq("nothing on disk", lane(c), undefined);
      },
      // Review's `d108.commit-subject-lost`: a fragment's kept decline reaches its own incarnation.
      "a-fragments-kept-decline-keeps-its-subject"(c0) {
        const c = on(c0, keptFixture(), K);
        c.do({ fault: { throwIn: "operations.kidSave.NotSent", times: 2 } });
        c.into(["c:x"], "Save");
        c.eq("refused twice", refusals(c), 2);
        c.eq("a wait", waits(c, "parked").length, 1);
        c.reload();
        c.eq("its own incarnation heard", (c.inner(["c:x"]) as any)?.memory.heard, "Unencodable");
      },
      // M2: a raise key refused the turn, on a success too: the door `gate.ts:3` said never does.
      "a-raise-with-no-name-reaches-nobody-and-the-turn-runs"(c0) {
        const c = on(c0, keptFixture(), K);
        c.send("RaiseBad", { v: 1n });
        c.eq("no refusal", refusals(c), 0);
        c.eq("the turn ran", c.mem().raised, true);
        c.yes("named", code(c, "UnencodableValue") > 0);
      },
      // Review's `turn.refusal-keeps-commands`: a lookup's invoke from a turn that refuses after it.
      "a-refused-turn-takes-its-commands"(c0) {
        const c = on(c0, keptFixture(), K);
        c.send("LookBoom");
        c.eq("refused", refusals(c), 1);
        c.eq("nothing left", c.reqs("look").length, 0);
      },
    },
  },
  {
    id: "REV9-STREAM",
    kind: "fault",
    fixtures: [chatFixture()],
    actor: { actor: "Lab/Chat", id: "a" },
    cites: ["D118", "D50"],
    namedIssues: ["InvalidTurn", "UnencodableValue", "UserClosure"],
    variants: {
      // M2: `on.Ended` throws twice. `OPEN`, `waits: []`, feed closed, and nothing said. A reload reopens it, so the wait is what is owed.
      "a-refused-stream-failure-is-a-stranded-wait"(c0) {
        const C = { actor: "Lab/Chat", id: "a" };
        const c = on(c0, chatFixture({ reconnect: false }), C);
        c.do({ fault: { throwIn: "on.Ended[0].updateMemory", times: 2 } });
        c.do({ feed: "messages", fail: { _tag: "Whatever" } });
        c.eq("refused twice", refusals(c), 2);
        c.eq("a wait says so", waits(c, "stranded").length, 1);
        c.reload();
        c.eq("a reload reopens it, and the wait goes", waits(c, "stranded").length, 0);
      },
      // The review's Low: a stream key with no name read `UserClosure`, with `waits: []`. It is the same door as any other.
      "a-stream-key-with-no-name-is-named-and-opens-nothing"(c0) {
        const C = { actor: "Lab/Chat", id: "a" };
        const c = on(c0, chatFixture({ odd: { keyValue: new Set() } }), C);
        c.yes("named", code(c, "UnencodableValue") > 0);
        c.eq("not a closure's fault", code(c, "UserClosure"), 0);
        c.eq("no connection", c.r.outside().open.filter((o) => o.op === "messages").length, 0);
      },
    },
  },
  {
    id: "REV9-NAMES",
    kind: "fault",
    fixtures: [keptFixture()],
    actor: K,
    cites: ["D119", "D108", "M5"],
    namedIssues: ["UnencodableValue", "InvalidTurn"],
    variants: {
      // M5: a typed `Schema.BigInt` key could never send.
      "a-bigint-key-names-a-lane-and-sends"(c0) {
        const c = on(c0, keptFixture(), K);
        c.send("GoKey", { o: "7" });
        c.ack();
        c.eq("sent", c.reqs("keyed").length, 1);
        c.eq("the row, by the same value", (c.r.row(K, "keyed", { o: 7n }) as any)?.pending, true);
        c.send("IfKeyIdle", { o: "7" });
        c.eq("idle reads the same lane", c.mem().presses, 0);
        c.send("IfKeyIdle", { o: "8" });
        c.eq("another key is another lane", c.mem().presses, 1);
      },
      "a-bigint-key-survives-a-reload"(c0) {
        const c = on(c0, keptFixture(), K);
        c.send("GoKey", { o: "7" });
        c.ack();
        c.reload();
        c.eq("no quarantine", code(c, "RecordQuarantined"), 0);
        c.eq("a hold, under its name", (c.r.row(K, "keyed", { o: 7n }) as any)?.uncertain, true);
      },
      // M5: a reset kept the last customer.
      "a-bigint-reset-resets"(c0) {
        const c = on(c0, keptFixture(), K);
        c.into(["s"], "Set", { v: "customer-1 secret" });
        c.send("Who", { who: "2" });
        c.eq("the kid is new", (c.inner(["s"]) as any)?.memory.got, null);
        c.eq("no issue", code(c, "UnencodableValue"), 0);
      },
      // A carried value still has to come back: an input with a bigint is declined, and memory with one is poison.
      "a-bigint-input-still-cannot-be-carried"(c0) {
        const c = on(c0, keptFixture(), K);
        c.send("Go", { id: "a", at: 1n });
        c.eq("declined", c.lastEnding("save")?.["reason"], "Unencodable");
        c.eq("nothing sent", c.reqs("save").length, 0);
      },
      // Review's `d108.reset-not-constant`: a value with no name is one constant, so two such values reset nothing between them.
      "two-reset-values-with-no-name-are-one"(c0) {
        const c = on(c0, keptFixture(), K);
        c.send("WhoOdd", { n: 1 });
        c.into(["z"], "Set", { v: "kept" });
        c.send("WhoOdd", { n: 2 });
        c.eq("no reset", (c.inner(["z"]) as any)?.memory.got, "kept");
      },
      // Review's `d108.guard-no-reason`: the denial says why.
      "a-guard-key-with-no-name-says-why"(c0) {
        const c = on(c0, doorsFixture, D);
        c.send("OnlyKeyed", { v: new Set() });
        c.yes("the reason", c.r.evidence("Denied").at(-1)?.["reasons"]?.includes("Unencodable"));
      },
    },
  },
];
