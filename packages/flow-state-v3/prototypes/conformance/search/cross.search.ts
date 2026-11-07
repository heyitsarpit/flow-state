// SEARCH-CROSS (review H5, D56): the store crossed with persistence. S1 persisted, 2 actors, 3 commits; reload, ack, refuse,
// landNoAck, advance, repair ok/fail/never, late landing. Oracles read the fake's truth, or endings only to compare them
// with what came before, never to trust one. From review H5's scratch search.
import { s1Persisted } from "../typed/lab-machines.ts";
import type { Answer, Harness, Step } from "../harness.ts";
import { checkClaims, checkEndings } from "../scenarios/ctx.ts";
import { bfs, Oracle, type Action, type Report } from "./engine.ts";

const actors = ["a0", "a1"].map((id) => ({ actor: "S1", id }));
const COMMITS = 3;
const openW = (id: string) => (h: Harness) =>
  h.read.outside().open.some((o) => o.op === "w" && !o.never && o.input.actor === id);
const openRepair = (h: Harness) => h.read.outside().open.some((o) => o.op === "repair" && !o.never);
const storage = (h: Harness) =>
  h.read.outside().storage.some((s) => !s.hung && s.purpose !== "flush");
const ALPHABET: readonly Action[] = [
  ...actors.flatMap((a) => [
    ...[1, 3].map((mask): Action => ({
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
  { name: "ack", step: { storage: "ack" }, on: storage },
  { name: "refuse", step: { storage: "refuse" }, on: storage },
  { name: "landNoAck", step: { storage: "landNoAck" }, on: storage },
  { name: "reload", step: { reload: true } },
  { name: "advance30s", step: { advance: 30_000 } },
  { name: "repair.ok", step: { answer: "repair", with: { truth: true } }, on: openRepair },
  {
    name: "repair.fail",
    step: { answer: "repair", with: { fail: { tag: "NoResponse" } } },
    on: openRepair,
  },
  { name: "repair.never", step: { answer: "repair", with: { never: true } }, on: openRepair },
  { name: "landLate", step: { fault: { landLate: "w" } }, on: (h) => h.read.outside().lost > 0 },
];
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
const budget = (h: Harness) =>
  h.read.evidence("mint").filter((e) => e["op"] === "w").length < COMMITS;

export const searchCross = (
  make: () => Harness,
  opts: { depth: number; maxStates: number },
): Report => {
  const boot = withV(() => {
    const h = make();
    h.start({ machines: [s1Persisted], seed: 1 });
    for (const a of actors) h.do({ ensure: a });
    return h;
  });
  return bfs({
    make: boot,
    actions: ALPHABET.map((a) => (a.name.startsWith("commit.") ? { ...a, on: budget } : a)),
    depth: opts.depth,
    maxStates: opts.maxStates,
    extra: (s) => `${commitsIn(s)}`,
    edge(_pre, post) {
      // R17: once unknown, never a definite ending for that Attempt (rule 17, rule 18, 2.7.13's restore row).
      // R18: once unknown, never Superseded (rule 21: only a never-sent commit is replaceable).
      const unknown = new Set<unknown>();
      const released = new Set(post.read.evidence("Released").map((e) => e["attempt"]));
      for (const e of post.read.evidence()) {
        if (e["kind"] === "ending" && e["op"] === "w") {
          if (e["channel"] === "unknown") unknown.add(e["attempt"]);
          else if (unknown.has(e["attempt"]) && e["channel"] === "failure")
            throw new Oracle(`R17: ${e["reason"]} after unknown for ${e["attempt"]}`);
        }
        if (e["kind"] === "Superseded" && unknown.has(e["attempt"]))
          throw new Oracle(`R18: Superseded after unknown for ${e["attempt"]}`);
      }
      // S7: no ack, no request.
      const acked = post.read.truth().acked;
      for (const x of post.read.requests())
        if (x.idempotencyKey !== undefined && !acked.some((v) => v.includes(x.idempotencyKey!)))
          throw new Oracle(`S7: request before ack`);
      // S5: at most one undecided Attempt per record on the wire, unless released (OD20 F1).
      const live = post.read.outside().open.filter((o) => o.op === "w" && !released.has(o.key));
      for (const rec of [1, 2]) {
        const n = new Set(live.filter((o) => (o.input.mask & rec) !== 0).map((o) => o.key));
        if (n.size > 1) throw new Oracle(`S5: ${n.size} Attempts on the wire for one record`);
      }
    },
    state(h) {
      checkClaims(h.read);
      checkEndings(h.read);
      if (h.read.quiet().fatal) throw new Oracle("fatal");
      // Last intent: server backwards only if something was released (stated limit, OD20 F1) or the disk lost one.
      if (h.read.truth().server.inverted && h.read.evidence("Released").length === 0)
        throw new Oracle("the server went backwards with nothing released");
    },
  });
};
