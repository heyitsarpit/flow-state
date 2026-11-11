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
