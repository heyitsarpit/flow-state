// SEARCH-FLUSH (owner's concern: does an interval expose a consistency bug?). Flush timing is an ACTION, not a duration: the timer is out of reach (`captureMs` huge), and a plain
// flush (the host's hide), a late failure and a kill can each happen at any step. Oracles read Reads and the fake only, and no interval:
//   (a) no second Attempt for a key while an earlier may be at the server, unreleased;
//   (b) a restored actor is a cut the actor really published. EXCEPTION, precisely: the actor's cut is always a past one, but paired with a lane the cut never saw, when a plain
//       batch failed and the lane's ack landed, or the lane's batch went without it. Counted as class `lane-ahead-of-memory`, not a failure;
//   (c) nothing stays held for good: after everything is answered and time passes, the machine's owner action clears a hold;
//   (d) a guard never sees two turns' memory: a whole past cut, and pairs that change together are equal.
import { fragPairFixture, FragPairId, bareFixture, BareId } from "../fixtures/round7.compiled.ts";
import { payFixture } from "../fixtures/pay.compiled.ts";
import type { Answer, Fixture, Harness, Step } from "../harness.ts";
import { checkClaims, checkEndings } from "../scenarios/ctx.ts";
import { bfs, Oracle, type Action, type Report } from "./engine.ts";
import { moneyAudit, PAY_PINS } from "./pay.search.ts";

type Target = "pay" | "bare" | "frag";
const canon = (v: unknown): string =>
  JSON.stringify(v, (_k, x) =>
    x && typeof x === "object" && !Array.isArray(x)
      ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]]))
      : typeof x === "bigint"
        ? `${x}n`
        : x,
  ) ?? "undefined";
// The suite's own wrap: every guard logs the memory it was shown. Compiled is plain data, so this needs no runtime.
const logGuards = (v: any, log: string[]): any => {
  if (Array.isArray(v)) return v.map((x) => logGuards(x, log));
  if (v === null || typeof v !== "object") return v;
  if (Object.getPrototypeOf(v) !== Object.prototype) return v;
  return Object.fromEntries(
    Object.entries(v).map(([k, x]) => {
      if (k === "guards" && Array.isArray(x))
        return [
          k,
          x.map((g: any) => ({
            ...g,
            run: (a: any) => {
              log.push(canon(a.memory));
              return g.run(a);
            },
          })),
        ];
      if (typeof x === "function" || k === "commit") return [k, x];
      return [k, logGuards(x, log)];
    }),
  );
};
const CFG: Record<
  Target,
  {
    fixture: Fixture;
    actor: { actor: string; id: string };
    op: string;
    to?: readonly string[];
    pair?: (m: any) => boolean;
    actions: readonly Action[];
    boot?: (h: Harness) => void;
    owners: readonly string[];
  }
