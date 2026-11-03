// Round 10, stage A: the small runtime fixes, each with a pin. Each case says what it would see on round 9's runtime.
import { Effect } from "effect";
import { ChainId, chainFixture } from "../typed/round9b.ts";
import { fixtureOf, unknownWhenLost } from "../fixtures/build.ts";
import { feedFixture } from "../fixtures/lab.compiled.ts";
import { payFixture } from "../typed/pay.ts";
import type { Api } from "../fake-world.ts";
import type { Fixture } from "../harness.ts";
import { Ctx, Mismatch, type Scenario } from "./ctx.ts";
const A = { actor: ChainId, id: "a" };
const PAY_A = { actor: "Checkout/Pay", id: "shopper-1" };
const B = { actor: ChainId, id: "b" };
const on = (c0: Ctx, f: Fixture, a: { actor: string; id: string }, bounds?: Record<string, number>) => {
  const c = new Ctx(c0.fresh([f], { captureMs: 0, drainMs: 1, ...bounds }), a);
  c.ensure();
  return c;
};
const micro = (c: Ctx, op: string, x: any) => c.fault({ microAnswer: [op, x] });

// A small machine of a chosen name and states, for the names below. Setting memory, one write.
const small = (id: string, o: { states?: readonly string[]; persisted?: boolean; initial?: () => unknown } = {}): Fixture => {
  const b = fixtureOf(id);
  const states = o.states ?? ["A"];
  return {
    id,
    make: (api: Api) => ({
      id,
      root: "root",
      default: states[0]!,
      nodes: {
        root: b.node("root", {
          Set: [{ patch: ({ event }: any) => event.m }],
          Go: [{ members: b.commit("w", ({ event }: any) => ({ k: event.k })) }],
          Ok: [{}],
          No: [{}],
          Un: [{}],
          ...Object.fromEntries(states.map((s) => [`To${s}`, [{ target: s }]])),
        }),
        ...Object.fromEntries(states.map((s) => [s, b.node(s)])),
      },
      memory: b.memory((o.initial ?? (() => ({}))) as never),
      ops: {
        w: {
          id: "w",
          contract: "m/w",
          kind: "write",
          key: b.key("w", (i: any) => i.k ?? null),
          concurrency: "reject",
          commit: (input: any, { attempt }: any) => (api.call("w", input, { idempotencyKey: attempt.id }) as Effect.Effect<unknown, any>).pipe(unknownWhenLost),
          outcomes: { success: { event: "Ok" }, failure: { NotSent: { event: "No" } }, unknown: { event: "Un" } },
        },
      },
      persisted: o.persisted ?? true,
      uses: [],
    }),
  };
};

// Review part two, `letgo-takes-all`: a resumable fragment's unkeyed op has the host's subject, so the host's `cancel` reaches a frozen life's lane. Its kept ending must survive the cancel of the ordinary one.
const LetId = "Lab/Let";
const letFixture = (): Fixture => {
  const e = fixtureOf(LetId);
  const fr = fixtureOf("LetFrag");
  const Frag: any = {
    id: "LetFrag",
    root: "root",
    default: "root",
    nodes: {
      root: fr.node("root", {
        Do: [{ members: fr.commit("job", () => ({ id: "k" })) }],
        JobOk: [{ patch: ({ memory }: any) => ({ heard: memory.heard + 1 }) }],
        JobNo: [{}],
        JobUnsure: [{}],
      }),
    },
    memory: { initial: fr.slot("memory.initial", () => ({ heard: 0 })) },
  };
  return {
    id: LetId,
    make: (api: Api) => ({
      id: LetId,
      root: "root",
      default: "A",
      fragments: { LetFrag: Frag },
      nodes: {
        root: e.node("root", { ToF: [{ target: "F" }], Out: [{ target: "A" }], Forget: [{ members: e.member("job", "cancel") }] }),
        A: e.node("A", {}),
        F: { ...e.node("F", {}), placements: [{ name: "f", fragment: "LetFrag", resumable: true }] },
      },
      memory: e.memory(() => ({})),
      ops: {
        job: {
          id: "job",
          contract: "lab/job",
          fragment: "LetFrag",
          kind: "write",
          key: e.key("job", (i: any) => ({ id: i.id })),
          concurrency: "serialize",
          commit: (input: any, { attempt }: any) => (api.call("job", input, { idempotencyKey: attempt.id }) as Effect.Effect<unknown, any>).pipe(unknownWhenLost),
          outcomes: { success: { event: "JobOk" }, failure: { NotSent: { event: "JobNo" } }, unknown: { event: "JobUnsure" } },
        },
      },
      persisted: false,
      uses: [],
    }),
  } as Fixture;
};

