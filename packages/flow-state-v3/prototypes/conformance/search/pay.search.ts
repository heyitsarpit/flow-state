// SEARCH-PAY: stateless. Every script replays from `start`; only `Reads` are used, so it survives a rewrite.
import type { Harness, Step } from "../harness.ts";
import { A, CART, fixtures } from "../scenarios/pay.scenario.ts";

const K = { intentId: "pi1" };
const CAP = { ok: { status: "requires_capture", clientSecret: "" } };
type Action = { name: string; step: Step; on?: (h: Harness) => boolean };
const open = (op: string) => (h: Harness) => h.read.quiet().waits.includes(`open:${op}`);
const send = (event: string, payload: unknown = {}): Step => ({ send: A, event, payload });

const ALPHABET: readonly Action[] = [
  { name: "PayRequested", step: send("PayRequested", { paymentMethodId: "visa" }) },
  { name: "Leave", step: send("Leave") },
  { name: "Start", step: send("Start", CART) },
  { name: "advance3000", step: { advance: 3000 } },
  {
    name: "ack",
    step: { storage: "ack" },
    on: (h) => h.read.quiet().waits.some((w) => w.startsWith("storage:")),
  },
  { name: "pay.ok", step: { answer: "pay", with: CAP }, on: open("pay") },
  { name: "pay.lost", step: { answer: "pay", with: { lost: true } }, on: open("pay") },
  {
    name: "pay.lostLanded",
    step: { answer: "pay", with: { lostButLanded: CAP.ok } },
    on: open("pay"),
  },
  {
    name: "pay.declined",
    step: { answer: "pay", with: { fail: { tag: "CardDeclined", code: "x" } } },
    on: open("pay"),
  },
  {
    name: "intent.cap",
    step: { answer: "intent", with: { ok: { status: "requires_capture" } } },
    on: open("intent"),
  },
  {
    name: "intent.rpm",
    step: { answer: "intent", with: { ok: { status: "requires_payment_method" } } },
    on: open("intent"),
  },
  {
    name: "place.ok",
    step: { answer: "place", with: { ok: { orderId: "o1" } } },
    on: open("place"),
  },
  { name: "reload", step: { reload: true } },
];

export type SearchReport = {
  verdict: "completed" | "inconclusive" | "failed";
  depthCompleted: number;
  scripts: number;
  steps: number;
  failure?: string;
  fingerprint: { depthCompleted: number; scripts: number; states: number };
  heldWithNoOwnerInLeaf: { count: number; sample?: string; leaves: Record<string, number> };
  ms: number;
  peakRssMb: number;
};

class Oracle extends Error {}

type Prev = { keys: ReadonlySet<unknown>; holding: boolean; current: unknown };
const NONE: Prev = { keys: new Set(), holding: false, current: undefined };
const oracleAfter = (h: Harness, prev: Prev): Prev => {
  const r = h.read;
  const pays = r.requests().filter((x) => x.op === "pay");
  const keys = new Set(pays.map((x) => x.idempotencyKey));
  // S5, S6: never a new charge beside a doubtful one. The holding Attempt's own first send is not new (expected-changes.log).
  if (prev.holding)
    for (const k of keys)
      if (!prev.keys.has(k) && k !== prev.current)
        throw new Oracle("new id while the lane was pending or uncertain");
  // S7: no ack, no request
  const acked = r.truth().acked;
  for (const x of r.requests())
    if (x.idempotencyKey !== undefined && !acked.some((v) => v.includes(x.idempotencyKey!)))
      throw new Oracle(`request ${x.op} before ack`);
  // "never not charged": an Attempt reported not sent never reached the server
  const ends = r.evidence("ending");
  const last = ends.filter((e) => e.op === "pay").at(-1);
  if (
    last?.channel === "failure" &&
    last.reason === "Restored" &&
    pays.some((p) => p.idempotencyKey === last.attempt)
  )
    throw new Oracle("NotSent { Restored } for an Attempt that was sent");
  if (
    (r.memory(A)?.notice ?? "").includes("haven't been charged") &&
    last?.reason === "Restored" &&
    r.truth().chargedKeys.includes(last.attempt)
  )
    throw new Oracle("told not charged, was charged");
  // One ending per send; at most one per Attempt per send
  const seen = new Set<string>();
  for (const e of ends) {
    if (e.send === undefined) continue;
    const k = `${e.attempt}#${e.send}`;
    if (seen.has(k)) throw new Oracle(`two endings for ${k}`);
    seen.add(k);
  }
  // L3, after every step
  const stuck = r.quiet().waits.filter((w) => w.startsWith("stuck:"));
  if (stuck.length) throw new Oracle(`L3 ${stuck.join(",")}`);
  const row = r.row(A, "pay", K);
  return {
    keys,
    holding: !!row && (row.pending || row.uncertain),
    current: r
      .evidence("mint")
      .filter((e) => e["op"] === "pay")
      .at(-1)?.["attempt"],
  };
};

