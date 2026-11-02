// SEARCH-FLUSH: does the disk hold together, whatever the store and the timers do? Flush timing is an ACTION, not a duration: the timer is out of reach, and a plain flush, a late failure,
// a held success, a kill, a frozen tab and a clock set back can each happen at any step. Oracles read Reads and the fake only, and no interval:
//   (a) no second Attempt for a key while an earlier may be at the server, unreleased
//   (b) a restored actor is a cut it really published
//   (c) nothing stays held for good, once the owner acts
//   (d) a guard never sees two turns' memory
//   (e) the disk moves forward only, and is whole: lanes on disk belong with that memory. Allowed, counted, stated: lanes ahead of memory by puts (`lanesAhead`). Never: memory ahead of a lane
//   (f) a waiting state has something that can end it
//   (g) one batch out per actor: the fake throws
//   (h) write-ahead: now `checkClaims` in every state (D112): whatever may be at the server, undecided and unreleased, is the head of a lane on disk. `includes(key)` also matched `W`, and could not see H1
import { fragPairFixture, FragPairId, bareFixture, BareId } from "../fixtures/round7.compiled.ts";
import { payFixture } from "../fixtures/pay.compiled.ts";
import { serialBareFixture } from "../fixtures/round8.compiled.ts";
import type { Answer, Fixture, Harness, Step } from "../harness.ts";
import { checkClaims, checkEndings } from "../scenarios/ctx.ts";
import { bfs, Oracle, type Action, type Report } from "./engine.ts";
import { moneyAudit, PAY_PINS } from "./pay.search.ts";

export type Target = "pay" | "bare" | "frag" | "two" | "serialize";
const canon = (v: unknown): string =>
  JSON.stringify(v, (_k, x) =>
    x && typeof x === "object" && !Array.isArray(x)
      ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]]))
      : typeof x === "bigint"
        ? `${x}n`
        : x,
  ) ?? "undefined";
