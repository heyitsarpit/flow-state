// SEARCH-PAY: BFS on stateHash with money oracles independent of the design (review M2). Pinned money classes are reported,
// an unpinned one fails. Pay's confirmed bugs (convergence-2 P1-P5) are what the pins name.
import type { Answer, Fixture, Harness, Step } from "../harness.ts";
import { checkClaims, checkEndings } from "../scenarios/ctx.ts";
import { bfs, Oracle, type Action, type Report } from "./engine.ts";

const A = { actor: "Checkout/Pay", id: "shopper-1" };
const CART = { cartId: "c1", intentId: "pi1" };
const CART2 = { cartId: "c1", intentId: "pi2" };
const CAP = { status: "requires_capture", clientSecret: "" };
const send = (event: string, payload: unknown = {}): Step => ({ send: A, event, payload });
const open = (op: string) => (h: Harness) =>
  h.read.outside().open.some((o) => o.op === op && !o.never);
const storage = (h: Harness) =>
  h.read.outside().storage.some((s) => !s.hung && s.purpose !== "flush");
const ans = (name: string, op: string, a: Answer): Action => ({
  name,
  step: { answer: op, with: a },
  on: open(op),
});

const ALPHABET: readonly Action[] = [
  { name: "PayRequested", step: send("PayRequested", { paymentMethodId: "visa" }) },
  { name: "Leave", step: send("Leave") },
  { name: "Start", step: send("Start", CART) },
  { name: "Start2", step: send("Start", CART2) },
  { name: "advance3000", step: { advance: 3000 } },
  { name: "advance60000", step: { advance: 60_000 } },
  { name: "reload", step: { reload: true } },
  { name: "ack", step: { storage: "ack" }, on: storage },
  { name: "refuse", step: { storage: "refuse" }, on: storage },
  { name: "hang", step: { storage: "hang" }, on: storage },
  { name: "landNoAck", step: { storage: "landNoAck" }, on: storage },
  ans("pay.ok", "pay", { ok: CAP }),
  ans("pay.lost", "pay", { lost: true }),
  ans("pay.lostLanded", "pay", { lostButLanded: CAP }),
  ans("pay.declined", "pay", { fail: { tag: "CardDeclined", code: "x" } }),
  ans("pay.busy", "pay", { fail: { tag: "Busy", retryAfterMs: 500 } }),
  ans("pay.never", "pay", { never: true }),
  ans("intent.truth", "intent", { truth: true }),
  ans("order.truth", "order", { truth: true }),
  ans("place.ok", "place", { ok: { orderId: "o1" } }),
  ans("place.lost", "place", { lost: true }),
  ans("void.ok", "void", { ok: {} }),
  ans("void.lost", "void", { lost: true }),
  ans("void.captured", "void", { fail: { tag: "AlreadyCaptured", chargeId: "ch" } }),
];

const DRAIN = 16;
// After the search stops pushing: answer everything causally, and let time pass. What is left is what a shopper has.
const drain = (h: Harness) => {
  for (let i = 0; i < DRAIN; i++) {
    const o = h.read.outside();
    const has = (op: string) => o.open.some((x) => x.op === op && !x.never);
    if (storage(h)) h.do({ storage: "ack" });
    else if (has("pay")) h.do({ answer: "pay", with: { ok: CAP } });
    else if (has("place")) h.do({ answer: "place", with: { ok: { orderId: "o1" } } });
    else if (has("void")) h.do({ answer: "void", with: { ok: {} } });
    else if (has("intent")) h.do({ answer: "intent", with: { truth: true } });
    else if (has("order")) h.do({ answer: "order", with: { truth: true } });
    else h.do({ advance: 3000 });
  }
};

