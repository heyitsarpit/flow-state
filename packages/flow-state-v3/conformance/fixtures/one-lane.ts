import { Schema } from "effect";
import { Empty, type Fixture, writeOf } from "./fixture.ts";
import { type CancelsOf, type Concurrency, classifyWith, row } from "./reference.ts";

const Unkeyed = Empty;

const oneLaneWrite = <C extends Concurrency>(concurrency: C, cancels: CancelsOf<string>) =>
  writeOf(Unkeyed, {
    concurrency,
    releasesOnLeave: [],
    success: "Ok",
    failure: { NotSent: "No" },
    unknown: { event: "Unsure" },
    classify: classifyWith(() => false),
    cancels,
    mayCancel: [],
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
    put: oneLaneWrite("serialize", {
      All: "cancelAll",
    } satisfies CancelsOf<keyof typeof serializeEvents>),
  },
  rows: [
    row("Go", "any", "same", [{ operation: "put", kind: "commit" }]),
    row("All", "any", "same", [{ operation: "put", kind: "cancelAll" }]),
  ],
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
  operations: { search: oneLaneWrite("latest", {}) },
  rows: [row("Go", "any", "same", [{ operation: "search", kind: "commit" }])],
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
  operations: { search: oneLaneWrite("cancel", {}) },
  rows: [
    row("Go", "any", "W", [{ operation: "search", kind: "commit" }]),
    row("Unsure", "any", "same", [{ operation: "search", kind: "retry" }]),
  ],
} satisfies Fixture;
