// What `flow check` must catch, written on purpose: a pin against a check that says nothing.
import { Effect } from "effect";
import { fixtureOf } from "../../conformance/fixtures/build.ts";
import type { Fixture } from "../../conformance/harness.ts";

const B = "Lab/Broken";
const b = fixtureOf(B);
const op = (id: string, outcomes: object, extra: object = {}) => ({
  id,
  contract: `lab/${id}`,
  kind: "write" as const,
  key: b.key(id, () => ({})),
  concurrency: "reject" as const,
  commit: () => Effect.void as Effect.Effect<unknown, unknown>,
  outcomes: outcomes as never,
  ...extra,
});
// No unknown; `Ok` handled only in W, so late is unhandled.
export const brokenFixture: Fixture = {
  id: B,
  make: () => ({
    id: B,
    root: "root",
    default: "A",
    nodes: {
      root: { ...b.node("root", { Go: [{ target: "W", members: b.commit("charge", () => ({})) }] }), default: "A" },
      A: b.node("A", {}),
      W: b.node("W", { Ok: [{ target: "A" }], No: [{ target: "A" }] }),
    },
    memory: b.memory(() => ({})),
    ops: { charge: op("charge", { success: { event: "Ok" }, failure: { NotSent: { event: "No" } } }, { keyFields: [] }) },
    persisted: true,
    uses: [],
  }),
};
const K = "Lab/Keyless";
const k = fixtureOf(K);
// A key-less cancel in a handler that is not `charge`'s, and a hold in a state with no owner.
export const keylessFixture: Fixture = {
  id: K,
  make: () => ({
    id: K,
    root: "root",
    default: "A",
    nodes: {
      root: {
        ...k.node("root", {
          Go: [{ target: "W", tokens: [{ op: "charge", verb: "idle", key: k.slot("Go.key", () => ({ id: "x" })) }], members: k.commit("charge", () => ({ id: "x" })) }],
          Ok: [{}],
          No: [{}],
          Unsure: [{ target: "STUCK" }],
          Stop: [{ members: k.member("charge", "cancel") }],
        }),
        default: "A",
      },
      A: k.node("A", {}),
      W: k.node("W", {}),
      STUCK: k.node("STUCK", {}),
    },
    memory: k.memory(() => ({})),
    ops: {
      charge: {
        ...op("charge", { success: { event: "Ok" }, failure: { NotSent: { event: "No" } }, unknown: { event: "Unsure" } }, { keyFields: ["id"] }),
      },
    },
    persisted: true,
    uses: [],
    events: { external: ["Go", "Stop", "NeverHandled"], internal: ["Ok", "No", "Unsure"] },
  }),
};
const DS = "Lab/DupSession";
const d = fixtureOf(DS);
const stream = (id: string) => ({
  id,
  key: () => ({}),
  reconnect: false,
  idleMs: 0,
  healthyMs: 0,
  backoff: () => 0,
  subscribe: () => undefined,
  value: { event: "V" },
  missed: { event: "V" },
  failure: { event: "V" },
});
export const dupSessionFixture: Fixture = {
  id: DS,
  make: () => ({
    id: DS,
    root: "root",
    default: "root",
    nodes: { root: d.node("root", { V: [{}] }) },
    memory: d.memory(() => ({})),
    ops: {},
    persisted: false,
    uses: [],
    streams: { a: stream("room"), b: stream("room") },
  }),
};

const N = "Lab/NoOwner";
const n = fixtureOf(N);
// 2.7.14 case 2: `unknown` is mapped, nothing owns the hold. `withUnreachable`: a cancel exists, in a state nothing reaches: a warning, not an error.
export const noOwnerFixture = (withUnreachable: boolean): Fixture => ({
  id: N,
  make: () => ({
    id: N,
    root: "root",
    default: "A",
    nodes: {
      root: {
        ...n.node("root", {
          Go: [{ tokens: [{ op: "charge", verb: "idle", key: n.slot("Go.key", () => ({})) }], members: n.commit("charge", () => ({})) }],
          Ok: [{}],
          No: [{}],
          Unsure: [{}],
        }),
        default: "A",
      },
      A: n.node("A", {}),
      ...(withUnreachable ? { Z: n.node("Z", { Off: [{ members: n.member("charge", "cancel", () => ({})) }] }) } : {}),
    },
    memory: n.memory(() => ({})),
    ops: { charge: op("charge", { success: { event: "Ok" }, failure: { NotSent: { event: "No" } }, unknown: { event: "Unsure" } }, { keyFields: [] }) },
    persisted: true,
    uses: [],
  }),
});
const L = "Lab/LateOk";
const l = fixtureOf(L);
// Rule 20's current row: `Ok` handled in W's sibling only, so the owner W has no handler; read without Defect.
export const readBadFixture: Fixture = {
  id: L,
  make: () => ({
    id: L,
    root: "root",
    default: "W",
    nodes: {
      root: { ...l.node("root", { Late: [{}] }), default: "W" },
      W: l.node("W", { Load: [{ members: l.lookup("list", () => ({})) }] }),
    },
    memory: l.memory(() => ({})),
    ops: { list: { ...op("list", { success: { event: "Got" }, failure: {} }), kind: "read" as const } },
    persisted: false,
    uses: [],
  }),
};

