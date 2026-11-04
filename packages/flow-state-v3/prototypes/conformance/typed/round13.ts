// Round 13 (round 12 review H1, M1): D221's lane stamp, on typed machines. Each fixture is the design's spelling; the review's probes P1-P3 as cases.
import { Effect, Schema } from "effect";
import { definition, Flow, machine, transaction } from "../compile/index.ts";
import type { Release } from "../fixtures/round6.compiled.ts";
import { FakeApi, fixture, write } from "./lab.ts";

const S = Schema;
// P1: no release. Key `["k", "region"]` with `region` optional: `{ k: a }` and `{ k: a, region: eu }` are two keys, so two server things (rule 39), in
// either order. Round 12's shape test declined the second in one order only.
const optional = transaction({
  id: "lab/stamp-charge",
  input: { k: S.String, id: S.String, region: S.optionalKey(S.String) },
  key: ["k", "region"],
  concurrency: "reject",
  services: [FakeApi],
  commit: write("charge"),
});
const shapeD = definition({
  id: "Lab/KeyShape",
  states: [],
  events: { GoA: {}, GoEu: {}, RetryA: {} },
  internalEvents: { Ok: {}, No: { why: S.String }, Unsure: Flow.uncertain({}) },
  memory: { unsure: Flow.initial(S.Number, 0), declined: Flow.initial(S.Number, 0) },
  operations: ({ E }) => ({ charge: optional.outcomes({ success: E.Ok, failure: { NotSent: E.No.from((r: { why: string }) => ({ why: r.why })) }, unknown: E.Unsure }) }),
});
export const keyShapeFixture = fixture(
  machine(shapeD, ({ O }) => ({
    default: { node: "root" },
    on: {
      GoA: { actions: [O.charge.commit(() => ({ k: "a", id: "x" }))] },
      GoEu: { actions: [O.charge.commit(() => ({ k: "a", id: "y", region: "eu" }))] },
      // Review M1: a typed key with its optional field absent names the lane `{ k: a }`, as the commit made it. A type error in round 12.
      RetryA: { actions: [O.charge.retry(() => ({ k: "a" }))] },
      Ok: {},
      No: { updateMemory: ({ memory }) => ({ declined: memory.declined + 1 }) },
      Unsure: { updateMemory: ({ memory }) => ({ unsure: memory.unsure + 1 }) },
    },
  })),
);

// P2, P3: release 1 keys by `k`; release 2 adds `region`, required. Release 1's stored input has no `region`, so the held lane cannot be placed under the new
// key (D78 has no name to move it to): it stays stamped `["k"]`, an older-key lane. D217 declines a commit that agrees with it on `k`; D221 gives the owner a
// way out (a keyed `retry` or `cancel` names it, by the same lookup) and makes a keyed `idle` see it. Another key value, and another actor, are not it.
const stamped = (rel: Release) => {
  const charge = transaction({
    id: "lab/stamp-charge",
    input: { k: S.String, id: S.String, region: rel.v === 1 ? S.optionalKey(S.String) : S.String },
    key: rel.v === 1 ? (["k"] as const) : (["k", "region"] as const),
    concurrency: "reject",
    services: [FakeApi],
    commit: write("charge"),
  });
  const d = definition({
    id: "Lab/KeyStamp",
    states: [],
    events: { Go: { k: S.String }, Guarded: { k: S.String }, Retry: { k: S.String }, Cancel: { k: S.String } },
    internalEvents: { Ok: {}, No: { why: S.String }, Unsure: Flow.uncertain({}) },
    memory: { unsure: Flow.initial(S.Number, 0), declined: Flow.initial(S.Number, 0), guardedOut: Flow.initial(S.Number, 0), oks: Flow.initial(S.Number, 0) },
    operations: ({ E }) => ({
      charge: charge.outcomes({ success: E.Ok, failure: { NotSent: E.No.from((r: { why: string }) => ({ why: r.why })) }, unknown: E.Unsure }),
    }),
  });
  const input = (k: string) => (rel.v === 1 ? { k, id: `${k}-1` } : { k, id: `${k}-2`, region: "eu" });
  return machine(d, ({ O }) => ({
    default: { node: "root" },
    on: {
      Go: { actions: [O.charge.commit(({ event }) => input(event.k) as never)] },
      // P3: the guard sees what the commit would meet.
      Guarded: [
        { guard: [O.charge.idle(({ event }) => (rel.v === 1 ? { k: event.k } : { k: event.k, region: "eu" }) as never)], actions: [O.charge.commit(({ event }) => input(event.k) as never)] },
        { updateMemory: ({ memory }) => ({ guardedOut: memory.guardedOut + 1 }) },
      ],
      Retry: { actions: [O.charge.retry(({ event }) => (rel.v === 1 ? { k: event.k } : { k: event.k, region: "eu" }) as never)] },
      Cancel: { actions: [O.charge.cancel(({ event }) => (rel.v === 1 ? { k: event.k } : { k: event.k, region: "eu" }) as never)] },
      Ok: { updateMemory: ({ memory }) => ({ oks: memory.oks + 1 }) },
      No: { updateMemory: ({ memory }) => ({ declined: memory.declined + 1 }) },
      Unsure: { updateMemory: ({ memory }) => ({ unsure: memory.unsure + 1 }) },
    },
  }));
};
export const keyStampFixture = (rel: Release) => fixture(() => stamped(rel));

// Round 13 (round 12 review M2, D222): creation is the Schema's constructor, restore its codec. An input with a constructor default, left out at creation, takes
// it; one with only a decoding default is the codec's, so creation refuses it as missing.
const ctorD = definition({
  id: "Lab/CtorInput",
  states: [],
  events: {},
  internalEvents: {},
  memory: { n: Flow.input(S.Number.pipe(S.withConstructorDefault(Effect.succeed(7)))) },
  operations: () => ({}),
});
export const ctorInputFixture = fixture(machine(ctorD, () => ({ default: { node: "root" } })));
const decodeOnlyD = definition({
  id: "Lab/DecodeOnlyInput",
  states: [],
  events: {},
  internalEvents: {},
  memory: { n: Flow.input(S.Number.pipe(S.withDecodingDefaultKey(Effect.succeed(4)))) },
  operations: () => ({}),
});
export const decodeOnlyInputFixture = fixture(machine(decodeOnlyD, () => ({ default: { node: "root" } })));