// Independent of Flow's vocabulary: only money and what the shopper can read. D53: per authorization, and "told" reads every
// frame, so what a person has seen counts.
export const moneyAudit = (h: Harness): string[] => {
  const r = h.read;
  const t = r.truth();
  const m = r.memory(A);
  const leaf = r.state(A);
  if (!m) return [];
  const out: string[] = [];
  const told = (s: string) => String(m.notice ?? "").includes(s);
  const shown = new Set<string>();
  for (const f of r.frames()) {
    const rc = (f.view["Checkout/Pay/shopper-1"]?.memory as any)?.receipt;
    if (rc?.orderId) shown.add(rc.orderId);
  }
  for (const a of t.ledger.auths) if (a.placed && a.voided) out.push(`placed-and-voided:${leaf}`);
  for (const o of t.ledger.orders) if (!shown.has(o)) out.push(`order-no-receipt:${leaf}`);
  const seen = new Set<string>();
  for (const a of t.ledger.auths) {
    if (a.placed || a.voided || seen.has(a.intent)) continue;
    seen.add(a.intent);
    const mine = m.intentId === a.intent;
    const row = r.row(A, "pay", { intentId: a.intent });
    const accounted =
      (mine && (leaf === "UNSURE" || leaf === "STUCK")) ||
      // Review H4: PLACING accounts for a charge only with `place` live. With nothing open it is stranded, and that is what this oracle is for.
      (mine && leaf === "PLACING" && (r.row(A, "place", { cartId: m.cartId }) !== undefined || r.requests().some((q) => q.op === "place" && !q.answered))) ||
      (mine && m.authorized === true && leaf !== "LEFT") || // review M11: a hold stranded in LEFT is what this oracle exists for
      r.row(A, "void", { intentId: a.intent })?.pending === true || // a void for it is live, whoever's belief says what
      (mine && row?.pending === true) || // a call for it is live: the machine is still waiting for an answer
      told("pending charge") ||
      told("captured") ||
      told("couldn't confirm the hold") ||
      (row?.uncertain === true && mine && leaf === "LEFT");
    if (!accounted) out.push(`charged-unaccounted:${leaf}`);
  }
  if (
    told("haven't been charged") &&
    t.ledger.auths.some((a) => a.intent === m.intentId && !a.voided)
  )
    out.push(`told-not-charged:${leaf}`);
  const keysPerIntent = new Map<string, number>();
  for (const a of t.ledger.auths)
    keysPerIntent.set(a.intent, (keysPerIntent.get(a.intent) ?? 0) + 1);
  if ([...keysPerIntent.values()].some((n) => n > 1)) out.push(`two-keys-one-intent:${leaf}`);
  const cur = r.row(A, "pay", { intentId: m.intentId });
  if (cur?.uncertain && leaf !== "UNSURE" && leaf !== "LEFT" && leaf !== "STUCK")
    out.push(`held-no-owner:${leaf}`);
  return out;
};

// D53: a pin is class, state and a script fragment. Each occurrence must match one, so a new bug in a pinned class fails.
export type Pin = { cls: string; state?: string; via: RegExp; pin: string };
const S = "(?:.* )?";
export const PAY_PINS: readonly Pin[] = [
  // P1: Leave during PLACING voids the hold while the order is on the wire.
  { cls: "placed-and-voided", via: new RegExp(`pay\\.(?:ok|lostLanded) ${S}Leave`), pin: "P1" },
  // P1, P2: the order lands in LEFT, or is denied LateMayNotLeave, so nobody sees a receipt.
  // P1 and P6 together: a charge landing after Leave, then Pay pressed in LEFT on that intent. Found by narrowing the pin (M9).
  {
    cls: "placed-and-voided",
    via: new RegExp(`Leave ${S}pay\\.(?:ok|lostLanded) ${S}PayRequested`),
    pin: "P1,P6",
  },
  // P1 and P3: a charge landing after Leave, then a new Start beside it (depth 9).
  {
    cls: "placed-and-voided",
    via: new RegExp(`Leave ${S}pay\\.(?:ok|lostLanded) ${S}Start`),
    pin: "P1,P3",
  },
  { cls: "order-no-receipt", via: new RegExp(`pay\\.(?:ok|lostLanded) ${S}Leave`), pin: "P1,P2" },
  // P6: Pay pressed again after the first charge, or after a Start that lost track of the first, mints beside it.
  { cls: "two-keys-one-intent", via: new RegExp(`PayRequested ${S}PayRequested`), pin: "P6" },
  { cls: "told-not-charged", via: new RegExp(`PayRequested ${S}PayRequested`), pin: "P6" },
  // P3: a late charge after Leave and a new start: one `authorized` bit, one intent in memory.
  {
    cls: "charged-unaccounted",
    via: new RegExp(`(?:Leave|pay\\.\\w+) ${S}(?:Leave|Start)`),
    pin: "P3",
  },
  // P7, new in round 7 (proposed): `void`'s NotSent maps to Voided, so a refused ack says "released" with the hold there. pay.definition.ts. Was hidden behind a pinned path by the state dedupe.
  { cls: "charged-unaccounted", via: new RegExp(`Leave ${S}refuse`), pin: "P7" },
  // P5: a void a reload took, on a charge that landed after Leave. Seen once the oracle stopped reading the machine's belief (M11).
  { cls: "charged-unaccounted", via: new RegExp(`Leave ${S}pay\\.\\w+ ${S}reload`), pin: "P5" },
  // P6's other face: Pay in PLACING overwrites what the first charge set.
  { cls: "charged-unaccounted", via: new RegExp(`PayRequested ${S}PayRequested`), pin: "P6" },
  // P4: Pay pressed in UNSURE moves to PAYING with the commit Rejected, and PAYING has no reconcile. Reached by a hold.
  {
    cls: "held-no-owner",
    state: "PAYING",
    via: new RegExp(`PayRequested ${S}PayRequested`),
    pin: "P4",
  },
  // P6 again: the second confirm times out in PLACING, and PAID has no reconcile for the hold it leaves.
  {
    cls: "held-no-owner",
    state: "PAID",
    via: new RegExp(`PayRequested ${S}PayRequested`),
    pin: "P6",
  },
  // P2 through P6: Pay in PLACING moves to PAYING, which then owns a call, so the Placed that lands is denied.
  { cls: "order-no-receipt", via: new RegExp(`PayRequested ${S}PayRequested`), pin: "P2,P6" },
  // P5: after Leave or a reload with a hold, a new Start has no path while the hold lives.
  { cls: "held-no-owner", via: new RegExp(`(?:Leave|reload) ${S}Start`), pin: "P5" },
  // P5 through P6: a second press leaves the first charge's lane held with nobody watching it, then a Start.
  {
    cls: "held-no-owner",
    via: new RegExp(`PayRequested ${S}PayRequested ${S}Start`),
    pin: "P5,P6",
  },
];
const pinned = (pins: readonly Pin[], cls: string, script: string) => {
  const [c, state] = cls.split(":");
  return pins.find(
    (p) => p.cls === c && (p.state === undefined || p.state === state) && p.via.test(script),
  );
};

