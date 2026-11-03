// Round 9, part two: the review's H1, M1-M8, as traces. Each was seen failing on part one's runtime, or says why it pins what was already true: red-round-9.txt. D122-D128 are proposed.
import { ChainId, chainFixture, EdgeId, edgeFixture } from "../fixtures/round9b.compiled.ts";
import { keptFixture, KeptId } from "../fixtures/round9.compiled.ts";
import { loopFixture, LoopId } from "../fixtures/round8.compiled.ts";
import type { Fixture } from "../harness.ts";
import { Ctx, type Scenario } from "./ctx.ts";

const A = { actor: ChainId, id: "a" };
const B = { actor: ChainId, id: "b" };
const E = { actor: EdgeId, id: "a" };
const K = { actor: KeptId, id: "a" };
const on = (c0: Ctx, f: Fixture, a: { actor: string; id: string }, bounds?: Record<string, number>) => {
  const c = new Ctx(c0.fresh([f], { captureMs: 0, drainMs: 0.2, ...bounds }), a); // a short slice, so a spin's steps are few and its tasks many
  c.namedIssues = c0.namedIssues;
  c.ensure();
  return c;
};
const code = (c: Ctx, x: string) => c.r.issues().filter((i) => i.code === x);
const waits = (c: Ctx, kind: string) => c.r.quiet().waits.filter((w) => w.kind === kind);
const healed = (c: Ctx, f: () => void) => {
  const set = (v: boolean) => () => void ((globalThis as any).__healed = v);
  c.h.release(set(true), set(false)); // a release that fixes the closure
  try {
    f();
  } finally {
    c.h.release(set(false), set(true));
  }
};
const micro = (c: Ctx, op: string, a: any) => c.fault({ microAnswer: [op, a] });
const OK = { ok: {} };
const NO = { fail: { tag: "Whatever" } };
const DUP = { fail: { tag: "Duplicate" } };
const atClockZero = (c: Ctx) => c.eq("no timer was needed", c.r.now(), 0);
const spinning = (c: Ctx, tasks = 40) => c.do({ tasksPerStep: tasks });
const settled = (c: Ctx) => {
  c.do({ tasksPerStep: null });
  c.yes("settled", c.r.quiet().idle);
};
const lane = (c: Ctx, id = '{"id":"a"}', op = "save") => c.r.stored().get(`lane/${EdgeId}/a|${op}|${id}`) as any;