// Review's two rules with no pin: a write that does not map `NotSent`, and an event nothing declares.
const G = "Lab/Gaps";
const g = fixtureOf(G);
const gapMachine = (ops: object, on: object, events: object) => ({
  id: G,
  root: "root",
  default: "A",
  nodes: {
    root: { ...g.node("root", { Go: [{ target: "A", members: g.commit("charge", () => ({})) }], Ok: [{}], No: [{}], Unsure: [{}], ...on }), default: "A" },
    A: g.node("A", {}),
  },
  memory: g.memory(() => ({})),
  ops: ops as never,
  persisted: true,
  uses: [],
  events: events as never,
});
const gapOp = (failure: object) => ({
  charge: { id: "charge", contract: "lab/charge", kind: "write" as const, key: g.key("charge", () => ({})), keyFields: [], concurrency: "reject" as const, commit: () => Effect.void as Effect.Effect<unknown, unknown>, outcomes: { success: { event: "Ok" }, failure, unknown: { event: "Unsure" } } },
});
const evs = (...extra: string[]) => ({ external: ["Go"], internal: ["Ok", "No", "Unsure", ...extra] });
export const noNotSentFixture: Fixture = { id: G, make: () => gapMachine(gapOp({}), {}, evs()) as never };
export const unencodableNoNotSentFixture: Fixture = {
  id: G,
  make: () => {
    const op = gapOp({}).charge;
    return { ...gapMachine({ charge: { ...op, concurrency: "latest", inputFields: ["x"], inputNotCarried: ["x"] } }, {}, evs()), persisted: false } as never;
  },
};
export const unknownEventFixture: Fixture = { id: G, make: () => gapMachine(gapOp({ NotSent: { event: "No" } }), { Nobody: [{}] }, evs()) as never };

// D124: the lint reads tables only: this one has no Schema behind it. `typed/form.typed.ts` is the front end's half.
export const bigintKeyFixture: Fixture = {
  id: "Lab/BigKey",
  make: (api) => {
    const m = keylessFixture.make(api);
    const charge = Object.values(m.ops)[0]!;
    return { ...m, id: "Lab/BigKey", ops: { ...m.ops, [charge.id]: { ...charge, keyFields: ["orderId"], inputNotCarried: ["orderId"] } } };
  },
};
// SharedContract (design 2.7, F2): `rename` and `archive` both write `lab/updateTicket`. Each is mapped and handled, so the shared contract is the only new finding.
const S = "Lab/SharedContract";
const sc = fixtureOf(S);
const writeOp = (id: string, ev: string, contract: string) => ({
  id,
  contract,
  kind: "write" as const,
  key: sc.key(id, () => ({})),
  keyFields: [],
  concurrency: "reject" as const,
  commit: () => Effect.void as Effect.Effect<unknown, unknown>,
  outcomes: { success: { event: `${ev}Ok` }, failure: { NotSent: { event: `${ev}No` } }, unknown: { event: `${ev}Unsure` } } as never,
});
export const sharedContractFixture: Fixture = {
  id: S,
  make: () => ({
    id: S,
    root: "root",
    default: "A",
    nodes: {
      root: {
        ...sc.node("root", {
          Rename: [{ members: sc.commit("rename", () => ({})) }],
          Archive: [{ members: sc.commit("archive", () => ({})) }],
          RenameOk: [{}],
          RenameNo: [{}],
          RenameUnsure: [{}],
          ArchiveOk: [{}],
          ArchiveNo: [{}],
          ArchiveUnsure: [{}],
          StopRename: [{ members: sc.member("rename", "cancel") }],
          StopArchive: [{ members: sc.member("archive", "cancel") }],
        }),
        default: "A",
      },
      A: sc.node("A", {}),
    },
    memory: sc.memory(() => ({})),
    ops: { rename: writeOp("rename", "Rename", "lab/updateTicket"), archive: writeOp("archive", "Archive", "lab/updateTicket") },
    persisted: true,
    uses: [],
  }),
};
// GoneWithoutKey (design rule 37): `list` is a read with a `.gone` entry and no `.byKey`, so the entry has no `ref`.
const GK = "Lab/GoneWithoutKey";
const gk = fixtureOf(GK);
export const goneWithoutKeyFixture: Fixture = {
  id: GK,
  make: () => ({
    id: GK,
    root: "root",
    default: "A",
    nodes: {
      root: {
        ...gk.node("root", {
          Load: [{ members: gk.lookup("list", () => ({})) }],
          Got: [{}],
          Failed: [{}],
          Stopped: [{}],
        }),
        default: "A",
      },
      A: gk.node("A", {}),
    },
    memory: gk.memory(() => ({})),
    ops: {
      list: {
        id: "list",
        contract: "lab/list",
        kind: "read" as const,
        key: gk.key("list", () => ({})),
        keyFields: [],
        concurrency: "reject" as const,
        commit: () => Effect.void as Effect.Effect<unknown, unknown>,
        outcomes: { success: { event: "Got" }, failure: { Defect: { event: "Failed" }, Interrupted: { event: "Stopped" } } } as never,
      },
    },
    domain: { writes: {}, reads: { list: () => [] }, gone: { list: { tag: "NotFound" } } as never, repair: () => Effect.void },
    persisted: false,
    uses: [],
  }),
};