export const searchPay = (
  makeHarness: () => Harness,
  opts: { cap: number; depth: number; replayEvery?: number; deadlineMs: number },
): SearchReport => {
  const t0 = Date.now();
  let peak = 0;
  let scripts = 0;
  let steps = 0;
  let total = 0;
  const held = {
    count: 0,
    leaves: {} as Record<string, number>,
    sample: undefined as string | undefined,
  };

  const boot = () => {
    const h = makeHarness();
    h.start({ machines: fixtures, seed: 1 });
    h.do({ ensure: A });
    h.do(send("Start", CART));
    return h;
  };
  // Runs `script`, checks every prefix, returns the harness at its end.
  const run = (script: readonly Action[]) => {
    const h = boot();
    let prev = oracleAfter(h, NONE);
    for (const a of script) {
      h.do(a.step);
      steps++;
      prev = oracleAfter(h, prev);
    }
    return h;
  };
  const label = (s: readonly Action[]) => s.map((a) => a.name).join(" ");
  // At depth end: answer everything. A Held lane or a terminal state, never a pending lane with nothing outstanding.
  const drain = (h: Harness, script: readonly Action[]) => {
    let prev = oracleAfter(h, NONE);
    for (let i = 0; i < 12; i++) {
      const w = h.read.quiet().waits;
      if (w.some((x) => x.startsWith("storage:"))) h.do({ storage: "ack" });
      else if (w.includes("open:pay")) h.do({ answer: "pay", with: CAP });
      else if (w.includes("open:place")) h.do({ answer: "place", with: { ok: { orderId: "o1" } } });
      else if (w.includes("open:void")) h.do({ answer: "void", with: { ok: {} } });
      else if (w.includes("open:intent"))
        h.do({ answer: "intent", with: { ok: { status: "processing" } } });
      else if (w.includes("open:order")) h.do({ answer: "order", with: { ok: null } });
      else h.do({ advance: 3000 });
      prev = oracleAfter(h, prev);
    }
    const row = h.read.row(A, "pay", K);
    const state = h.read.state(A)!;
    const open = h.read
      .quiet()
      .waits.filter((x) => x.startsWith("open:") || x.startsWith("storage:"));
    if (
      row?.pending &&
      open.length === 0 &&
      !h.read.quiet().waits.some((x) => x.startsWith("wire:"))
    )
      throw new Oracle(`pending with nothing outstanding after drain: ${label(script)}`);
    // Probe, not an oracle: an unknown nobody is reconciling. The machine's bug or the rule's, reported either way.
    if (row?.uncertain && state !== "UNSURE") {
      held.count++;
      held.leaves[state] = (held.leaves[state] ?? 0) + 1;
      held.sample ??= `${label(script)} -> ${state}`;
    }
  };
  const replay = (h: Harness, script: readonly Action[]) => {
    const r = h.read.replay();
    if (!r.same)
      throw new Oracle(`S11 replay differs: ${JSON.stringify(r.firstDiff)} on ${label(script)}`);
  };

  const out = (
    verdict: SearchReport["verdict"],
    depthCompleted: number,
    failure?: string,
    fp = { depthCompleted: 0, scripts: 0, states: 0 },
  ): SearchReport => ({
    verdict,
    depthCompleted,
    scripts,
    steps,
    ...(failure ? { failure } : {}),
    fingerprint: fp,
    heldWithNoOwnerInLeaf: held,
    ms: Date.now() - t0,
    peakRssMb: Math.round(peak / 1e6),
  });
  const exceeded = () => total >= opts.cap || Date.now() - t0 > opts.deadlineMs;
  const tick = () => {
    if (++total % 2000 === 0) peak = Math.max(peak, process.memoryUsage().rss);
  };

  // Phase 1: exact, iterative deepening, depth-limited DFS. A script is one replay from start.
  let depthCompleted = 0;
  try {
    for (let d = 1; d <= opts.depth; d++) {
      scripts = 0;
      let truncated = false;
      const dfs = (script: Action[]): void => {
        if (exceeded()) {
          truncated = true;
          return;
        }
        const h = run(script);
        scripts++;
        tick();
        if (script.length === d) {
          replay(h, script);
          drain(h, script);
          return;
        }
        for (const a of ALPHABET) {
          if (a.on && !a.on(h)) continue;
          dfs([...script, a]);
          if (truncated) return;
        }
      };
      dfs([]);
      if (truncated) break;
      depthCompleted = d;
    }
  } catch (e) {
    if (e instanceof Oracle) return out("failed", depthCompleted, e.message);
    throw e;
  }

  // Phase 2: dedupe on a fingerprint of Reads. Reaches further and proves less: hidden state is merged away.
  const fp = { depthCompleted: 0, scripts: 0, states: 0 };
  const fingerprintOf = (h: Harness) =>
    JSON.stringify([
      h.read.state(A),
      h.read.memory(A),
      h.read.row(A, "pay", K),
      [...h.read.stored().keys()],
      h.read.quiet().waits,
      h.read
        .requests()
        .filter((x) => !x.answered)
        .map((x) => x.op),
      h.read.truth().charges,
    ]);
  if (depthCompleted < opts.depth) {
    const fpDeadline = Date.now() + opts.deadlineMs;
    try {
      for (let d = depthCompleted + 1; d <= opts.depth; d++) {
        const seen = new Map<string, number>();
        let truncated = false;
        const dfs = (script: Action[]): void => {
          if (fp.scripts >= opts.cap * 2 || Date.now() > fpDeadline) {
            truncated = true;
            return;
          }
          const h = run(script);
          fp.scripts++;
          tick();
          const f = fingerprintOf(h);
          const left = d - script.length;
          if ((seen.get(f) ?? -1) >= left) return;
          seen.set(f, left);
          if (left === 0) {
            drain(h, script);
            return;
          }
          for (const a of ALPHABET) {
            if (a.on && !a.on(h)) continue;
            dfs([...script, a]);
            if (truncated) return;
          }
        };
        dfs([]);
        fp.states = Math.max(fp.states, seen.size);
        if (truncated) break;
        fp.depthCompleted = d;
      }
    } catch (e) {
      if (e instanceof Oracle) return out("failed", depthCompleted, e.message, fp);
      throw e;
    }
  }
  return out(
    depthCompleted >= opts.depth ? "completed" : "inconclusive",
    depthCompleted,
    undefined,
    fp,
  );
};