export const searchPay = (
  make: () => Harness,
  fixtures: readonly Fixture[],
  opts: {
    depth: number;
    maxStates: number;
    deadlineMs: number;
    pins?: readonly Pin[];
  },
): Report & { unpinned: readonly string[] } => {
  const pins = opts.pins ?? PAY_PINS;
  const unpinnedAt = new Map<string, string>();
  const boot = () => {
    const h = make();
    h.start({ machines: fixtures, seed: 1 });
    h.do({ ensure: A });
    h.do(send("Start", CART));
    return h;
  };
  const rep = bfs({
    make: boot,
    actions: ALPHABET,
    depth: opts.depth,
    maxStates: opts.maxStates,
    deadlineMs: opts.deadlineMs,
    edge(pre, post) {
      // S6, independent of endings (H5): no new id for an intent while the fake says an earlier id may be at the server,
      // unless the machine released it. It does not read the ending it judges.
      const before = new Set(
        pre.read
          .requests()
          .filter((x) => x.op === "pay")
          .map((x) => x.idempotencyKey),
      );
      const pays = post.read.requests().filter((x) => x.op === "pay");
      const released = new Set(post.read.evidence("Released").map((e) => e["attempt"]));
      const mayHave = new Set(pre.read.outside().mayHave);
      for (const q of pays) {
        if (before.has(q.idempotencyKey)) continue;
        for (const old of pays) {
          if (old.idempotencyKey === q.idempotencyKey || old.input.intentId !== q.input.intentId)
            continue;
          if (!before.has(old.idempotencyKey) || !mayHave.has(old.idempotencyKey!)) continue;
          if (released.has(old.idempotencyKey)) continue;
          throw new Oracle(`S6: a new id beside undecided ${old.idempotencyKey}`);
        }
      }
      // S7: no ack, no request.
      const acked = post.read.truth().acked;
      for (const x of post.read.requests())
        if (x.idempotencyKey !== undefined && !acked.some((v) => v.includes(x.idempotencyKey!)))
          throw new Oracle(`S7: request ${x.op} before ack`);
      const last = post.read.evidence("ending").at(-1);
      if (
        last?.["channel"] === "failure" &&
        last["reason"] === "Restored" &&
        post.read.requests().some((p) => p.idempotencyKey === last["attempt"])
      )
        throw new Oracle("NotSent { Restored } for an Attempt that was sent");
    },
    state(h) {
      checkClaims(h.read);
      checkEndings(h.read);
    },
    drain(h, script, report) {
      drain(h);
      checkClaims(h.read);
      checkEndings(h.read);
      for (const c of moneyAudit(h)) {
        report(c);
        const text = script.join(" ");
        if (!pinned(pins, c, text) && !unpinnedAt.has(c)) unpinnedAt.set(c, text);
      }
    },
  });
  const unpinned = [...unpinnedAt].map(([c, w]) => `${c} via ${w}`);
  return {
    ...rep,
    unpinned,
    verdict: rep.verdict !== "failed" && unpinned.length ? "failed" : rep.verdict,
  };
};