const logGuards = (v: any, log: string[]): any => {
  if (Array.isArray(v)) return v.map((x) => logGuards(x, log));
  if (v === null || typeof v !== "object") return v;
  if (Object.getPrototypeOf(v) !== Object.prototype) return v;
  return Object.fromEntries(
    Object.entries(v).map(([k, x]) => {
      if (k === "guards" && Array.isArray(x))
        return [k, x.map((g: any) => ({ ...g, run: (a: any) => (log.push(canon(a.memory)), g.run(a)) }))];
      if (typeof x === "function" || k === "commit") return [k, x];
      return [k, logGuards(x, log)];
    }),
  );
};
type Who = { actor: string; id: string };
const CFG: Record<Target, { fixture: Fixture; actors: readonly Who[]; op: string; to?: readonly string[]; pair?: (m: any) => boolean; owners: readonly string[]; waiting: readonly string[] }> = {
  pay: { fixture: payFixture, actors: [{ actor: "Checkout/Pay", id: "shopper-1" }], op: "pay", owners: [], waiting: ["PAYING", "PLACING"] },
  bare: { fixture: bareFixture(), actors: [{ actor: BareId, id: "a" }], op: "charge", pair: (m) => m.note === m.noteCopy, owners: ["Forget"], waiting: ["W"] },
  // Review H1: a commit can queue behind a ticket, so a plain write of that lane can exist beside it.
  serialize: { fixture: serialBareFixture(), actors: [{ actor: BareId, id: "a" }], op: "charge", pair: (m) => m.note === m.noteCopy, owners: ["Forget"], waiting: ["W"] },
  two: { fixture: bareFixture(), actors: [{ actor: BareId, id: "a" }, { actor: BareId, id: "b" }], op: "charge", pair: (m) => m.note === m.noteCopy, owners: ["Forget"], waiting: ["W"] },
  frag: { fixture: fragPairFixture, actors: [{ actor: FragPairId, id: "a" }], op: "put", to: ["t"], pair: (m) => m.a === m.b, owners: ["Forget"], waiting: [] },
};
export const searchFlush = (
  make: () => Harness,
  target: Target,
  o: { depth: number; maxStates: number; deadlineMs: number },
  tight = false,
  wide = false, // one store: only the oldest batch can answer, so a hang holds everyone
  directed: false | "store" | "queue" | "burst" | "wipe" = false, // a small alphabet for one risk. "store": a ticket beside a slow store; review: finds in 44 s what the wide one misses in 110 s. "queue": what waits behind a head
): Report & { unpinned: readonly string[]; lanesAhead: number; lanesAheadWitness?: string } => {
  const c = CFG[target];
  const send = (w: Who, event: string, payload: unknown = {}): Step => ({ send: w, event, payload, ...(c.to ? { to: c.to } : {}) });
  const open = (op: string) => (h: Harness) => h.read.outside().open.some((x) => x.op === op && !x.never);
  const storage = (h: Harness) => h.read.outside().storage.some((s) => !s.hung && s.purpose !== "late");
  const ans = (name: string, op: string, a: Answer, where?: Record<string, unknown>): Action => ({
    name,
    step: { answer: op, with: a, ...(where ? { where } : {}) },
    on: (h) => h.read.outside().open.some((x) => x.op === op && !x.never && (!where || Object.entries(where).every(([k, v]) => x.input?.[k] === v))),
  });
  const edge: readonly Action[] = [
    { name: "FLUSH", step: { hide: true } },
    { name: "KILL", step: { reload: true } },
    { name: "failNext", step: { fault: { storageFailsLate: 1 } } },
    { name: "failHeld", step: { fault: { storageFailsHeld: 1 } } },
    { name: "sayFailed", step: { storage: "failLate" }, on: (h) => h.read.outside().failing > 0 },
    { name: "ack", step: { storage: "ack" }, on: storage },
    { name: "refuse", step: { storage: "refuse" }, on: storage },
    { name: "landNoAck", step: { storage: "landNoAck" }, on: storage },
    { name: "hang", step: { storage: "hang" }, on: storage },
    { name: "holdPlain", step: { holdPlain: true } },
    { name: "slowAfterAck", step: { slowAfterAck: true } },
    // D109: the next success's turn refuses, and its redelivery too. Oracle (f) then asks what can end the waiting state.
    { name: "refuseOk", step: { fault: { throwIn: "on.Ok[0].updateMemory", times: 2 } } },
    // Round 9, D117: what oracle (j) is for. A burst past the queue's bound, a mapper that throws on a decline, and the origin gone.
    { name: "refuseNo", step: { fault: { throwIn: "operations.charge.NotSent", times: 2 } } },
    { name: "Burst", step: { burst: c.actors[0]!, event: "Go", n: 70 } },
    { name: "WIPE", step: { reload: true, wipe: true } },
    { name: "Ensure", step: { ensure: c.actors[0]!, input: { who: c.actors[0]!.id } } },
    { name: "freeze", step: { freeze: true } },
    { name: "thaw", step: { freeze: false } },
    { name: "clockBack", step: { clockBack: 60_000 } },
    { name: "tick", step: { advance: 1100 } },
  ];
  const CAP = { status: "requires_capture", clientSecret: "" };
  const body = (w: Who, s: string): readonly Action[] => [
    { name: `Go${s}`, step: send(w, "Go") },
    target === "frag" ? { name: "Set", step: send(w, "Set", { n: 1 }) } : { name: `Note${s}`, step: send(w, "Note", { text: "x" }) },
    target === "frag" ? { name: "Set2", step: send(w, "Set", { n: 2 }) } : { name: `Note2${s}`, step: send(w, "Note", { text: "y" }) },
    ...(target === "frag" ? [] : [{ name: `NoteBad${s}`, step: send(w, "NoteBad") }]),
    { name: `Peek${s}`, step: send(w, "Peek") },
    { name: `Retry${s}`, step: send(w, "Retry") },
    { name: `Forget${s}`, step: send(w, "Forget") },
    ans(`ok${s}`, c.op, { ok: {} }, target === "two" ? { who: w.id } : undefined),
    ans(`lost${s}`, c.op, { lost: true }, target === "two" ? { who: w.id } : undefined),
  ];
  const actions: readonly Action[] =
    target === "pay"
      ? [
          { name: "Pay", step: send(c.actors[0]!, "PayRequested", { paymentMethodId: "visa" }) },
          { name: "Leave", step: send(c.actors[0]!, "Leave") },
          { name: "Choose", step: send(c.actors[0]!, "CardChosen", { paymentMethodId: "amex" }) },
          { name: "tick3s", step: { advance: 3000 } },
          ans("pay.ok", "pay", { ok: CAP }),
          ans("pay.lost", "pay", { lost: true }),
          ans("intent", "intent", { truth: true }),
          ans("order", "order", { truth: true }),
          ans("place.ok", "place", { ok: { orderId: "o1" } }),
          ans("void.ok", "void", { ok: {} }),
        ]
      : c.actors.flatMap((w, i) => body(w, i === 0 ? "" : ".b"));
  const tightNames = /^(Go|Note|Set|NoteBad|Peek|Forget|failHeld|sayFailed|ack|FLUSH|KILL|lost|ok|Pay|pay\.ok|pay\.lost)/;
  const directedNames =
    directed === "queue" ? /^(Go|ok|lost|Retry|Forget|ack|landNoAck|KILL|refuseOk|refuseNo)$/
    : directed === "burst" ? /^(Burst|Go|ok|ack|refuse|refuseNo|refuseOk|KILL)$/
    : directed === "wipe" ? /^(Go|Note$|ok|lost|ack|KILL|WIPE|Ensure|Forget|FLUSH)$/
    : /^(Go|Note$|holdPlain|FLUSH|ack|KILL)$/;
  let lanesAhead = 0;
  let lanesAheadWitness: string | undefined;
  const unpinnedAt = new Map<string, string>();
  const logs = new WeakMap<object, string[]>();
  const wiped = new WeakSet<object>();
  const keyOf = (w: Who) => `${w.actor}/${w.id}`;
  const cut = (v: any) => canon({ s: v.state, m: v.memory });
  // (e) The disk's pointer into each actor's published cuts. It only moves forward.
  const pointers = new WeakMap<object, Map<string, number>>();
  const bad = new WeakMap<object, string>();
  const innerLogs = new WeakMap<object, string[]>();
  const poisoned = (m: unknown) => /\d+n"/.test(canon(m));
  const checkDisk = (h: Harness) => {
    const frames = h.read.frames() as any[];
    const stored = h.read.stored();
    const ptr = pointers.get(h)!;
    for (const w of c.actors) {
      const k = keyOf(w);
      const rec = stored.get(`actor/${k}`) as any;
      if (!rec || rec.retired) continue;
      if (c.to) {
        // A fragment's memory: frames show the root's view, so its own published list is kept by the wrapper below.
        const list = innerLogs.get(h)!;
        const kid = rec.root.kids?.[c.to[0]!]?.memory;
        if (kid === undefined) continue;
        const from = ptr.get(k) ?? 0;
        const i = list.indexOf(canon(kid), from);
        if (i >= 0) ptr.set(k, i);
        else if (list.includes(canon(kid))) bad.set(h, `(e) a fragment's disk went back: ${canon(kid)}`);
        else if (list.length) bad.set(h, `(b) a fragment on disk, never published: ${canon(kid)}`);
        continue;
      }
      const diskCut = canon({ s: rec.root.leaf, m: rec.root.memory });
      const from = ptr.get(k) ?? 0;
      let i = frames.findIndex((f, n) => n >= from && f.view[k] && cut(f.view[k]) === diskCut);
      if (i < 0) {
        const anywhere = frames.findIndex((f) => f.view[k] && cut(f.view[k]) === diskCut);
        if (anywhere >= 0) bad.set(h, `(e) the disk went back: ${diskCut.slice(0, 120)}`);
        else if (!frames.some((f) => f.view[k] && poisoned(f.view[k].memory)))
          bad.set(h, `(b) on disk, a cut never published: ${diskCut.slice(0, 160)}`);
        continue;
      }
      ptr.set(k, i);
      // Memory ahead of a lane: every frame of this cut has a lane this disk lacks.
      const lanes = new Set([...stored.keys()].filter((x) => x.startsWith(`lane/${k}|`) && (stored.get(x) as any)?.head));
      const same = frames.filter((f) => f.view[k] && cut(f.view[k]) === diskCut);
      if (lanes.size === 0 && same.length > 0 && same.every((f) => Object.keys(f.view[k].rows).length > 0))
        bad.set(h, `(e) memory ahead of its lane: ${diskCut.slice(0, 120)}`);
    }
  };
  const rep = bfs({
    make: () => {
      const inner = make();
      const log: string[] = [];
      const fx: Fixture = { ...c.fixture, make: (api) => logGuards(c.fixture.make(api), log) };
      inner.start({ machines: [fx], seed: 1, bounds: { captureMs: 2_000_000_000 } });
      logs.set(inner, log);
      pointers.set(inner, new Map());
      if (wide) inner.do({ storeWide: true });
      for (const w of c.actors) inner.do({ ensure: w, input: { who: w.id } });
      if (target === "pay") inner.do({ send: c.actors[0]!, event: "Start", payload: { cartId: "c1", intentId: "pi1" } });
      inner.do({ hide: true });
      const raw = inner.do.bind(inner);
      const innerSeen = new Set<string>();
      const list: string[] = [];
      innerLogs.set(inner, list);
      const record = (st?: Step) => {
        if (!c.to) return;
        const m = inner.read.inner(c.actors[0]!, c.to)?.memory;
        const t = m === undefined ? undefined : canon(m);
        if (t && st && "reload" in st && !innerSeen.has(t)) bad.set(inner, `(b) a fragment restored memory it never had: ${t}`);
        if (t) {
          innerSeen.add(t);
          if (list.at(-1) !== t) list.push(t);
        }
      };
      record();
      inner.do = (st: Step) => {
        raw(st);
        if ("reload" in st && st.wipe) {
          pointers.set(inner, new Map()); // the disk starts over, by design
          wiped.add(inner);
        }
        record(st);
        if (!bad.has(inner)) checkDisk(inner);
      };
      return inner;
    },
    actions: directed
      ? [...actions, ...edge].filter((a) => directedNames.test(a.name))
      : tight
        ? [...actions, ...edge].filter((a) => tightNames.test(a.name))
        : [...actions, ...edge],
    ...o,
    edge(pre, post, last) {
      if (directed === "wipe") {
        // The stated limit (REV8-WIPE): with the Attempt's key a wiped hold gives a second key. So (a) reads only what the disk still knew.
        void last;
        if (post.read.evidence("boot").length > 0 && wiped.has(post)) return;
      }
      const seen = new Set(pre.read.requests().filter((x) => x.op === c.op).map((x) => x.idempotencyKey));
      const mayHave = new Set(pre.read.outside().mayHave);
      const released = new Set(post.read.evidence("Released").map((e) => e["attempt"]));
      const all = post.read.requests().filter((x) => x.op === c.op);
      for (const q of all) {
        if (seen.has(q.idempotencyKey)) continue;
        for (const old of all)
          if (
            old.idempotencyKey !== q.idempotencyKey &&
            seen.has(old.idempotencyKey) &&
            canon(old.input?.who) === canon(q.input?.who) &&
            canon(old.input?.intentId) === canon(q.input?.intentId) &&
            mayHave.has(old.idempotencyKey!) &&
            !released.has(old.idempotencyKey)
          )
            throw new Oracle(`(a) a second Attempt ${q.idempotencyKey} beside undecided ${old.idempotencyKey}`);
      }
    },
    state(h, script) {
      checkClaims(h.read);
      checkEndings(h.read);
      const b = bad.get(h);
      if (b) throw new Oracle(b);
      const frames = h.read.frames() as any[];
      if (script.at(-1) === "KILL") {
        // Each boot once, here: a state's script ends in its kill.
        const boot = frames.filter((f) => f.cause === "boot").at(-1);
        for (const w of c.actors) {
          const v = boot?.view[keyOf(w)];
          if (!v) continue;
          const rowsAt = new Set(frames.filter((f) => f !== boot && f.view[keyOf(w)] && cut(f.view[keyOf(w)]) === cut(v)).map((f) => canon(Object.keys(f.view[keyOf(w)].rows).sort())));
          if (rowsAt.size && !rowsAt.has(canon(Object.keys(v.rows).sort()))) {
            lanesAhead++;
            lanesAheadWitness ??= `${script.join(" ")} => ${v.state} ${canon(Object.keys(v.rows))}`;
          }
        }
      }
      const seenMem = new Set(frames.flatMap((f) => c.actors.map((w) => f.view[keyOf(w)]?.memory)).filter(Boolean).map(canon));
      for (const m of logs.get(h) ?? []) {
        const parsed = JSON.parse(m);
        if (c.pair && !c.pair(parsed)) throw new Oracle(`(d) a guard saw two turns: ${m}`);
        if (target !== "frag" && !seenMem.has(m) && !c.actors.some((w) => canon(h.read.memory(w)) === m))
          throw new Oracle(`(d) a guard saw memory no cut has: ${m.slice(0, 160)}`);
      }
    },
    drain(h, script, report) {
      h.do({ freeze: false });
      h.do({ holdPlain: false });
      // Review's false alarm: 24 was too short past depth 12, so a `Forget` met a wire. What is outstanding says how long.
      const rounds = 24 + 3 * script.length + 3 * h.read.quiet().waits.length;
      for (let i = 0; i < rounds; i++) {
        const out = h.read.outside();
        const has = (op: string) => out.open.some((x) => x.op === op && !x.never);
        if (out.storage.some((s) => !s.hung && s.purpose !== "late") && !out.failing) h.do({ storage: "ack" });
        else if (out.failing) h.do({ storage: "failLate" });
        else if (has(c.op)) h.do({ answer: c.op, with: target === "pay" ? { ok: CAP } : { ok: {} } });
        else if (has("place")) h.do({ answer: "place", with: { ok: { orderId: "o1" } } });
        else if (has("void")) h.do({ answer: "void", with: { ok: {} } });
        else if (has("intent")) h.do({ answer: "intent", with: { truth: true } });
        else if (has("order")) h.do({ answer: "order", with: { truth: true } });
        else h.do({ advance: 3000 });
      }
      const text = script.join(" ");
      const hung = h.read.outside().storage.some((s) => s.hung);
      // (f)
      if (!hung)
        for (const w of c.actors) {
          const leaf = h.read.state(w);
          if (!leaf || !c.waiting.includes(leaf)) continue;
          const lane = h.read.quiet().waits.some((x) => x.kind !== "timer");
          if (!lane) {
            const cls = `waits-for-nothing:${leaf}`;
            report(cls);
            // M7, Pay's: NotSent on `place` leaves "Try again" with PLACING reached on the live path. Known to the review.
            if (target !== "pay" && !unpinnedAt.has(cls)) unpinnedAt.set(cls, text);
            // P4: a second press moves to PAYING with the commit Rejected, and PAYING has no reconcile.
            else if (target === "pay" && !unpinnedAt.has(cls) && !/KILL|refuse/.test(text) && !/\bPay\b.*\bPay\b/.test(text)) unpinnedAt.set(cls, text);
          }
        }
      if (target === "pay") {
        for (const cls of moneyAudit(h)) {
          report(cls);
          const [k, st] = cls.split(":");
          const t2 = text.replace(/\bPay\b/g, "PayRequested").replace(/\bKILL\b/g, "reload");
          const pin = PAY_PINS.find((p) => p.cls === k && (p.state === undefined || p.state === st) && p.via.test(t2));
          const p7 = k === "charged-unaccounted" && /\brefuse\b/.test(text) && /Leave/.test(text);
          if (!pin && !p7 && !unpinnedAt.has(cls)) unpinnedAt.set(cls, text);
        }
        return;
      }
      if (hung) return;
      for (const w of c.actors) for (const e of c.owners) h.do(send(w, e));
      for (let i = 0; i < 6; i++) h.do({ advance: 3000 });
      const held = h.read.quiet().waits.filter((w) => w.kind === "held");
      if (held.length) report(`(c) held for good`);
      if (held.length && !unpinnedAt.has("(c)")) unpinnedAt.set("(c)", text);
    },
  });
  const unpinned = [...unpinnedAt].map(([k, w]) => `${k} via ${w}`);
  return {
    ...rep,
    unpinned,
    lanesAhead,
    ...(lanesAheadWitness ? { lanesAheadWitness } : {}),
    verdict: rep.verdict !== "failed" && unpinned.length ? "failed" : rep.verdict,
    ...(rep.verdict !== "failed" && unpinned.length ? { failure: unpinned[0]! } : {}),
  };
};
