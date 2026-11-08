// SEARCH-LIKE: S1's sweep through the real runtime. 2 actors, 2 records, 3 commits, masks {1,2,3}, late landing on. `v` is
// the commit's order, so "the server never goes backwards" needs no Flow vocabulary. Compare with S1's counts once only:
// S1's model is finer-grained and its states are not reachable by replay.
import type { Answer, Fixture, Harness, Step } from "../harness.ts";
import { checkClaims, checkEndings } from "../scenarios/ctx.ts";
import { bfs, Oracle, type Action, type Report } from "./engine.ts";

const actors = ["a0", "a1"].map((id) => ({ actor: "S1", id }));
const COMMITS = 3;
const openW = (id: string) => (h: Harness) =>
  h.read.requests().some((r) => r.op === "w" && !r.answered && r.input.actor === id) &&
  h.read.outside().open.some((o) => o.op === "w");
const hasRepair = (h: Harness) => h.read.outside().open.some((o) => o.op === "repair" && !o.never);

const ALPHABET: readonly Action[] = [
  ...actors.flatMap((a) => [
    ...[1, 2, 3].map((mask): Action => ({
      name: `commit.${a.id}.m${mask}`,
      step: { send: a, event: "Commit", payload: { actor: a.id, mask, v: -1 } } as Step,
    })),
    { name: `retry.${a.id}`, step: { send: a, event: "Retry", payload: {} } },
    { name: `cancel.${a.id}`, step: { send: a, event: "Cancel", payload: {} } },
    ...(
      [
        ["ok", { apply: true }],
        ["fail", { fail: { tag: "Refused" } }],
        ["lost", { lost: true }],
        ["landed", { applyLost: true }],
      ] as ReadonlyArray<readonly [string, Answer]>
    ).map(([n, an]): Action => ({
      name: `w.${a.id}.${n}`,
      step: { answer: "w", with: an, where: { actor: a.id } },
      on: openW(a.id),
    })),
  ]),
  { name: "repair", step: { answer: "repair", with: { truth: true } }, on: hasRepair },
  { name: "landLate", step: { fault: { landLate: "w" } }, on: (h) => h.read.outside().lost > 0 },
];
// `v` must grow with the script, which a fixed alphabet cannot say: the action is rewritten at replay by counting.
// Audit 2: the suite's own record of what it gave up. A `Cancel` it sent may release its actor's open requests (OD20 F1's stated limit): those
// keys, and the records that actor's commits touched, are the only ones the oracles below excuse, never the runtime's `Released`.
type GivenUp = { readonly keys: Set<string>; readonly recs: Set<number> };
const givenUp = new WeakMap<Harness, GivenUp>();
const gaveUp = (h: Harness): GivenUp => givenUp.get(h) ?? { keys: new Set(), recs: new Set() };
const withV = (make: () => Harness) => () => {
  const h = make();
  let commits = 0;
  const g: GivenUp = { keys: new Set(), recs: new Set() };
  givenUp.set(h, g);
  const inner = h.do.bind(h);
  h.do = (s: Step) => {
    if ("send" in s && s.event === "Commit") {
      commits++;
      inner({ ...s, payload: { ...(s.payload as object), v: commits } });
    } else if ("send" in s && s.event === "Cancel") {
      const id = (s.send as { id: string }).id;
      for (const r of h.read.requests())
        if (r.op === "w" && r.input.actor === id) {
          g.keys.add(r.idempotencyKey!);
          for (const rec of [1, 2]) if ((r.input.mask & rec) !== 0) g.recs.add(rec);
        }
      inner(s);
    } else inner(s);
  };
  return h;
};

const commitsIn = (s: readonly Action[]) => s.filter((a) => a.name.startsWith("commit.")).length;

