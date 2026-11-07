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
const withV = (make: () => Harness) => () => {
  const h = make();
  let commits = 0;
  const inner = h.do.bind(h);
  h.do = (s: Step) => {
    if ("send" in s && s.event === "Commit") {
      commits++;
      inner({ ...s, payload: { ...(s.payload as object), v: commits } });
    } else inner(s);
  };
  return h;
};

const commitsIn = (s: readonly Action[]) => s.filter((a) => a.name.startsWith("commit.")).length;

const drain = (h: Harness) => {
  for (let i = 0; i < 24; i++) {
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
      const released = new Set(post.read.evidence("Released").map((e) => e["attempt"]));
      const onWire = post.read
        .requests()
        .filter((r) => r.op === "w" && !r.answered && !released.has(r.idempotencyKey));
      for (const rec of [1, 2]) {
        const n = new Set(
          onWire.filter((r) => (r.input.mask & rec) !== 0).map((r) => r.idempotencyKey),
        );
        if (n.size > 1) throw new Oracle(`S5: ${n.size} Attempts on the wire for one record`);
      }
      // S13, D3: first sends per record in mint order.
      const mint = new Map(post.read.evidence("mint").map((e) => [e["attempt"], e["mint"]]));
      for (const rec of [1, 2]) {
        const firsts = new Set<string>();
        let last = -1;
        for (const r of post.read.requests()) {
          if (r.op !== "w" || (r.input.mask & rec) === 0 || firsts.has(r.idempotencyKey!)) continue;
          firsts.add(r.idempotencyKey!);
          const m = mint.get(r.idempotencyKey!) ?? 0;
          if (m < last) throw new Oracle(`S13: a send out of mint order on record ${rec}`);
          last = m;
        }
      }
      void pre;
    },
    state(h) {
      checkClaims(h.read);
      checkEndings(h.read);
      // Last intent: with nothing released, the server never goes backwards. A release is the stated limit (OD20 F1).
      if (h.read.truth().server.inverted && h.read.evidence("Released").length === 0)
        throw new Oracle("the server went backwards with nothing released");
    },
    drain(h) {
      drain(h);
      checkClaims(h.read);
      if (h.read.truth().server.inverted && h.read.evidence("Released").length === 0)
        throw new Oracle("the server went backwards after drain");
      const stuck = h.read.quiet().waits.filter((w) => w.kind !== "timer" && w.kind !== "held");
      if (stuck.length) throw new Oracle(`drain left work: ${JSON.stringify(stuck[0])}`);
    },
  });
};
// The budget counts mints, which includes a replaced commit: S1's `maxCommits` counts the same way.
const commitBudget = (h: Harness) =>
  h.read.evidence("mint").filter((e) => e["op"] === "w").length < COMMITS;
