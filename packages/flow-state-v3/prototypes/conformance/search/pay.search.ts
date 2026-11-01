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

// Independent of Flow's vocabulary: only money and what the shopper can read.
export const moneyAudit = (h: Harness): string[] => {
  const r = h.read;
  const t = r.truth();
  const m = r.memory(A);
  const leaf = r.state(A);
  if (!m) return [];
  const out: string[] = [];
  const told = (s: string) => String(m.notice ?? "").includes(s);
  for (const intent of t.ledger.placed) {
    if (t.ledger.voided.includes(intent)) out.push(`placed-and-voided:${leaf}`);
    if (!m.receipt) out.push(`order-no-receipt:${leaf}`);
  }
  for (const intent of t.ledger.charged) {
    if (t.ledger.placed.includes(intent) || t.ledger.voided.includes(intent)) continue;
    const mine = m.intentId === intent;
    const row = r.row(A, "pay", { intentId: intent });
    const accounted =
      (mine && (leaf === "UNSURE" || leaf === "PLACING" || leaf === "STUCK")) ||
      (mine && m.authorized === true) ||
      told("pending charge") ||
      told("captured") ||
      told("couldn't confirm the hold") ||
      (row?.uncertain === true && mine && leaf === "LEFT");
    if (!accounted) out.push(`charged-unaccounted:${leaf}`);
  }
  if (told("haven't been charged") && t.ledger.charged.includes(m.intentId))
    out.push(`told-not-charged:${leaf}`);
  if (t.charges > t.ledger.charged.length) out.push(`two-keys-charged-one-intent:${leaf}`);
  const cur = r.row(A, "pay", { intentId: m.intentId });
  if (cur?.uncertain && leaf !== "UNSURE" && leaf !== "LEFT" && leaf !== "STUCK")
    out.push(`held-no-owner:${leaf}`);
  return out;
};

// Which pin explains which class. Prefix only: a coarse map, so a new bug in a pinned class hides (stated in RESULTS).
export const PAY_PINS: Readonly<Record<string, string>> = {
  "placed-and-voided": "P1",
  "order-no-receipt": "P1,P2",
  "charged-unaccounted": "P3",
  "held-no-owner": "P4,P5",
  "told-not-charged": "P6",
  "two-keys-charged-one-intent": "P6",
};

export const searchPay = (
  make: () => Harness,
  fixtures: readonly Fixture[],
  opts: {
    depth: number;
    maxStates: number;
    deadlineMs: number;
    pins?: Readonly<Record<string, string>>;
  },
): Report & { unpinned: readonly string[] } => {
  const pins = opts.pins ?? PAY_PINS;
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
      // S6: no new id for an intent while an earlier id for it is unresolved. Resolved means a definite ending or a release.
      const before = new Set(
        pre.read
          .requests()
          .filter((x) => x.op === "pay")
          .map((x) => x.idempotencyKey),
      );
      const pays = post.read.requests().filter((x) => x.op === "pay");
      const lastChannel = new Map<unknown, unknown>();
      for (const e of post.read.evidence("ending"))
        if (e["op"] === "pay" && e["attempt"] !== undefined)
          lastChannel.set(e["attempt"], e["channel"]);
      const released = new Set(post.read.evidence("Released").map((e) => e["attempt"]));
      for (const q of pays) {
        if (before.has(q.idempotencyKey)) continue;
        for (const old of pays) {
          if (old.idempotencyKey === q.idempotencyKey || old.input.intentId !== q.input.intentId)
            continue;
          if (!before.has(old.idempotencyKey)) continue;
          const c = lastChannel.get(old.idempotencyKey);
          if (c === "success" || c === "failure" || released.has(old.idempotencyKey)) continue;
          throw new Oracle(`S6: a new id beside unresolved ${old.idempotencyKey}`);
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
    drain(h, _s, report) {
      drain(h);
      checkClaims(h.read);
      checkEndings(h.read);
      for (const c of moneyAudit(h)) report(c);
    },
  });
  const unpinned = Object.keys(rep.classes).filter((c) => !pins[c.split(":")[0]!]);
  return {
    ...rep,
    unpinned,
    verdict: rep.verdict !== "failed" && unpinned.length ? "failed" : rep.verdict,
  };
};
