import { noFolds } from "./folds.ts";
import { Schema } from "effect";
import { Empty, type Fixture, writeOf } from "./fixture.ts";
import { guarded, to, updating } from "./handlers.ts";
import { type Concurrency, claimed, classifyWith, row } from "./reference.ts";

const Unkeyed = Empty;

const oneLaneWrite = <C extends Concurrency>(concurrency: C) =>
  writeOf(Unkeyed, {
    concurrency,
    releasesOnLeave: [],
    success: "Ok",
    failure: { NotSent: "No" },
    unknown: { event: "Unsure" },
    classify: classifyWith(() => false),
  });

const serializeEvents = { Go: Schema.Struct({ n: Schema.Number }), All: Empty };

/**
 * `Lab/P1All` (`prototypes/conformance/typed/phase1h.ts`): one unkeyed `serialize` write, `put`,
 * mapped to `Ok`, `No` and `Unsure`; `All` runs its `cancelAll`.
 */
export const Serialize = {
  name: "serialize",
  machine: "Lab/P1All",
  events: serializeEvents,
  memory: Schema.Struct({}),
  input: Empty,
  states: ["A"] as const,
  operations: {
    put: oneLaneWrite("serialize"),
  },
  rows: [
    row("Go", "any", "same", [{ operation: "put", kind: "commit" }]),
    row("All", "any", "same", [{ operation: "put", kind: "cancelAll", keyed: false }]),
  ],
  handlers: {
    folds: noFolds,
    initial: "A",
    root: {
      Go: [to("stay")],
      All: [to("stay")],
      Ok: [to("stay")],
      No: [to("stay")],
      Unsure: [to("stay")],
    },
    states: {},
    schedules: {},
    parts: {},
  },
} satisfies Fixture;

/**
 * `Lab/P1Latest` (`prototypes/conformance/typed/phase1h.ts`): one unkeyed `latest` write,
 * `search`.
 */
export const Latest = {
  name: "latest",
  machine: "Lab/P1Latest",
  events: { Go: Schema.Struct({ q: Schema.String }) },
  memory: Schema.Struct({}),
  input: Empty,
  states: ["A"] as const,
  operations: { search: oneLaneWrite("latest") },
  rows: [row("Go", "any", "same", [{ operation: "search", kind: "commit" }])],
  handlers: {
    folds: noFolds,
    initial: "A",
    root: { Go: [to("stay")], Ok: [to("stay")], No: [to("stay")], Unsure: [to("stay")] },
    states: {},
    schedules: {},
    parts: {},
  },
} satisfies Fixture;

/**
 * `Lab/R15Switch` (`prototypes/conformance/typed/round15.ts`): one unkeyed `cancel` write,
 * `search`; its `Unsure` re-sends while `Retrying` was sent.
 */
export const Cancel = {
  name: "cancel",
  machine: "Lab/R15Switch",
  events: { Go: Schema.Struct({ q: Schema.String }), Retrying: Empty },
  memory: Schema.Struct({ retrying: Schema.Boolean, oks: Schema.Number }),
  input: Empty,
  states: ["A", "W"] as const,
  operations: { search: oneLaneWrite("cancel") },
  rows: [
    row("Go", "any", "W", [{ operation: "search", kind: "commit" }]),
    row("Unsure", "any", "same", [{ operation: "search", kind: "retry", keyed: false }]),
  ],
  handlers: {
    folds: noFolds,
    initial: "A",
    root: {
      Go: [to("W")],
      Retrying: [updating(to("stay"))],
      Ok: [updating(to("A"))],
      No: [to("A")],
      Unsure: [guarded(to("stay")), to("A")],
    },
    states: {},
    schedules: {},
    parts: {},
  },
} satisfies Fixture;

const LEAVES = [
  { event: "Leave", from: "HOST", to: "AWAY" },
  { event: "LeaveOnly", from: "HOST", to: "AWAY" },
];

/**
 * `Lab/P1Rel` (`prototypes/conformance/typed/phase1h.ts`): HOST places the trait `t` (`P1Q`), whose
 * unkeyed `serialize` write `q` its `whenAbandoned` cancels, so leaving HOST releases the lane
 * (WriteLanes R16). `Leave` also raises `t.Drop`, which runs `q`'s `cancelAll`; `LeaveOnly` only
 * leaves. The trait's events (`Go`, `Drop`) are sent to the part `["t"]`.
 */
export const Release = {
  name: "rel",
  machine: "Lab/P1Rel",
  events: { Leave: Empty, LeaveOnly: Empty },
  memory: Schema.Struct({}),
  input: Empty,
  states: ["HOST", "AWAY"] as const,
  operations: {
    q: writeOf(Unkeyed, {
      concurrency: "serialize",
      releasesOnLeave: LEAVES,
      success: "Ok",
      failure: { NotSent: "No" },
      unknown: { event: "Unsure" },
      classify: classifyWith(() => false),
    }),
  },
  rows: [
    row("Go", "any", "same", [{ operation: "q", kind: "commit" }]),
    row("Leave", "HOST", "AWAY", [{ operation: "q", kind: "cancelAll", keyed: false }]),
    row("LeaveOnly", "HOST", "AWAY", []),
  ],
  handlers: {
    folds: noFolds,
    initial: "HOST",
    root: { Leave: [to("AWAY")], LeaveOnly: [to("AWAY")] },
    states: {},
    schedules: {},
    parts: {
      P1Q: {
        Go: [to("stay")],
        Drop: [to("stay")],
        Ok: [to("stay")],
        No: [to("stay")],
        Unsure: [to("stay")],
      },
    },
  },
} satisfies Fixture;

/**
 * `Lab/LateQueue` (`prototypes/conformance/typed/latequeue.ts`): one unkeyed `serialize` write,
 * `charge`, committed by `Go`, which re-enters W (a new Activation each time, Turn R3); `Away`
 * leaves W for B; `Unsure` goes to A, cancelling the lane once `Cancelling` was sent.
 */
export const LateQueue = {
  name: "latequeue",
  machine: "Lab/LateQueue",
  events: { Go: Empty, Away: Empty, Cancelling: Empty },
  memory: Schema.Struct({ cancelling: Schema.Boolean }),
  input: Empty,
  states: ["A", "W", "B"] as const,
  operations: { charge: oneLaneWrite("serialize") },
  rows: [
    row("Go", "any", "W", [{ operation: "charge", kind: "commit" }]),
    claimed(row("Unsure", "any", "A", [{ operation: "charge", kind: "cancel", keyed: false }])),
  ],
  handlers: {
    folds: noFolds,
    initial: "A",
    root: {
      Go: [to("W")],
      Away: [to("B")],
      Cancelling: [updating(to("stay"))],
      Ok: [to("B")],
      No: [to("A")],
      Unsure: [guarded(to("A")), to("A")],
    },
    states: {},
    schedules: {},
    parts: {},
  },
} satisfies Fixture;