// S13, D3 as directed: within one actor, first sends to a record go in the order the suite committed them. Phase 1 E round 3: rebuilt on the
// suite's own number `v` (`withV`), not the runtime's `mint` evidence, and it holds on released paths too, where the server model's
// `selfInverted` is exempt (falsify's `s13.older-sent-after-newer` turns it red). "Applied in send order" is gone: it compared the fake's
// arrival log with its request log, one fact recorded twice. After drain, a settled screen is the server (`drain.old-base-wins`).
const sendOrder = (h: Harness) => {
  for (const rec of [1, 2])
    for (const a of actors) {
      const firsts = new Set<string>();
      let last = -1;
      for (const r of h.read.requests()) {
        if (r.op !== "w" || r.input.actor !== a.id || (r.input.mask & rec) === 0 || firsts.has(r.idempotencyKey!)) continue;
        firsts.add(r.idempotencyKey!);
        if ((r.input.v as number) < last) throw new Oracle(`S13: ${a.id}'s first sends out of commit order on record ${rec}`);
        last = r.input.v as number;
      }
    }
};
// Audit 2: after the drain every repair and write is answered and every hold retried, so nothing is predicted or uncertain; a field is left
// `unconfirmed` only on a record the suite itself gave a write up on (U10's quiet mark), and only there may the value differ from the server.
const settled = (h: Harness) => {
  const server = h.read.truth().server;
  for (const [i, r] of (["r1", "r2"] as const).entries()) {
    const row = h.read.record(`R|${r}`) as { data?: { v?: number }; uncertain: boolean; predicted: boolean; unconfirmed: readonly string[] } | undefined;
    if (row === undefined) continue;
    if (row.uncertain || row.predicted) throw new Oracle(`drain: ${r} still ${row.uncertain ? "uncertain" : "predicted"} after the drain`);
    if (row.unconfirmed.length > 0 && !gaveUp(h).recs.has(i + 1)) throw new Oracle(`drain: ${r} unconfirmed, and the suite gave no write on it up`);
    if (row.data?.v !== undefined && row.unconfirmed.length === 0 && row.data.v !== server.records[r])
      throw new Oracle(`drain: ${r} shows ${row.data.v}, settled, and the server holds ${server.records[r]}`);
  }
};

const DRAIN_STEPS = 24;
const drain = (h: Harness) => {
  for (let i = 0; i < DRAIN_STEPS; i++) {
    const o = h.read.outside();
    if (o.open.some((x) => x.op === "repair" && !x.never))
      h.do({ answer: "repair", with: { truth: true } });
    else if (o.open.some((x) => x.op === "w")) h.do({ answer: "w", with: { apply: true } });
    else {
      const held = h.read.quiet().waits.filter((w) => w.kind === "held");
      if (held.length === 0) return;
      for (const w of held)
        if (w.kind === "held")
          h.do({ send: { actor: "S1", id: w.actor.split("/")[1]! }, event: "Retry", payload: {} });
    }
  }
  throw new Oracle(`drain: work left after ${DRAIN_STEPS} steps`);
};

export const searchLike = (
  make: () => Harness,
  fixtures: readonly Fixture[],
  opts: { depth: number; maxStates: number },
): Report => {
  const boot = withV(() => {
    const h = make();
    h.start({ machines: fixtures, seed: 1 });
    for (const a of actors) h.do({ ensure: a });
    return h;
  });
  return bfs({
    make: boot,
    actions: ALPHABET.map((a) => (a.name.startsWith("commit.") ? { ...a, on: commitBudget } : a)),
    depth: opts.depth,
    maxStates: opts.maxStates,
    extra: (s) => `${commitsIn(s)}`,
    edge(pre, post) {
      // S5: at most one Attempt on the wire per record. An interrupted send may still be open at the server; its re-send
      // has the same id, which is the point of the id.
      // A released Attempt's request may also still be out there: the stated limit (OD20 F1).
      const released = gaveUp(post).keys;
      const onWire = post.read
        .requests()
        .filter((r) => r.op === "w" && !r.answered && !released.has(r.idempotencyKey!));
      for (const rec of [1, 2]) {
        const n = new Set(
          onWire.filter((r) => (r.input.mask & rec) !== 0).map((r) => r.idempotencyKey),
        );
        if (n.size > 1) throw new Oracle(`S5: ${n.size} Attempts on the wire for one record`);
      }
      sendOrder(post);
      void pre;
    },
    state(h) {
      checkClaims(h.read);
      checkEndings(h.read);
      // Last intent, per actor (D3 as directed keeps send order across actors, not commit order): with nothing released, no actor's own
      // commits land backwards. A release is the stated limit (OD20 F1).
      if (h.read.truth().server.selfInverted && gaveUp(h).keys.size === 0)
        throw new Oracle("the server went backwards with nothing released");
    },
    drain(h) {
      drain(h);
      checkClaims(h.read);
      sendOrder(h);
      if (h.read.truth().server.selfInverted && gaveUp(h).keys.size === 0)
        throw new Oracle("the server went backwards after drain");
      settled(h);
      const stuck = h.read.quiet().waits.filter((w) => w.kind !== "timer" && w.kind !== "held");
      if (stuck.length) throw new Oracle(`drain left work: ${JSON.stringify(stuck[0])}`);
    },
  });
};
// The budget counts mints, which includes a replaced commit: S1's `maxCommits` counts the same way.
const commitBudget = (h: Harness) =>
  h.read.evidence("mint").filter((e) => e["op"] === "w").length < COMMITS;