> = {
  pay: {
    fixture: payFixture,
    actor: { actor: "Checkout/Pay", id: "shopper-1" },
    op: "pay",
    owners: [],
    actions: [],
  },
  bare: {
    fixture: bareFixture(),
    actor: { actor: BareId, id: "a" },
    op: "charge",
    pair: (m) => m.note === m.noteCopy,
    owners: ["Forget"],
    actions: [],
  },
  frag: {
    fixture: fragPairFixture,
    actor: { actor: FragPairId, id: "a" },
    op: "put",
    to: ["t"],
    pair: (m) => m.a === m.b,
    owners: ["Forget"],
    actions: [],
  },
};
export const searchFlush = (
  make: () => Harness,
  target: Target,
  o: { depth: number; maxStates: number; deadlineMs: number },
  tight = false, // a small alphabet, to reach depth: what a late failure, a flush and a kill can do to one write
): Report & { unpinned: readonly string[]; exceptions: number; exceptionWitness?: string } => {
  const c = CFG[target];
  const A = c.actor;
  const send = (event: string, payload: unknown = {}): Step => ({
    send: A,
    event,
    payload,
    ...(c.to ? { to: c.to } : {}),
  });
  const open = (op: string) => (h: Harness) => h.read.outside().open.some((x) => x.op === op && !x.never);
  const storage = (h: Harness) => h.read.outside().storage.some((s) => !s.hung && s.purpose !== "flush");
  const ans = (name: string, op: string, a: Answer): Action => ({ name, step: { answer: op, with: a }, on: open(op) });
  const edge: readonly Action[] = [
    { name: "FLUSH", step: { hide: true } },
    { name: "KILL", step: { reload: true } },
    { name: "failNext", step: { fault: { storageFailsLate: 1 } } },
    { name: "failHeld", step: { fault: { storageFailsHeld: 1 } } },
    { name: "sayFailed", step: { storage: "failLate" }, on: (h) => h.read.outside().failing > 0 },
    { name: "ack", step: { storage: "ack" }, on: storage },
    { name: "refuse", step: { storage: "refuse" }, on: storage },
    { name: "landNoAck", step: { storage: "landNoAck" }, on: storage },
    { name: "tick", step: { advance: 1100 } }, // a retry's backoff; the capture timer is out of reach
  ];
  const CAP = { status: "requires_capture", clientSecret: "" };
  const body: readonly Action[] =
    target === "pay"
      ? [
          { name: "Pay", step: send("PayRequested", { paymentMethodId: "visa" }) },
          { name: "Leave", step: send("Leave") },
          { name: "Choose", step: send("CardChosen", { paymentMethodId: "amex" }) },
          { name: "tick3s", step: { advance: 3000 } },
          ans("pay.ok", "pay", { ok: CAP }),
          ans("pay.lost", "pay", { lost: true }),
          ans("intent", "intent", { truth: true }),
          ans("order", "order", { truth: true }),
          ans("place.ok", "place", { ok: { orderId: "o1" } }),
          ans("void.ok", "void", { ok: {} }),
        ]
      : [
          { name: "Go", step: send("Go") },
          target === "bare"
            ? { name: "Note", step: send("Note", { text: "x" }) }
            : { name: "Set", step: send("Set", { n: 1 }) },
          target === "bare"
            ? { name: "Note2", step: send("Note", { text: "y" }) }
            : { name: "Set2", step: send("Set", { n: 2 }) },
          { name: "Peek", step: send("Peek") },
          { name: "Retry", step: send("Retry") },
          { name: "Forget", step: send("Forget") },
          ans("ok", c.op, { ok: {} }),
          ans("lost", c.op, { lost: true }),
        ];
  let exceptions = 0;
  let exceptionWitness: string | undefined;
  const logs = new WeakMap<object, string[]>();
  const innerBad = new WeakMap<object, string>();
  const keyOf = `${A.actor}/${A.id}`;
  const cutOf = (f: any) => {
    const v = f.view[keyOf];
    return v && canon({ s: v.state, m: v.memory });
  };
  const seenPairs = (h: Harness) => h.read.frames();
  const unpinnedAt = new Map<string, string>();
  const rep = bfs({
    make: () => {
      const inner = make();
      const log: string[] = [];
      const fx: Fixture = { ...c.fixture, make: (api) => logGuards(c.fixture.make(api), log) };
      inner.start({ machines: [fx], seed: 1, bounds: { captureMs: 2_000_000_000 } });
      logs.set(inner, log);
      // (b) for a fragment: frames show the root's memory only, so its inner memory is read after each action and at each kill.
      if (c.to) {
        const innerSeen = new Set<string>();
        const raw = inner.do.bind(inner);
        const read = () => {
          const m = inner.read.inner(A, c.to!)?.memory;
          return m === undefined ? undefined : canon(m);
        };
        inner.do = (st: Step) => {
          raw(st);
          const m = read();
          if (!m) return;
          if ("reload" in st && !innerSeen.has(m)) innerBad.set(inner, m);
          innerSeen.add(m);
        };
      }
      inner.do({ ensure: A });
      if (target === "pay") inner.do({ send: A, event: "Start", payload: { cartId: "c1", intentId: "pi1" } });
      inner.do({ hide: true }); // the first record: a search of what comes after, not of first-visit loss
      return inner;
    },
    actions: tight
      ? [...body, ...edge].filter((a) =>
          ["Go", "Note", "Set", "failHeld", "sayFailed", "ack", "FLUSH", "KILL", "lost", "ok", "Pay", "pay.ok", "pay.lost"].includes(a.name),
        )
      : [...body, ...edge],
    ...o,
    edge(pre, post) {
      // (a)
      const seen = new Set(pre.read.requests().filter((x) => x.op === c.op).map((x) => x.idempotencyKey));
      const mayHave = new Set(pre.read.outside().mayHave);
      const released = new Set(post.read.evidence("Released").map((e) => e["attempt"]));
      for (const q of post.read.requests().filter((x) => x.op === c.op)) {
        if (seen.has(q.idempotencyKey)) continue;
        for (const old of seen)
          if (mayHave.has(old!) && !released.has(old))
            throw new Oracle(`(a) a second Attempt ${q.idempotencyKey} beside undecided ${old}`);
      }
    },
    state(h, script) {
      checkClaims(h.read);
      checkEndings(h.read);
      const bad = innerBad.get(h);
      if (bad) throw new Oracle(`(b) a fragment restored memory it never had: ${bad}`);
      const frames = seenPairs(h) as any[];
      // (b) Every boot's cut is an earlier cut. Rows compared separately: the lane may be ahead of the memory.
      const earlier = new Set<string>();
      const earlierRows = new Set<string>();
      for (const f of frames) {
        const cut = cutOf(f);
        if (f.cause === "boot" && cut) {
          if (!earlier.has(cut)) throw new Oracle(`(b) restored a cut never published: ${cut.slice(0, 200)}`);
          const v = f.view[keyOf];
          if (!earlierRows.has(canon({ cut, r: v.rows }))) {
            exceptions++;
            exceptionWitness ??= `${script.join(" ")} => ${canon({ state: v.state, rows: v.rows })}`;
          }
        }
        if (cut) {
          earlier.add(cut);
          earlierRows.add(canon({ cut, r: f.view[keyOf].rows }));
        }
      }
      // (d)
      const memories = new Set(frames.map((f) => f.view[keyOf]?.memory).filter(Boolean).map(canon));
      const initial = target === "frag" ? undefined : undefined;
      void initial;
      for (const m of logs.get(h) ?? []) {
        const parsed = JSON.parse(m);
        if (c.pair && !c.pair(parsed)) throw new Oracle(`(d) a guard saw two turns: ${m}`);
        if (target !== "frag" && !memories.has(m) && frames.length > 0) {
          // a guard runs before its own frame exists, so what it saw is a cut only if the state it was shown is the live one or an earlier one
          const live = canon(h.read.memory(A));
          if (m !== live) throw new Oracle(`(d) a guard saw memory no cut has: ${m.slice(0, 200)}`);
        }
      }
    },
    drain(h, script, report) {
      // (c) Everything is answered, time passes, the disk catches up, a last kill.
      for (let i = 0; i < 14; i++) {
        const out = h.read.outside();
        const has = (op: string) => out.open.some((x) => x.op === op && !x.never);
        if (h.read.outside().storage.some((s) => !s.hung && s.purpose !== "flush")) h.do({ storage: "ack" });
        else if (has(c.op)) h.do({ answer: c.op, with: target === "pay" ? { ok: CAP } : { ok: {} } });
        else if (has("place")) h.do({ answer: "place", with: { ok: { orderId: "o1" } } });
        else if (has("void")) h.do({ answer: "void", with: { ok: {} } });
        else if (has("intent")) h.do({ answer: "intent", with: { truth: true } });
        else if (has("order")) h.do({ answer: "order", with: { truth: true } });
        else h.do({ advance: 3000 });
      }
      if (target === "pay") {
        for (const cls of moneyAudit(h)) {
          report(cls);
          const [k, st] = cls.split(":");
          const text = script.join(" ");
          const pin = PAY_PINS.find((p) => p.cls === k && (p.state === undefined || p.state === st) && p.via.test(text.replace(/\bPay\b/g, "PayRequested").replace(/\bKILL\b/g, "reload")));
          // P7, new here (proposed): Pay maps `void`'s NotSent to Voided, so a refused ack says "released" with the hold still there. pay.definition.ts: `NotSent: E.Voided`. Same at capture 0.
          const p7 = k === "charged-unaccounted" && /\brefuse\b/.test(text) && /Leave/.test(text);
          if (!pin && !p7 && !unpinnedAt.has(cls)) unpinnedAt.set(cls, text);
        }
        return;
      }
      for (const e of c.owners) h.do(send(e));
      for (let i = 0; i < 6; i++) h.do({ advance: 3000 });
      const held = h.read.quiet().waits.filter((w) => w.kind === "held");
      if (held.length) report(`(c) held for good: ${held.map((w) => ("op" in w ? w.op : "")).join()}`);
      if (held.length && !unpinnedAt.has("(c)")) unpinnedAt.set("(c)", script.join(" "));
    },
  });
  const unpinned = [...unpinnedAt].map(([k, w]) => `${k} via ${w}`);
  return {
    ...rep,
    unpinned,
    exceptions,
    ...(exceptionWitness ? { exceptionWitness } : {}),
    verdict: rep.verdict !== "failed" && unpinned.length ? "failed" : rep.verdict,
    ...(rep.verdict !== "failed" && unpinned.length ? { failure: unpinned[0]! } : {}),
  };
};
