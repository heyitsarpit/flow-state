import { Schema } from "effect";
import { Empty, type Fixture, writeOf } from "./fixture.ts";
import { to } from "./handlers.ts";
import { classifyWith, row } from "./reference.ts";

const ByK = Schema.Struct({ k: Schema.String });

const keyedWrite = writeOf(ByK, {
  concurrency: "serialize",
  releasesOnLeave: [],
  success: "Ok",
  failure: { NotSent: "No" },
  unknown: { event: "Unsure" },
  classify: classifyWith(() => false),
});

const handlers = {
  initial: "A",
  root: {
    Go: [to("W")],
    Ok: [to("stay")],
    No: [to("W")],
    Unsure: [to("W")],
  },
  states: {},
  schedules: {},
  parts: {},
} as const;

/**
 * `Lab/R15Keyed` (`prototypes/conformance/typed/round15b.ts`): one `serialize` write keyed by `k`,
 * `keyed`; `Go` commits its key's lane, and `Ok` runs a key-less `cancel`, which names only the
 * ending's own Attempt (WriteLanes R9).
 */
export const Keyed = {
  name: "keyed",
  machine: "Lab/R15Keyed",
  events: { Go: ByK },
  memory: Schema.Struct({}),
  input: Empty,
  states: ["A", "W"] as const,
  operations: { keyed: keyedWrite },
  rows: [
    row("Go", "any", "W", [{ operation: "keyed", kind: "commit" }]),
    row("Ok", "any", "same", [{ operation: "keyed", kind: "cancel", keyed: false }]),
  ],
  handlers,
} satisfies Fixture;

/**
 * `Lab/R15Held` (`prototypes/conformance/typed/round15b.ts`): one `serialize` write keyed by `k`,
 * `holding`; `GoBad` commits an input the fixture's own code gives a bigint, which cannot encode
 * (WriteLanes R12), and `No` runs a key-less `cancel`.
 */
export const Held = {
  name: "held",
  machine: "Lab/R15Held",
  events: { Go: ByK, GoBad: ByK },
  memory: Schema.Struct({}),
  input: Empty,
  states: ["A", "W"] as const,
  operations: { holding: keyedWrite },
  rows: [
    row("Go", "any", "W", [{ operation: "holding", kind: "commit" }]),
    row("GoBad", "any", "same", [{ operation: "holding", kind: "commit" }]),
    row("No", "any", "same", [{ operation: "holding", kind: "cancel", keyed: false }]),
  ],
  handlers: {
    ...handlers,
    root: {
      Go: [to("W")],
      GoBad: [to("stay")],
      Ok: [to("A")],
      No: [to("stay")],
      Unsure: [to("W")],
    },
  },
} satisfies Fixture;