export const round9bScenarios: readonly Scenario[] = [
  {
    id: "REV9-LOOP",
    kind: "fault",
    fixtures: [chainFixture()],
    actor: A,
    cites: ["D122", "H1", "M1", "M2"],
    namedIssues: ["TurnStorm", "UnencodableValue"],
    // How far a spin gets inside one step is the work clock's count, not behaviour: D122 says when, never what. Truth, issues, disk and fatal stay compared.
    outputAllow: { sections: ["requests", "actors", "evidence", "frames", "hashes", "outside", "waits"], why: "a spin's distance in a step is the work clock's count" },
    variants: {
      // H1: `commit: async () => cache.get(k)`. No timer ever fired again.
      "a-spin-over-a-resolved-promise-never-freezes"(c0) {
        const c = on(c0, chainFixture(), A);
        micro(c, "spin", OK);
        spinning(c);
        const t = c.r.tasks();
        c.send("Spin");
        c.yes("the page had its tasks", c.r.tasks() >= t + 40);
        c.yes("and it went on", c.mem().spun > 40);
      },
      "a-failing-promise-spin-never-freezes"(c0) {
        const c = on(c0, chainFixture(), A);
        micro(c, "spin", NO);
        spinning(c);
        const t = c.r.tasks();
        c.send("Spin");
        c.yes("the page had its tasks", c.r.tasks() >= t + 40);
      },
      // An answer inside the pump: the same rule, on the other path.
      "a-spin-answered-inside-the-pump-yields-too"(c0) {
        const c = on(c0, chainFixture(), A);
        c.fault({ syncAnswer: ["spin", OK] });
        spinning(c);
        const t = c.r.tasks();
        c.send("Spin");
        c.yes("the page had its tasks", c.r.tasks() >= t + 40);
        c.yes("no timer paced it", c.mem().spun > 64);
      },
      "a-commit-that-throws-at-once-and-asks-again-yields"(c0) {
        const L = { actor: LoopId, id: "a" };
        const c = on(c0, loopFixture, L);
        c.namedIssues = ["Defect"]; // it dies each time, and that is what it is named
        spinning(c);
        const t = c.r.tasks();
        c.send("Go");
        c.yes("the page had its tasks", c.r.tasks() >= t + 40);
      },
      "listeners-hear-a-spin-while-it-runs"(c0) {
        const c = on(c0, chainFixture(), A);
        micro(c, "spin", OK);
        spinning(c, 10);
        let heard = 0;
        c.h.subscribe(() => void heard++);
        c.send("Spin");
        c.yes("more than once", heard >= 10);
      },
      // What the drain's end used to gate: a spin must not starve the disk.
      "listeners-hear-a-spin-that-never-leaves-the-pump"(c0) {
        const c = on(c0, chainFixture(), A);
        c.fault({ syncAnswer: ["spin", OK] });
        spinning(c, 10);
        let heard = 0;
        c.h.subscribe(() => void heard++);
        c.send("Spin");
        c.yes("at each slice", heard >= 10);
      },
      "a-batch-lands-during-a-spin"(c0) {
        const c = on(c0, chainFixture({ persisted: true }), A);
        micro(c, "spin", OK);
        spinning(c);
        c.send("Spin");
        const saved = c.record({ actor: ChainId, id: "a" });
        c.yes("memory reached the disk, mid-spin", saved?.root.memory.spun > 0);
      },
      "a-press-on-the-same-actor-ends-its-spin"(c0) {
        const c = on(c0, chainFixture(), A);
        micro(c, "spin", OK);
        spinning(c);
        c.send("Spin");
        c.send("Stop");
        settled(c);
        const n = c.mem().spun;
        c.advance(60_000);
        c.eq("it stopped", c.mem().spun, n);
      },
      "a-kill-during-a-spin-boots-clean"(c0) {
        const c = on(c0, chainFixture({ persisted: true }), A);
        micro(c, "spin", OK);
        spinning(c);
        c.send("Spin");
        c.reload();
        settled(c);
      },
      "a-dispose-during-a-spin-ends-it"(c0) {
        const c = on(c0, chainFixture(), A);
        micro(c, "spin", OK);
        spinning(c);
        c.send("Spin");
        c.yes("it was spinning", c.reqs("spin").length > 0); // D132: this passed on no runtime
        c.dispose();
        settled(c);
        c.eq("the actor is gone", c.r.state(A), undefined);
      },
      // M1, every row of the review's table.
      "1000-rows-over-a-resolved-promise-need-no-timer"(c0) {
        const c = on(c0, chainFixture(), A);
        micro(c, "row", OK);
        c.send("Rows", { n: 1000 });
        c.eq("all", c.mem().ok, 1000);
        atClockZero(c);
        c.yes("it yielded on the way", c.r.tasks() > 1);
      },
      "1000-rows-answered-inside-the-pump-need-no-timer"(c0) {
        const c = on(c0, chainFixture(), A);
        c.fault({ syncAnswer: ["row", OK] });
        c.send("Rows", { n: 1000 });
        c.eq("all", c.mem().ok, 1000);
        atClockZero(c);
      },
      "1000-writes-need-no-timer"(c0) {
        const c = on(c0, chainFixture(), A);
        micro(c, "save", OK);
        c.send("Writes", { n: 1000 });
        c.eq("all", c.mem().ok, 1000);
        atClockZero(c);
      },
      "one-duplicate-at-row-150-costs-nothing"(c0) {
        const c = on(c0, chainFixture(), A);
        c.fault({ syncAnswer: ["row", (i: any) => (i.i === 150 ? DUP : OK)] });
        c.send("Rows", { n: 200 });
        c.eq("all", [c.mem().ok, c.mem().dup], [199, 1]);
        atClockZero(c);
      },
      "every-tenth-row-a-duplicate-costs-nothing"(c0) {
        const c = on(c0, chainFixture(), A);
        c.fault({ syncAnswer: ["row", (i: any) => (i.i % 10 === 0 ? DUP : OK)] });
        c.send("Rows", { n: 300 });
        c.eq("all", [c.mem().ok, c.mem().dup], [270, 30]);
        atClockZero(c);
      },
      "200-failing-rows-are-not-a-spin"(c0) {
        const c = on(c0, chainFixture(), A);
        c.fault({ syncAnswer: ["row", DUP] });
        c.send("Rows", { n: 200 });
        c.eq("all", c.mem().dup, 200);
        atClockZero(c);
        c.eq("not named", code(c, "TurnStorm").length, 0);
      },
      "200-failing-writes-are-not-a-spin"(c0) {
        const c = on(c0, chainFixture(), A);
        c.fault({ syncAnswer: ["save", DUP] });
        c.send("Writes", { n: 200 });
        c.eq("all", c.mem().dup, 200);
        atClockZero(c);
        c.eq("not named", code(c, "TurnStorm").length, 0);
      },
      // What a spin is, by its evidence: one ask, one input, failing, in a row. It is named. Nothing else about it changes.
      "the-same-input-failing-in-a-row-is-named-once"(c0) {
        const c = on(c0, chainFixture(), A, { sameFailures: 16 });
        micro(c, "spin", NO);
        spinning(c, 200);
        c.send("Spin");
        c.yes("past the bound", c.mem().spun > 16);
        c.eq("once", code(c, "TurnStorm").length, 1);
        c.yes("it names the op", code(c, "TurnStorm")[0]!.origin?.includes("spin"));
      },
      "a-new-input-each-time-is-not-the-same-failure"(c0) {
        const c = on(c0, chainFixture(), A, { sameFailures: 16 });
        micro(c, "spinIn", NO);
        spinning(c, 200);
        c.send("SpinInput");
        c.yes("past the bound", c.mem().spun > 16);
        c.eq("not named", code(c, "TurnStorm").length, 0);
      },
      "a-success-spin-is-not-named"(c0) {
        const c = on(c0, chainFixture(), A, { sameFailures: 16 });
        micro(c, "spin", OK);
        spinning(c, 200);
        c.send("Spin");
        c.yes("past the bound", c.mem().spun > 16);
        c.eq("not named", code(c, "TurnStorm").length, 0);
      },
      // M2: another actor's ending past a spin's bound waited 30 s.
      "a-spin-does-not-delay-another-actors-ending"(c0) {
        const c = on(c0, chainFixture(), A);
        c.ensure(B);
        micro(c, "spin", NO);
        micro(c, "pw", OK);
        spinning(c);
        c.send("Spin");
        c.to(B, "Pw");
        c.eq("heard, with no time passing", (c.mem(B) as any).heard, true);
        atClockZero(c);
      },
      "a-press-beside-a-spin-goes-in-its-task"(c0) {
        const c = on(c0, chainFixture(), A);
        c.ensure(B);
        micro(c, "spin", OK);
        spinning(c, 5);
        c.send("Spin");
        c.to(B, "Press");
        c.eq("it went", (c.mem(B) as any).presses, 1);
      },
      // Mail is served actor by actor: a bulk on one does not stand in front of a press on another.
      "a-bulk-does-not-stand-in-front-of-another-actors-press"(c0) {
        const c = on(c0, chainFixture(), A);
        c.ensure(B);
        c.h.raw({ burst: A, event: "Press", n: 300 });
        c.h.raw({ send: B, event: "Press" });
        const before = c.r.evidence("turn").length; // what ran before the press came is not behind it
        c.do({ advance: 0 });
        const order = c.r.evidence("turn").slice(before).map((t) => t["actor"]);
        c.yes("second in the line, at worst", order.indexOf(`${ChainId}/b`) <= 2);
        c.eq("all ran", (c.mem(A) as any).presses, 300);
      },
      // The same rule for a life that can pause: rule 52 interrupts a spin as it does any read.
      "a-freeze-ends-a-spin"(c0) {
        const c = on(c0, keptFixture(), K);
        c.send("ToP");
        spinning(c);
        c.into(["rz"], "Spin");
        c.yes("it runs", (c.r.inner(K, ["rz"]) as any)?.memory.n > 0);
        c.send("Leave");
        settled(c);
        const n = (c.r.inner(K, ["rz"]) as any)?.memory.n;
        c.advance(60_000);
        c.eq("no more", (c.r.inner(K, ["rz"]) as any)?.memory.n, n);
      },
    },
  },
  {
    id: "REV9-EDGE",
    kind: "fault",
    fixtures: [edgeFixture()],
    actor: E,
    cites: ["D123", "M3", "M4", "M5"],
    namedIssues: ["InvalidTurn", "UnencodableValue"],
    variants: {
      "a-key-less-idle-denies-a-kept-ending"(c0) {
        const c = on(c0, edgeFixture(), E);
        c.send("Go");
        c.ack();
        c.answer("save", { ok: { v: "boom" } });
        c.send("IfAny");
        c.eq("denied, as keyed idle is", c.mem().presses, 0);
        c.send("IfA");
        c.eq("keyed agrees", c.mem().presses, 0);
      },
      "a-key-less-cancel-lets-a-kept-ending-go"(c0) {
        const c = on(c0, edgeFixture(), E);
        c.send("Go");
        c.ack();
        c.answer("save", { ok: { v: "boom" } });
        c.send("ForgetAny");
        c.eq("no wait", waits(c, "parked").length, 0);
        c.eq("no row", c.r.row(E, "save", { id: "a" }), undefined);
        c.send("IfAny");
        c.eq("idle again", c.mem().presses, 1);
      },
      "a-cancel-with-a-head-beside-it-lets-go-too"(c0) {
        const c = on(c0, edgeFixture(), E);
        c.send("Q");
        c.ack();
        c.send("Q");
        c.answer("q", { ok: { v: "boom" } });
        c.ack();
        c.eq("kept beside the next head", (c.r.row(E, "q", { id: "a" }) as any)?.undelivered, 1);
        c.send("ForgetQ");
        c.eq("no kept ending", (c.r.row(E, "q", { id: "a" }) as any)?.undelivered, undefined);
      },
      // A decline sent nothing. It tells the machine, it is kept until it can, and it blocks nothing.
      "a-decline-names-its-own-key"(c0) {
        const c = on(c0, edgeFixture(), E);
        c.do({ fault: { throwIn: "operations.save.NotSent", times: 2 } });
        c.send("Go", { id: "a", at: new Set() });
        c.eq("the row of its key", (c.r.row(E, "save", { id: "a" }) as any)?.undelivered, 1);
        c.eq("no lane with no name", lane(c, "null"), undefined);
      },
      "cancel-of-its-own-key-lets-a-decline-go"(c0) {
        const c = on(c0, edgeFixture(), E);
        c.do({ fault: { throwIn: "operations.save.NotSent", times: 2 } });
        c.send("Go", { id: "a", at: new Set() });
        c.send("ForgetA");
        c.eq("no wait", waits(c, "parked").length, 0);
        c.eq("nothing on disk", lane(c), undefined);
      },
      "a-kept-decline-blocks-nothing"(c0) {
        const c = on(c0, edgeFixture(), E);
        c.do({ fault: { throwIn: "operations.save.NotSent", times: 2 } });
        c.send("Go", { id: "a", at: new Set() });
        c.send("IfA");
        c.eq("idle", c.mem().presses, 1);
        c.send("IfAny");
        c.eq("key-less too", c.mem().presses, 2);
        c.send("Go");
        c.ack();
        c.eq("a commit goes", c.keys("save").length, 1);
      },
      // M3: 5 presses, parked 6 on disk, 12 refusals each boot.
      "kept-declines-do-not-pile-up"(c0) {
        const c = on(c0, edgeFixture(), E);
        for (let i = 0; i < 5; i++) {
          c.do({ fault: { throwIn: "operations.save.NotSent", times: 2 } });
          c.send("Go", { id: "a", at: new Set() });
        }
        c.eq("one", waits(c, "parked").length, 1);
        c.eq("on disk too", lane(c).parked.length, 1);
        c.eq("the row", (c.r.row(E, "save", { id: "a" }) as any)?.undelivered, 1);
      },
      // A press beside a kept success declines. That decline, refused too, is one more, and no more than one.
      "a-kept-success-and-its-rejections-stay-two"(c0) {
        const c = on(c0, edgeFixture(), E);
        c.send("Go");
        c.ack();
        c.answer("save", { ok: { v: "boom" } });
        for (let i = 0; i < 5; i++) {
          c.do({ fault: { throwIn: "operations.save.NotSent", times: 2 } });
          c.send("Go");
        }
        c.eq("the ending, and one decline", waits(c, "parked").length, 2);
        c.eq("no key beside it", c.keys("save").length, 1);
      },
      "a-boot-tries-a-kept-ending-once"(c0) {
        const c = on(c0, edgeFixture(), E);
        c.send("Go");
        c.ack();
        c.answer("save", { ok: { v: "boom" } });
        const n = code(c, "InvalidTurn").length;
        c.reload();
        c.eq("one more", code(c, "InvalidTurn").length, n + 1);
        c.reload();
        c.eq("and one more", code(c, "InvalidTurn").length, n + 2);
        c.eq("still kept", (c.r.row(E, "save", { id: "a" }) as any)?.undelivered, 1);
        healed(c, () => c.reload());
        c.state("B");
        c.eq("heard, at last", c.mem().last, "delivered");
      },
      // M3: `{ origin, input: { k: "mail", event } }`, and the error nowhere.
      "a-refusal-says-what-was-thrown"(c0) {
        const c = on(c0, edgeFixture(), E);
        c.send("Go");
        c.ack();
        c.answer("save", { ok: { v: "boom" } });
        c.yes("the error's own words", code(c, "InvalidTurn").at(-1)!.cause?.includes("this value"));
      },
      // M4: a new local life heard the old life's ending.
      "a-new-local-life-hears-nothing-of-the-old"(c0) {
        const f = edgeFixture({ persisted: false, local: true });
        const c = on(c0, f, E);
        c.send("Go");
        c.answer("save", { ok: { v: "boom" } });
        c.eq("kept", waits(c, "parked").length, 1);
        c.dispose();
        c.eq("it goes with the life", waits(c, "parked").length, 0);
        c.eq("no row", c.r.row(E, "save", { id: "a" }), undefined);
        healed(c, () => c.ensure());
        c.state("A");
        c.eq("nobody pressed anything", c.mem().last, null);
      },
      // The persisted case keeps it: that ending may be at the server, and the identity comes back.
      "a-new-persisted-life-does-hear-it"(c0) {
        const c = on(c0, edgeFixture(), E);
        c.send("Go");
        c.ack();
        c.answer("save", { ok: { v: "boom" } });
        c.dispose();
        healed(c, () => c.ensure());
        c.state("B");
      },
      "a-new-life-tries-a-kept-ending-once"(c0) {
        const c = on(c0, edgeFixture(), E);
        c.send("Go");
        c.ack();
        c.answer("save", { ok: { v: "boom" } });
        const n = code(c, "InvalidTurn").length;
        c.dispose();
        c.ensure();
        c.eq("one more", code(c, "InvalidTurn").length, n + 1);
      },
      "a-sleeping-actors-kept-ending-stays-kept-through-a-boot"(c0) {
        const c = on(c0, edgeFixture(), E);
        c.send("Go");
        c.ack();
        c.answer("save", { ok: { v: "boom" } });
        c.dispose();
        c.reload();
        c.eq("still on the row", (c.r.row(E, "save", { id: "a" }) as any)?.undelivered, 1);
      },
      // Two rows' writes share an op and a key, and each life lets go only of its own.
      "a-key-less-cancel-stays-in-its-own-life"(c0) {
        const c = on(c0, edgeFixture(), E);
        c.send("Set", { ids: ["r1", "r2"] });
        c.into(["r:r1"], "DoRow");
        c.ack();
        c.answer("rowSave", { ok: {} });
        c.eq("kept", waits(c, "parked").length, 1);
        c.into(["r:r2"], "ForgetRow");
        c.eq("not this row's to let go", waits(c, "parked").length, 1);
        c.into(["r:r1"], "ForgetRow");
        c.eq("its own", waits(c, "parked").length, 0);
      },
      // M5: one row's ask cleared another's wait.
      "another-rows-ask-leaves-a-stranded-wait"(c0) {
        const c = on(c0, edgeFixture(), E);
        c.send("Set", { ids: ["r1", "r2"] });
        c.into(["r:r1"], "Ask");
        c.answer("rowRead", { ok: {} });
        c.eq("stranded", waits(c, "stranded").length, 1);
        c.into(["r:r2"], "Ask");
        c.eq("still", waits(c, "stranded").length, 1);
      },
      "two-rows-stranded-are-two-waits"(c0) {
        const c = on(c0, edgeFixture(), E);
        c.send("Set", { ids: ["r1", "r2"] });
        c.into(["r:r1"], "Ask");
        c.answer("rowRead", { ok: {} });
        c.into(["r:r2"], "Ask");
        c.answer("rowRead", { ok: {} });
        c.eq("two", waits(c, "stranded").length, 2);
      },
      "its-own-next-ask-clears-it"(c0) {
        const c = on(c0, edgeFixture(), E);
        c.send("Set", { ids: ["r1"] });
        c.into(["r:r1"], "Ask");
        c.answer("rowRead", { ok: {} });
        c.into(["r:r1"], "Ask");
        c.eq("gone", waits(c, "stranded").length, 0);
      },
      "a-stranded-wait-ends-with-its-life"(c0) {
        const c = on(c0, edgeFixture(), E);
        c.send("Set", { ids: ["r1"] });
        c.into(["r:r1"], "Ask");
        c.answer("rowRead", { ok: {} });
        c.send("Set", { ids: [] });
        c.eq("gone with the row", waits(c, "stranded").length, 0);
      },
      "a-stranded-wait-ends-with-its-actor"(c0) {
        const c = on(c0, edgeFixture(), E);
        c.send("Set", { ids: ["r1"] });
        c.into(["r:r1"], "Ask");
        c.answer("rowRead", { ok: {} });
        c.dispose();
        c.eq("gone", waits(c, "stranded").length, 0);
      },
      // Survivors of the review. An ordinary parked ending (rule 53) has been told nothing refused: its key is free.
      "an-ordinary-parked-ending-blocks-nothing"(c0) {
        const c = on(c0, edgeFixture(), E);
        c.send("ToJob");
        c.into(["j"], "Do");
        c.ack();
        c.send("Out");
        c.answer("job", { ok: {} });
        c.eq("parked", waits(c, "parked").length, 1);
        c.send("IfJob");
        c.eq("idle", c.mem().presses, 1);
      },
      "cancel-leaves-an-ordinary-parked-ending-where-it-is"(c0) {
        const c = on(c0, edgeFixture(), E);
        c.send("Go");
        c.ack();
        c.answer("save", { ok: { v: "boom" } });
        c.send("ToJob");
        c.into(["j"], "Do");
        c.ack();
        c.send("Out");
        c.answer("job", { ok: {} });
        c.eq("one of each", waits(c, "parked").length, 2);
        c.send("ForgetAny");
        c.eq("only the kept one went", waits(c, "parked").map((w: any) => w.op), ["job"]);
      },
      // A review's lost ending: two on one lane at a boot. Both are heard.
      "two-parked-on-a-lane-at-boot-are-both-heard"(c0) {
        const c = on(c0, edgeFixture(), E);
        c.send("Go");
        c.ack();
        c.answer("save", { ok: { v: "boom" } });
        c.do({ fault: { throwIn: "operations.save.NotSent", times: 2 } });
        c.send("Go");
        c.eq("two", waits(c, "parked").length, 2);
        healed(c, () => c.reload());
        c.eq("both heard", waits(c, "parked").length, 0);
        c.yes("the success among them", c.r.evidence("delivered").some((d) => d["event"] === "Saved"));
      },
      // A decline whose life went in the same drain: parked for whoever comes, like any ending.
      "a-decline-with-no-life-left-is-parked"(c0) {
        const c = on(c0, edgeFixture(), E, { drainMs: -1 });
        c.send("ToJob");
        c.h.raw({ send: E, event: "DoBad", to: ["j"] });
        c.h.raw({ send: E, event: "Out" });
        c.do({ advance: 0 });
        c.eq("parked", waits(c, "parked").map((w: any) => w.op), ["job"]);
      },
      // Review's survivor: a leaving turn's release lets go of a kept ending, as a `cancel` does.
      "a-release-lets-a-kept-ending-go"(c0) {
        const c = on(c0, edgeFixture(), E);
        c.send("ToRel");
        c.into(["rel"], "Do");
        c.ack();
        c.answer("rel", { ok: {} });
        c.eq("kept", waits(c, "parked").length, 1);
        c.send("Out");
        c.eq("gone", waits(c, "parked").length, 0);
        c.eq("nothing on disk", lane(c, '{"id":"k"}', "rel"), undefined);
      },
      // Review's survivors: `cancel` by a bigint key, and `1n` and "1" as one lane.
      "a-cancel-by-a-bigint-key-reaches-its-lane"(c0) {
        const c = on(c0, edgeFixture(), E);
        c.send("GoBig");
        c.ack();
        c.send("ForgetBig");
        c.eq("no row", (c.r.row(E, "big", { o: 1n }) as any)?.pending ?? false, false);
      },
      "a-bigint-and-its-digits-are-two-lanes"(c0) {
        const c = on(c0, edgeFixture(), E);
        c.send("GoBig");
        c.ack();
        c.send("IfBig1");
        c.eq("a string's lane is another lane", c.mem().presses, 1);
      },
      // Review's survivor `gate.fn-silent`: a function is not a value.
      "a-function-in-an-input-declines"(c0) {
        const c = on(c0, edgeFixture(), E);
        c.send("Go", { id: "a", at: () => 1 });
        c.eq("declined", c.lastEnding("save")?.["reason"], "Unencodable");
        c.eq("nothing sent", c.reqs("save").length, 0);
      },
      // M6: a read's decline is D114 too.
      "a-reads-decline-carries-its-input"(c0) {
        const c = on(c0, edgeFixture(), E);
        c.send("Look", { at: new Set() });
        c.eq("the mapper read it, and its key", c.mem().last, "look:x:x");
        c.eq("no refusal", code(c, "InvalidTurn").length, 0);
      },
    },
  },
];
