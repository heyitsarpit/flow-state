import { issuesThrowing } from "../fixtures/lab.compiled.ts";
// Turn order, the bounds and the driver: ORDER-*, DRV-*. Expected results from D1, D2, D13/D35, D5, D6, D27, rule 27.
import { drvFixture } from "../fixtures/drv.compiled.ts";
import { issueRef, issuesFixture } from "../fixtures/issues.compiled.ts";
import { ringFixture } from "../fixtures/order.compiled.ts";
import { payFixture } from "../typed/pay.ts";
import { checkEndings, Ctx, type Scenario } from "./ctx.ts";

const ring = (id: string) => ({ actor: "Ring", id });
const a = ring("a");
const b = ring("b");
const c3 = ring("c");
const R = [ringFixture];
const turns = (c: Ctx) =>
  c.r
    .evidence("turn")
    .map((e) => `${String(e["actor"]).split("/")[1]}:${e["event"]}:${e["n"] ?? ""}`);

const issueA = { actor: "Issues/List", id: "a" };
const perms = <T>(xs: readonly T[]): T[][] =>
  xs.length <= 1
    ? [[...xs]]
    : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));

export const orderScenarios: readonly Scenario[] = [
  {
    id: "ORDER-01",
    kind: "example",
    fixtures: R,
    actor: a,
    cites: ["D1", "sec:2.10.17"],
    run(c) {
      c.ensure(a);
      c.ensure(b);
      let once = false;
      c.h.subscribe(() => {
        if (once) return;
        once = true;
        c.h.send(a, "SayThenX", { n: "a1" });
        c.h.send(b, "Say", { n: "b1" });
        c.h.send(a, "Say", { n: "a2" });
      });
      c.to(c3, "Say", { n: "ignored" }); // no such actor yet: Unhandled, and it wakes the subscriber
      c.eq("one FIFO, follow-up next", turns(c), [
        "a:SayThenX:a1",
        "a:Say:x",
        "b:Say:b1",
        "a:Say:a2",
      ]);
      c.eq("a's log", c.mem(a).log, ["a1", "x", "a2"]);
    },
  },
  {
    id: "ORDER-02",
    kind: "bounded",
    fixtures: R,
    actor: a,
    cites: ["D1", "L4"],
    run(c) {
      type S = (d: Ctx) => void;
      const items: S[] = [
        (d) => d.to(a, "Say", { n: "a1" }),
        (d) => d.to(b, "Say", { n: "b1" }),
        (d) => d.to(c3, "Say", { n: "c1" }),
        (d) => d.answer("job", { ok: {} }, { who: "a" }),
        (d) => d.answer("job", { ok: {} }, { who: "b" }),
      ];
      const go = (order: S[]) => {
        const d = new Ctx(c.fresh(R), a);
        for (const x of [a, b, c3]) d.ensure(x);
        d.to(a, "Work", { n: 1, who: "a" });
        d.to(b, "Work", { n: 2, who: "b" });
        for (const s of order) s(d);
        d.to(a, "Say", { n: "a-last" });
        return d;
      };
      let runs = 0;
      for (const order of perms(items)) {
        const x = go(order);
        const y = go(order);
        runs++;
        c.eq("a person's order per actor", x.mem(a).log.at(-1), "a-last");
        const shape = (d: Ctx) => d.r.frames().map((f) => [f.cause, f.at, f.seq]);
        c.eq("same script, same frames", shape(x), shape(y));
        checkEndings(x.r);
      }
      c.eq("all orders ran", runs, 120);
    },
  },
  {
    id: "ORDER-03",
    kind: "example",
    fixtures: R,
    actor: a,
    cites: ["D2", "sec:3.5"],
    run(c) {
      c.ensure(a);
      const before = c.r.frames().length;
      c.h.raw({ send: a, event: "Say", payload: { n: "now" } });
      c.eq("published on return", c.r.frames().length, before + 1);
      c.eq("memory on return", c.mem(a).log, ["now"]);
      let during: unknown;
      let notified = 0;
      c.h.subscribe(() => {
        notified++;
        if (notified > 1) return;
        c.h.send(a, "Say", { n: "from-subscriber" });
        during = c.mem(a).log; // queued: the send did not run inside notify
      });
      c.send.call(c, "ignored");
      c.do({ send: a, event: "Say", payload: { n: "second" } });
      c.eq("queued during notify", during, ["now"]);
      c.eq("ran after notify", c.mem(a).log, ["now", "from-subscriber", "second"]);
    },
  },
  {
    id: "ORDER-04",
    kind: "fault",
    fixtures: R,
    actor: a,
    cites: ["D35"],
    variants: {
      "subscriber-ping-pong"(c) {
        c.ensure(a);
        c.ensure(b);
        c.ensure(c3);
        let turn = 0;
        let bouncing = true;
        c.h.subscribe(() => {
          if (!bouncing) return;
          c.h.send(turn++ % 2 ? a : b, "Say", { n: turn });
        });
        c.to(a, "Say", { n: 0 });
        c.namedIssues = ["TurnStorm"];
        c.eq(
          "storm",
          c.r.issues().map((i) => i.code),
          ["TurnStorm"],
        );
        c.yes("bounded", c.mem(a).log.length + c.mem(b).log.length <= 70);
        bouncing = false;
        c.to(c3, "Say", { n: "click" });
        c.eq("another actor's send lands", c.mem(c3).log, ["click"]);
        // An outside input resets the chain: a subscriber's single send is fine again.
        let answered = false;
        c.h.subscribe(() => {
          if (answered) return;
          answered = true;
          c.h.send(c3, "Say", { n: "reply" });
        });
        c.to(c3, "Say", { n: "again" });
        c.eq("the chain was reset", c.mem(c3).log, ["click", "again", "reply"]);
      },
      "follow-up-chain"(c) {
        c.ensure(a);
        c.ensure(b);
        c.to(a, "Loop", { n: "l" });
        const i = c.r.issues().at(-1);
        c.eq("issue", i?.code, "InvalidTurn");
        c.eq("names the chain", (i?.input as any)?.chain, "FollowUpBound");
        c.namedIssues = ["InvalidTurn"];
        c.eq("bounded at 64 per admitted item", c.mem(a).log.length, 65);
        c.to(b, "Say", { n: "click" });
        c.eq("another actor's send lands", c.mem(b).log, ["click"]);
      },
      "a-legitimate-hour-of-polling"(c) {
        // Not a storm: every turn is its own timer firing. M9's false alarm stays dead.
        const A = { actor: "Checkout/Pay", id: "s" };
        const d = new Ctx(c.fresh([payFixture]), A);
        d.ensure();
        d.send("Start", { cartId: "c1", intentId: "pi1" });
        d.send("PayRequested", { paymentMethodId: "v" });
        d.ack();
        d.answer("pay", { lost: true });
        d.advance(3_600_000);
        d.eq("no issue", d.r.issues().length, 0);
        d.eq("it kept asking", d.reqs("intent").length, 1200);
      },
    },
  },
  {
    id: "ORDER-05",
    kind: "example",
    fixtures: [issuesFixture],
    actor: issueA,
    cites: ["rule:27", "sec:2.5", "S8"],
    run(c) {
      c.ensure();
      c.send("Load");
      c.answer("list", { truth: true });
      c.send("Toggle", { id: "i1", liked: true });
      const n = c.r.frames().length;
      c.answer("like", { apply: true });
      const fs = c.r.frames().slice(n);
      const rowOf = (f: (typeof fs)[number]) =>
        f.view["Issues/List/a"]?.rows[`like|${JSON.stringify({ id: "i1" })}`];
      const first = fs[0]!;
      c.eq(
        "settlement publishes alone: record confirmed",
        first.records[issueRef("i1")]?.predicted,
        false,
      );
      c.eq("settlement publishes alone: lane still pending", rowOf(first)?.pending, true);
      c.eq("the turn is the next frame", rowOf(fs[1]!), undefined);
    },
  },
  {
    id: "DRV-01",
    kind: "fault",
    fixtures: [drvFixture],
    actor: { actor: "Drv", id: "a" },
    cites: ["D5", "D6", "S4"],
    run(c) {
      const A = { actor: "Drv", id: "a" };
      const B = { actor: "Drv", id: "b" };
      const shapes = [
        "success",
        "failure",
        "unknown",
        "defect",
        "sync",
        "finalizer",
        "uninterruptible",
        "hang",
        "uninterruptibleHang",
      ];
      let runs = 0;
      let withLive = 0;
      let withChoice = 0;
      let choices = 0;
      for (const behaviour of shapes)
        for (let seed = 1; seed <= 8; seed++)
          for (let tick = 0; tick <= 14; tick++)
            for (const inject of [
              { send: A, event: "Cancel", payload: {} },
              { disposeRuntime: true as const },
            ]) {
              const d = new Ctx(c.fresh([drvFixture]), A);
              d.namedIssues = [];
              d.ensure(A);
              d.ensure(B);
              d.h.do({ fault: { schedulerShuffle: seed, atTick: tick, inject } });
              d.h.raw({ send: A, event: "Go", payload: { behaviour } }); // both start before either runs: a real choice
              d.h.raw({ send: B, event: "GoOther", payload: { behaviour: "success" } });
              d.h.do({ advance: 1000 }); // the operation timeout's reach
              d.h.do({ advance: 5000 }); // the dispose bound's reach
              const o = d.r.outside();
              runs++;
              withLive += o.injections.withLive;
              withChoice += o.injections.withChoice;
              choices += o.scheduler.choices;
              checkEndings(d.r);
              const sends = d.r.evidence("invoked").filter((e) => e["op"] === "job");
              const ends = d.endings("job").filter((e) => e["send"] !== undefined);
              const abandoned = d.r.evidence("AbandonedFiber");
              d.eq(
                `${behaviour} seed ${seed} tick ${tick}: every send one ending`,
                ends.length + abandoned.filter((e) => e["op"] === "job").length,
                sends.length,
              );
              d.eq("replay", d.r.replay().same, true);
              c.namedIssues = [...new Set([...c.namedIssues, ...d.r.issues().map((i) => i.code)])];
            }
      c.eq("all runs", runs, 9 * 8 * 15 * 2);
      c.yes("injected with a fiber live", withLive > 0);
      c.yes("injected with a choice of tasks", withChoice > 0);
      c.yes("shuffles had choices", choices > 0);
      c.eq(
        "only defects raise issues",
        c.namedIssues.filter((x) => x !== "Defect"),
        [],
      );
    },
  },
  {
    id: "DRV-02",
    kind: "fault",
    fixtures: [drvFixture],
    actor: { actor: "Drv", id: "a" },
    cites: ["D6"],
    namedIssues: ["Defect"],
    run(c) {
      c.ensure();
      c.fault({ startThrows: "job" });
      c.send("GoBoth", { behaviour: "sync" });
      c.eq("the rest of the list ran", c.endings("other").length, 1);
      c.eq("a start that throws is a Defect ending", c.lastEnding("job")?.reason, "Defect");
      c.eq("delivered", c.mem().ends.includes("unknown"), true);
    },
  },
  {
    id: "DRV-03",
    kind: "fault",
    fixtures: [issuesFixture, ringFixture],
    actor: issueA,
    cites: ["D46"],
    namedIssues: ["ModuleDefect"],
    variants: {
      "throw-at-settlement"(c) {
        c.ensure();
        c.send("Load");
        c.answer("list", { truth: true });
        c.send("Toggle", { id: "i1", liked: true });
        c.fault({ throwInModule: "ended" });
        c.answer("like", { apply: true });
        c.eq("issue", c.r.issues().at(-1)?.code, "ModuleDefect");
        c.eq("the lane resolved anyway", c.r.row(c.A, "like", { id: "i1" }), undefined);
        c.eq("ending delivered", c.r.evidence("delivered").at(-1)?.["event"], "Settled");
      },
      // H3: fail closed. What joined it stays unsent; machines not using it go on.
      "a-disabled-store-holds-its-queue"(c) {
        const B = { actor: "Issues/List", id: "b" };
        const R = { actor: "Ring", id: "r" };
        c.ensure();
        c.ensure(B);
        c.ensure(R);
        c.send("Toggle", { id: "i1", liked: true });
        c.to(B, "Toggle", { id: "i1", liked: false });
        c.eq("B waits", c.reqs("like").length, 1);
        c.fault({ throwInModule: "ended" });
        c.answer("like", { apply: true });
        c.eq("B does not go: nobody can say it is its turn", c.reqs("like").length, 1);
        c.eq("Inspection says so", c.stalled("like"), "module");
        c.to(R, "Work", { n: 1, who: "r" });
        c.eq("a machine not using it goes on", c.reqs("job").length, 1);
      },
      "a-disabled-store-declines-what-would-join"(c) {
        const B = { actor: "Issues/List", id: "b" };
        c.ensure();
        c.ensure(B);
        c.send("Toggle", { id: "i1", liked: true });
        c.fault({ throwInModule: "start" });
        c.to(B, "Toggle", { id: "i1", liked: false });
        c.eq("not sent", c.reqs("like").length, 1);
        c.eq("issue", c.r.issues().at(-1)?.code, "ModuleDefect");
        c.eq("declined, with an ending", c.lastEnding("like")?.reason, "ModuleDisabled");
        c.eq("told", (c.r.memory(B) as any).toast, "Could not update");
        c.to(B, "Toggle", { id: "i2", liked: true });
        c.eq("and the next one too", c.reqs("like").length, 1);
      },
      // L6: a refused turn does not bring a disabled module back.
      "disabled-survives-a-refused-turn"(c0) {
        const c = new Ctx(c0.fresh([issuesThrowing]), issueA);
        c.ensure();
        c.fault({ throwInModule: "prepare" });
        c.fault({ throwIn: "on.TwoBad[0].actions[1]" });
        c.send("TwoBad", { id: "i1" });
        c.eq(
          "both named",
          c.r
            .issues()
            .map((i) => i.code)
            .sort(),
          ["InvalidTurn", "ModuleDefect"],
        );
        c0.namedIssues = ["ModuleDefect", "InvalidTurn"];
        c.send("Toggle", { id: "i1", liked: true });
        c.eq("still disabled: declined", c.lastEnding("like")?.reason, "ModuleDisabled");
      },
    },
  },
  {
    id: "DRV-04",
    kind: "example",
    fixtures: [drvFixture],
    actor: { actor: "Drv", id: "a" },
    cites: ["no-decision"],
    run(c) {
      // XState actor.test.ts:1300,1341: a sync completion during self-initialisation. Here: ensure and send from a
      // subscriber while a sync commit completes. Decided: ensure queues like any input (RESULTS).
      const B = { actor: "Drv", id: "b" };
      c.ensure();
      let once = false;
      c.h.subscribe(() => {
        if (once) return;
        once = true;
        c.h.raw({ ensure: B });
        c.h.send(B, "Go", { behaviour: "sync" });
      });
      c.send("Go", { behaviour: "sync" });
      c.eq("first actor ended", c.mem().ends, ["success"]);
      c.eq("second actor ended", c.mem(B).ends, ["success"]);
    },
  },
];
