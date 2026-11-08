// Phase 1 area H: fixtures for round 13's H1, H2, M2 and the runner's R5-R12.
import { Schema } from "effect";
import { definition, Flow, machine, trait, transaction } from "../compile/index.ts";
import type { Compiled } from "../fixtures/compiled.ts";
import type { Release } from "../fixtures/round6.compiled.ts";
import type { Fixture } from "../harness.ts";
import { editorFixture } from "./identity.ts";
import { FakeApi, fixture, write } from "./lab.ts";
import { keyStampFixture } from "./round13.ts";

const S = Schema;
// R5: one unkeyed `serialize` lane, whose commits stay in the root (no lateness); `All` cancels the whole lane (`cancelAll`), wherever its head is.
export const P1AllId = "Lab/P1All";
const put = transaction({ id: "lab/p1Put", input: { n: S.Number }, key: [], concurrency: "serialize", services: [FakeApi], commit: write("put") });
const allFx = fixture(
  machine(
    definition({
      id: P1AllId,
      persist: true,
      states: ["A"],
      events: { Go: { n: S.Number }, All: {} },
      internalEvents: { Ok: {}, No: {}, Unsure: Flow.uncertain({}) },
      memory: {},
      operations: ({ E }) => ({ put: put.outcomes({ success: E.Ok, failure: { NotSent: E.No }, unknown: E.Unsure }) }),
    }),
    ({ S: St, O }) => ({ default: St.A, on: { Go: { actions: [O.put.commit(({ event }) => ({ n: event.n }))] }, All: { actions: [O.put.cancelAll] }, Ok: {}, No: {}, Unsure: {} } }),
  ),
);
export const p1AllFixture = () => allFx;

// R10: a trait whose op its abandonment releases (rule 60); the host leaves the trait's state and, in the same turn, raises `Drop` into it, which cancels
// the whole lane (`cancelAll`). The release wins: the queued commits end as evidence.
const q = transaction({ id: "lab/p1Q", input: { n: S.Number }, key: [], concurrency: "serialize", services: [FakeApi], commit: write("q") });
const Q = trait(
  {
    id: "P1Q",
    events: { Go: { n: S.Number } },
    hostEvents: { Drop: {} },
    internalEvents: { Ok: {}, No: {}, Unsure: Flow.uncertain({}) },
    operations: ({ E }) => ({ q: q.outcomes({ success: E.Ok, failure: { NotSent: E.No }, unknown: E.Unsure }) }),
  },
  ({ O }) => ({
    on: { Go: { actions: [O.q.commit(({ event }) => ({ n: event.n }))] }, Drop: { actions: [O.q.cancelAll] }, Ok: {}, No: {}, Unsure: {} },
    whenAbandoned: [O.q.cancel],
  }),
);
export const P1RelId = "Lab/P1Rel";
const relFx = fixture(
  machine(
    definition({ id: P1RelId, persist: true, states: [{ HOST: Flow.state({ traits: { t: Q } }) }, "AWAY"], events: { Leave: {}, LeaveOnly: {} }, internalEvents: {}, memory: {}, operations: () => ({}) }),
    // `as never`: `E` types the definition's own traits; a trait placed on a state is not in it yet (owed).
    ({ S: St, E }) => ({ default: St.HOST, on: { Leave: { target: St.AWAY, raise: [(E as unknown as { readonly t: { readonly Drop: never } }).t.Drop] }, LeaveOnly: St.AWAY } }),
  ),
);
export const p1RelFixture = () => relFx;

// R11: an op named `search` as R15Switch's is, under `latest`, so an oracle that reads a policy by op name alone reads the wrong one.
export const P1LatestId = "Lab/P1Latest";
const latestSearch = transaction({ id: "lab/p1Search", input: { q: S.String }, key: [], concurrency: "latest", services: [FakeApi], commit: write("search") });
const latestFx = fixture(
  machine(
    definition({ id: P1LatestId, persist: true, states: ["A"], events: { Go: { q: S.String } }, internalEvents: { Ok: {}, No: {}, Unsure: Flow.uncertain({}) }, memory: {}, operations: ({ E }) => ({ search: latestSearch.outcomes({ success: E.Ok, failure: { NotSent: E.No }, unknown: E.Unsure }) }) }),
    ({ S: St, O }) => ({ default: St.A, on: { Go: { actions: [O.search.commit(({ event }) => ({ q: event.q }))] }, Ok: {}, No: {}, Unsure: {} } }),
  ),
);
export const p1LatestFixture = () => latestFx;

// R9: release 1 has an op `gone`; release 2 drops it (its lane record is then quarantined: no operation).
export const P1GoneId = "Lab/P1Gone";
const goneOp = transaction({ id: "lab/p1Gone", input: { n: S.Number }, key: [], concurrency: "reject", services: [FakeApi], commit: write("gone") });
export const p1GoneFixture = (rel: Release) =>
  fixture(() =>
    rel.v === 1
      ? machine(
          definition({ id: P1GoneId, persist: true, states: ["A"], events: { Go: {} }, internalEvents: { Ok: {}, No: {}, Unsure: Flow.uncertain({}) }, memory: {}, operations: ({ E }) => ({ gone: goneOp.outcomes({ success: E.Ok, failure: { NotSent: E.No }, unknown: E.Unsure }) }) }),
          ({ S: St, O }) => ({ default: St.A, on: { Go: { actions: [O.gone.commit(() => ({ n: 1 }))] }, Ok: {}, No: {}, Unsure: {} } }),
        )
      : machine(definition({ id: P1GoneId, persist: true, states: ["A"], events: { Go: {} }, internalEvents: {}, memory: {}, operations: () => ({}) }), ({ S: St }) => ({ default: St.A, on: { Go: {} } })),
  );

// R7: a release compiled by the Flow before the format tag (untagged format 1, `name#hash`). Its stamps and identity versions are the compiler's own
// format 1 spelling of the same Schemas, as that Flow wrote them.
export const inFormat1 = (c: Compiled): Compiled => ({
  ...c,
  ...(c.identityVersion ? { identityVersion: c.identityVersionByFormat!["1"]! } : {}),
  ops: Object.fromEntries(Object.entries(c.ops).map(([k, o]) => [k, o.keyVersion ? { ...o, keyVersion: o.keyVersionByFormat!["1"]! } : o])),
});
// Release 0 is release 1 compiled in format 1; every other release is itself, in the current format.
const asRelease = (rel: Release): Release => ({
  get v() {
    return rel.v === 0 ? 1 : rel.v;
  },
  set v(x: number) {
    rel.v = x;
  },
});
const format1At0 = (rel: Release, fx: Fixture): Fixture => ({ ...fx, make: (api) => (rel.v === 0 ? inFormat1(fx.make(api)) : fx.make(api)) });
export const keyStampFormat1Fixture = (rel: Release): Fixture => format1At0(rel, keyStampFixture(asRelease(rel)));
export const editorFormat1Of = (rel: Release): Fixture => format1At0(rel, editorFixture(asRelease(rel)));
