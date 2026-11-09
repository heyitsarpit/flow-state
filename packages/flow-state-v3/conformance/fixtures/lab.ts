import { Schema } from "effect";
import type { Fixture } from "./fixture.ts";
import { classifyWith, type OperationReference } from "./reference.ts";

const Unkeyed = Schema.Struct({});

const labWrite = (
  concurrency: OperationReference["concurrency"],
  cancels: OperationReference["cancels"],
) =>
  ({
    key: Unkeyed,
    reference: {
      attempts: true,
      concurrency,
      success: "Ok",
      failure: { NotSent: "No" },
      unknown: "Unsure",
      classify: classifyWith(() => false),
      keyFields: [],
      cancels,
    },
  }) satisfies Fixture["operations"][string];

/**
 * `Lab/P1All` (`prototypes/conformance/typed/phase1h.ts`): one unkeyed `serialize` write, `put`,
 * mapped to `Ok`, `No` and `Unsure`; `All` runs its `cancelAll`.
 */
export const Serialize = {
  name: "serialize",
  machine: "Lab/P1All",
  events: { Go: Schema.Struct({ n: Schema.Number }), All: Schema.Struct({}) },
  memory: Schema.Struct({}),
  input: Schema.Struct({}),
  operations: { put: labWrite("serialize", { All: "cancelAll" }) },
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
  input: Schema.Struct({}),
  operations: { search: labWrite("latest", {}) },
} satisfies Fixture;

/**
 * `Lab/R15Switch` (`prototypes/conformance/typed/round15.ts`): one unkeyed `cancel` write,
 * `search`; its `Unsure` re-sends while `Retrying` was sent.
 */
export const Cancel = {
  name: "cancel",
  machine: "Lab/R15Switch",
  events: { Go: Schema.Struct({ q: Schema.String }), Retrying: Schema.Struct({}) },
  memory: Schema.Struct({ retrying: Schema.Boolean, oks: Schema.Number }),
  input: Schema.Struct({}),
  operations: { search: labWrite("cancel", {}) },
} satisfies Fixture;
