// Round 13 (D221, D222): typed machines for an op's key fields across releases, and for one default per field at both doors.
import { Effect, Schema } from "effect";
import type { Op } from "../fixtures/compiled.ts";
import { definition, Flow, machine, transaction } from "../compile/index.ts";
import type { Release } from "../fixtures/round6.compiled.ts";
import { FakeApi, fixture, write } from "./lab.ts";

const S = Schema;
// D221: an op's key fields are part of its identity. Release 1 keys `charge` by `k`; release 2 by `k` and `region` (a field added, required); release 3 by
// `k` again (the field removed). A key field is required wherever it is one; elsewhere `region` is an optional input. Round 15 (U17): release 4
// keys by `k` as `Trim` (the type side changes, the encoded side is a string still); release 5 by `k` with a description only. Round 15b (Q2 A):
// releases 6 and 7 check `k` with `isMinLength(1)` and `isMinLength(2)`; releases 8 and 9 with two custom filters (no representation).
const kSchema = (v: number) =>
  v === 4
    ? S.Trim
    : v === 5
      ? S.String.annotate({ description: "the order" })
      : v === 6 || v === 7
        ? S.String.check(S.isMinLength(v - 5))
        : v === 8 || v === 9
          ? S.String.check(S.makeFilter((s: string) => s.length < (v === 8 ? 10 : 20)))
          : v === 10
            ? S.Number
            : S.String;
// Phase 1 (round 13's H2, K1): release 10 keeps the name `k` and makes it a number, a new version. Release 11 is release 2's key reordered (M2).
const fieldsOf = (v: number) => (v === 2 ? (["k", "region"] as const) : v === 11 ? (["region", "k"] as const) : (["k"] as const));
const regionRequired = (v: number) => v === 2 || v === 11;
const stamped = (rel: Release, policy: Op["concurrency"]) => {
  const charge = transaction({
    id: "lab/stamp-charge",
    input: { k: kSchema(rel.v), id: S.String, region: regionRequired(rel.v) ? S.String : S.optionalKey(S.String) },
    key: fieldsOf(rel.v),
    concurrency: policy,
    services: [FakeApi],
    commit: write("charge"),
  });
  const Key = { k: S.String, region: S.optionalKey(S.String) };
  const d = definition({
    id: "Lab/KeyStamp",
    persist: true,
    states: [],
    events: { Go: Key, Guarded: Key, Retry: Key, Cancel: Key, Retryable: Key },
    internalEvents: { Ok: {}, No: { why: S.String }, Unsure: Flow.uncertain({}) },
    memory: {
      unsure: Flow.initial(S.Number, 0),
      declined: Flow.initial(S.Number, 0),
      guardedOut: Flow.initial(S.Number, 0),
      oks: Flow.initial(S.Number, 0),
      why: Flow.initial(S.String, ""),
      notRetryable: Flow.initial(S.Number, 0),
    },
    operations: ({ E }) => ({
      charge: charge.outcomes({ success: E.Ok, failure: { NotSent: E.No.from((r: { why: string }) => ({ why: r.why })) }, unknown: E.Unsure }),
    }),
  });
  type K = { readonly k: string; readonly region?: string };
  // A commit's input; a member's key is exactly the event's fields, so an old-version hold is named by its own old key (an exact lane id).
  const input = (e: K) => ({ k: rel.v === 10 ? Number(e.k) : e.k, id: `${e.k}-${e.region ?? "none"}-${rel.v}`, ...(e.region === undefined ? (regionRequired(rel.v) ? { region: "eu" } : {}) : { region: e.region }) });
  const keyOf = (e: K) => (e.region === undefined ? { k: e.k } : { k: e.k, region: e.region });
  return machine(d, ({ O }) => ({
    default: { node: "root" },
    on: {
      Go: { actions: [O.charge.commit(({ event }) => input(event) as never)] },
      Guarded: [
        { guard: [O.charge.idle(({ event }) => keyOf(event) as never)], actions: [O.charge.commit(({ event }) => input(event) as never)] },
        { updateMemory: ({ memory }) => ({ guardedOut: memory.guardedOut + 1 }) },
      ],
      // `as never`: a typed member names the current version's key; an old version's key has another shape, which no typed handle has yet (owed).
      Retry: { actions: [O.charge.retry(({ event }) => keyOf(event) as never)] },
      Cancel: { actions: [O.charge.cancel(({ event }) => keyOf(event) as never)] },
      Retryable: [
        { guard: [O.charge.retryable(({ event }) => keyOf(event) as never, { times: 3 })], actions: [O.charge.retry(({ event }) => keyOf(event) as never)] },
        { updateMemory: ({ memory }) => ({ notRetryable: memory.notRetryable + 1 }) },
      ],
      Ok: { updateMemory: ({ memory }) => ({ oks: memory.oks + 1 }) },
      No: { updateMemory: ({ memory, event }) => ({ declined: memory.declined + 1, why: event.why }) },
      Unsure: { updateMemory: ({ memory }) => ({ unsure: memory.unsure + 1 }) },
    },
  }));
};
export const keyStampFixture = (rel: Release, policy: Op["concurrency"] = "reject") => fixture(() => stamped(rel, policy));

// D222 (Arpit's call via the coordinator, proposed): a field has one default, and it applies at creation and at restore alike. Release 1 has no `n`;
// release 2 adds it, with a constructor default (`CtorInput`) or a decoding default (`DecodeInput`): an old actor restores with it, a new one starts with it.
const withDefault = (id: string, rel: Release, decoding: boolean) =>
  definition({
    id,
    persist: true,
    states: [],
    events: {},
    internalEvents: {},
    memory: {
      seen: Flow.initial(S.Number, 1),
      ...(rel.v >= 2 ? { n: Flow.input(decoding ? S.Number.pipe(S.withDecodingDefaultKey(Effect.succeed(4))) : S.Number.pipe(S.withConstructorDefault(Effect.succeed(7)))) } : {}),
    },
    operations: () => ({}),
  });
export const ctorInputFixture = (rel: Release) => fixture(() => machine(withDefault("Lab/CtorInput", rel, false), () => ({ default: { node: "root" } })));
export const decodeInputFixture = (rel: Release) => fixture(() => machine(withDefault("Lab/DecodeInput", rel, true), () => ({ default: { node: "root" } })));