export const round10Scenarios: readonly Scenario[] = [
  {
    id: "R10-PINS",
    kind: "fault",
    fixtures: [letFixture()],
    actor: { actor: LetId, id: "a" },
    cites: ["D123", "rule:51"],
    namedIssues: ["InvalidTurn"],
    variants: {
      // Under-specification A07: an ensure refused at its start rolls back and names where (rule 12, L9). These lines had no case.
      "a-refused-ensure-rolls-back-and-names-its-origin"(c0) {
        const c = new Ctx(c0.fresh([small("R", { initial: () => 5 })], { captureMs: 0 }), { actor: "R", id: "a" });
        c.ensure();
        c.eq("no actor", c.r.state(c.A), undefined);
        const i = c.r.issues().filter((x) => x.code === "InvalidTurn");
        c.eq("one refusal", i.length, 1);
        c.yes(`it names the closure: ${i[0]?.origin}`, (i[0]?.origin ?? "").includes("memory.initial"));
        c.eq("nothing in mail, no evidence of a start", c.r.evidence("initial").length, 0);
      },
      // Review M4, the survivor `second-try-lost-if-mail`: an ending refused once gets its second try even while another actor has mail.
      "a-second-try-beside-another-actors-mail-is-not-lost"(c0) {
        const c = on(c0, chainFixture(), A);
        c.ensure(B);
        micro(c, "pw", { ok: {} });
        c.fault({ throwIn: "on.PwOk[0].updateMemory", times: 1 });
        // B's burst is served across slices, so its mail is still there when A's ending lands and is refused.
        c.h.raw({ burst: B, event: "Press", n: 300 });
        c.do({ sendMany: [[A, "Pw", {}]] });
        c.eq("refused once", c.r.issues().filter((i) => i.code === "InvalidTurn").length, 1);
        c.eq("heard on its second try", (c.r.memory(A) as any).heard, true);
        c.eq("B's mail all heard too", (c.r.memory(B) as any).presses, 300);
      },
      "a-hosts-cancel-lets-go-the-ordinary-and-keeps-the-kept"(c) {
        c.ensure();
        c.send("ToF");
        c.into(["f"], "Do");
        c.into(["f"], "Do");
        c.fault({ throwIn: "on.JobOk[0].updateMemory", times: 2 });
        c.answer("job", { ok: {} });
        c.send("Out");
        c.answer("job", { ok: {} });
        c.eq("two parked: kept, ordinary", c.r.quiet().waits.filter((w) => w.kind === "parked").length, 2);
        c.send("Forget");
        c.eq("the kept one stays", c.r.quiet().waits.filter((w) => w.kind === "parked").length, 1);
        c.send("ToF");
        c.eq("the thaw hears it", (c.inner(["f"]) as any)?.memory?.heard, 1);
      },
    },
  },
  {
    id: "R10-RUNTIME",
    kind: "fault",
    fixtures: [chainFixture()],
    actor: A,
    cites: ["D136", "D137", "D138", "D139", "D140", "D141"],
    namedIssues: ["UnencodableValue", "ActorMachineMismatch"],
    outputAllow: { sections: ["requests", "actors", "evidence", "frames", "hashes", "outside", "waits"], why: "how far a spin gets in a step is the work clock's count" },
    variants: {
      // Review H1. Round 9: a 1 ms listener against a 1 ms slice, and 100 answers a task, since only the step was billed.
      "a-listener-that-costs-is-on-the-bill"(c0) {
        const c = on(c0, chainFixture(), A);
        micro(c, "spin", { ok: {} });
        c.h.subscribe(() => c.h.raw({ chargeWork: 1 }));
        c.do({ tasksPerStep: 40 });
        c.send("Spin");
        const n = c.reqs("spin").length;
        c.yes(`a task per a few answers: ${n} in 40 tasks`, n <= 40 * 3);
        c.yes("it ran", n >= 20);
      },
      // Review H2. Round 9: past `notifyChain` slices the listener's sends were dropped, named TurnStorm.
      "a-listener-that-sends-across-slices-loses-nothing"(c0) {
        const c = on(c0, chainFixture(), A);
        c.ensure(B);
        // Inside the pump: an answer by microtask goes through `input` and resets the chain itself, which is why nothing saw H2.
        c.fault({ syncAnswer: ["spin", { ok: {} }] });
        let sent = 0;
        c.h.subscribe(() => {
          if (sent < 200) {
            sent++;
            c.h.send(B, "Press", {});
          }
        });
        c.do({ tasksPerStep: 400 });
        c.send("Spin");
        c.yes("more slices than the bound", sent === 200);
        c.eq("nothing dropped", c.r.evidence("dropped").length, 0);
        c.eq("not called a storm", c.r.issues().filter((i) => i.code === "TurnStorm").length, 0);
        c.do({ tasksPerStep: 100 });
        c.send("Stop");
        c.do({ tasksPerStep: null });
        c.eq("all heard", (c.r.memory(B) as any).presses, 200);
      },
      // A real storm, in one stack, is still cut: the fix is not a removal of the bound.
      "a-storm-in-one-stack-is-still-cut"(c0) {
        c0.namedIssues = ["TurnStorm"];
        const c = on(c0, chainFixture(), A, { drainMs: 1000 });
        c.h.subscribe(() => c.h.send(A, "Press", {}));
        c.send("Press");
        c.eq("named", c.r.issues().filter((i) => i.code === "TurnStorm").length, 1);
        c.yes("cut", c.r.evidence("dropped").length > 0);
      },
      // Review M3. Round 9: one listener call per answer.
      "one-notify-per-task"(c0) {
        const c = on(c0, chainFixture(), A);
        micro(c, "spin", { ok: {} });
        let heard = 0;
        c.h.subscribe(() => void heard++);
        c.do({ tasksPerStep: 40 });
        c.send("Spin");
        const n = c.reqs("spin").length;
        c.yes(`fewer calls than answers: ${heard} against ${n}`, heard * 2 < n);
        c.yes("heard in each task or so", heard >= 20);
      },
      "a-quiet-end-is-still-heard"(c0) {
        const c = on(c0, chainFixture(), A);
        let seen = -1;
        c.h.subscribe(() => void (seen = (c.r.memory(A) as any).presses));
        c.h.raw({ send: A, event: "Press", payload: {} });
        c.h.raw({ send: A, event: "Press", payload: {} });
        c.h.raw({ send: A, event: "Press", payload: {} });
        c.do({ advance: 0 });
        c.eq("the last listener call saw the last turn", seen, 3);
      },
      // O F5. Round 9: both shared one actor, in silence.
      "x-slash-y-is-not-a-second-machines-actor"(c0) {
        const M = small("M");
        const Mx = small("M/x");
        const c = new Ctx(c0.fresh([M, Mx], { captureMs: 0 }), { actor: "M", id: "x/y" });
        const a = { actor: "M", id: "x/y" };
        const b = { actor: "M/x", id: "y" };
        c.ensure(a);
        c.ensure(b);
        c.to(a, "Set", { m: { from: "a" } });
        c.to(b, "Set", { m: { from: "b" } });
        c.eq("a", c.r.memory(a), { from: "a" });
        c.eq("b", c.r.memory(b), { from: "b" });
        c.reload();
        c.eq("a after a reload", c.r.memory(a), { from: "a" });
        c.eq("b after a reload", c.r.memory(b), { from: "b" });
      },
      // D137: the runtime's half, with a key given to it directly.
      "ensure-of-a-live-key-with-another-machine-is-named"(c0) {
        const c = new Ctx(c0.fresh([small("M"), small("N")], { captureMs: 0 }), { actor: "M", id: "a" });
        c.ensure();
        c.to(c.A, "Set", { m: { kept: 1 } });
        c.do({ ensureAs: { key: { actor: "M", id: "a" }, machine: "N" } });
        c.eq("named", c.r.issues().filter((i) => i.code === "ActorMachineMismatch").length, 1);
        c.eq("the actor is as it was", c.mem(), { kept: 1 });
      },
      // O F5. Round 9: a state `self` could not be entered, and said nothing.
      "a-state-named-self-is-refused-at-the-seal"(c0) {
        for (const name of ["self", "__proto__"]) {
          let said = "";
          try {
            c0.fresh([small("S", { states: ["A", name] })]);
          } catch (e) {
            said = (e as Error).message;
          }
          c0.yes(`${name}: ${said}`, said.startsWith("ReservedStateName"));
        }
      },
      // O F4. Round 9: Fatal.
      "a-symbol-in-an-input-declines-and-stops-nothing"(c0) {
        const c = on(c0, small("V"), { actor: "V", id: "a" });
        c.send("Go", { k: Symbol("a") });
        c.yes("not fatal", !c.r.quiet().fatal);
        c.eq("named", c.r.issues().filter((i) => i.code === "UnencodableValue").length >= 1, true);
        c.eq("no request", c.reqs("w").length, 0);
        c.send("Go", { k: "b" });
        c.ack();
        c.eq("the runtime goes on", c.reqs("w").length, 1);
      },
      "a-symbol-or-nan-in-memory-is-named-and-the-last-capture-stays"(c0) {
        for (const bad of [Symbol("s"), Number.NaN, Number.POSITIVE_INFINITY]) {
          const c = on(c0, small("V"), { actor: "V", id: "a" });
          c.send("Set", { m: { good: 1 } });
          c.send("Set", { m: { v: bad } });
          c.yes(`named: ${String(bad)}`, c.r.issues().some((i) => i.code === "UnencodableValue"));
          c.reload();
          c.eq("the last good capture", c.mem(), { good: 1 });
        }
      },
      // O F7: linear. Round 9's 100,000 took 85 s, 10,000 about 1 s. Round 10 in the driver, no log: conformance/bench/burst.ts. Here the shape, and that a queue's reads hold.
      "a-burst-is-served-in-order-across-slices"(c0) {
        const c = on(c0, chainFixture(), A);
        c.ensure(B);
        c.h.raw({ burst: A, event: "Press", n: 400 });
        c.h.raw({ burst: B, event: "Press", n: 400 });
        c.do({ advance: 0 });
        c.eq("A", (c.r.memory(A) as any).presses, 400);
        c.eq("B", (c.r.memory(B) as any).presses, 400);
      },
      // D141, bugs M3: two states with other futures are two states.
      "two-dates-are-two-states"(c0) {
        const h = (v: unknown) => {
          const c = on(c0, small("V", { persisted: false }), { actor: "V", id: "a" });
          c.send("Set", { m: { at: v } });
          return c.r.stateHash();
        };
        if (h(new Date(0)) === h(new Date(86_400_000))) throw new Mismatch("a Date collapsed in the hash");
        if (h(new Map([["a", 1]])) === h(new Map([["b", 1]]))) throw new Mismatch("a Map collapsed in the hash");
        if (h(new Set([1])) === h(new Set([2]))) throw new Mismatch("a Set collapsed in the hash");
        if (h(Number.NaN) === h(null)) throw new Mismatch("NaN collapsed into null");
      },
      // D143, over-assumptions F2. Round 9: `{pos:1}` and `{pos:2}` hashed the same, so a search could call a guard on `pos` closed.
      "a-user-field-the-normaliser-ranks-keeps-two-states"(c0) {
        for (const f of ["pos", "since", "mint", "boot", "sentAt", "doubt", "landedAt"]) {
          const h = (n: number) => {
            const c = on(c0, small("V", { persisted: false }), { actor: "V", id: "a" });
            c.send("Set", { m: { [f]: n } });
            return c.r.stateHash();
          };
          if (h(1) === h(2)) throw new Mismatch(`a memory field \`${f}\` of 1 and of 2 hashed the same`);
        }
      },
      "a-clock-set-back-is-another-state"(c0) {
        const c = on(c0, small("V", { persisted: false }), { actor: "V", id: "a" });
        c.state("A");
        const before = c.r.stateHash();
        c.do({ clockBack: 5_000 });
        if (before === c.r.stateHash()) throw new Mismatch("a clock set back hashed the same");
      },
    },
  },
  {
    // Round 10 stage C, from the re-audit's M3: two runtime rules no case reached.
    id: "R10-AUDIT",
    kind: "fault",
    fixtures: [payFixture],
    actor: PAY_A,
    cites: ["D8", "rule:25"],
    variants: {
      // `step.ts` fences a timer by its generation. A cancel that loses the race (the task was queued) fires the old timer under a key a newer
      // one now holds: the first send's timeout, while its resend waits. The resend must keep its own 60 s.
      "a-stale-timer-under-a-newer-one-is-fenced"(c) {
        c.ensure();
        c.send("Start", { cartId: "c1", intentId: "pi1" });
        c.send("PayRequested", { paymentMethodId: "visa" });
        c.ack();
        const sentAt = c.r.now();
        c.fault({ lateCancel: 1 });
        c.answer("pay", { lost: true });
        c.state("UNSURE");
        c.advance(3000);
        c.answer("order", { ok: null });
        c.answer("intent", { ok: { status: "requires_payment_method" } });
        c.ack();
        c.eq("re-sent", c.reqs("pay").length, 2);
        c.advance(sentAt + 60_000 + 500 - c.r.now()); // past the first send's timeout, before the resend's
        c.state("PAYING");
        c.yes("the old timer fired and was fenced", c.r.evidence("fence").some((e) => String(e["timer"]).startsWith("timeout/")));
        c.advance(4000);
        c.state("UNSURE");
        c.eq("then the resend's own timeout", c.lastEnding("pay")?.reason, "TimedOut");
      },
    },
  },
  {
    // Re-audit H1: an ending to a live actor is heard, whoever else has mail. The suite, not the runtime, says when it may go as evidence.
    id: "R10-AUDIT-ENDINGS",
    kind: "fault",
    fixtures: [chainFixture()],
    actor: A,
    cites: ["rule:44", "D125"],
    variants: {
      "a-failure-beside-another-actors-mail-is-heard"(c0) {
        const c = on(c0, chainFixture(), A);
        c.ensure(B);
        micro(c, "pw", { fail: { tag: "NotSent" } });
        c.h.raw({ burst: B, event: "Press", n: 300 });
        c.do({ sendMany: [[A, "Pw", {}]] });
        c.yes("A heard its failure", c.r.evidence("turn").some((e) => e["actor"] === `${A.actor}/${A.id}` && e["event"] === "PwNo"));
      },
      // The same with no burst: two sends in one tick, so B's press is mail when A's failure lands.
      "a-failure-beside-one-send-is-heard"(c0) {
        const c = on(c0, chainFixture(), A);
        c.ensure(B);
        micro(c, "pw", { fail: { tag: "NotSent" } });
        c.do({ sendMany: [[A, "Pw", {}], [B, "Press", {}], [B, "Press", {}]] });
        c.yes("A heard its failure", c.r.evidence("turn").some((e) => e["actor"] === `${A.actor}/${A.id}` && e["event"] === "PwNo"));
        c.eq("B pressed twice", (c.r.memory(B) as any).presses, 2);
      },
    },
  },
  {
    // The other: disposing the runtime aborts a read in flight. The server sees the signal; nothing is left open at the outside.
    id: "R10-AUDIT-READS",
    kind: "fault",
    fixtures: [feedFixture],
    actor: { actor: "Feed", id: "a" },
    cites: ["rule:52"],
    run(c) {
      c.ensure();
      c.into(["tail"], "Sync");
      c.yes("a read in flight", c.r.outside().open.some((r) => r.op === "catchUp"));
      c.do({ disposeRuntime: true });
      c.eq("aborted at the server by disposal", c.r.outside().open.filter((r) => r.op === "catchUp").length, 0);
    },
  },
];
