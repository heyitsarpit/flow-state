import type { Machine } from "../../src/index.ts";
import type { Part } from "../../fixtures/part.ts";
import type { Fixture } from "../fixtures/fixture.ts";

/**
 * A machine's `Compiled`, as its public `Machine` type carries it.
 */
export type CompiledOf = Machine["compiled"];

/**
 * The reference a machine's `Compiled` gives, with no hand-written row (Conformance R15, I46).
 */
export type Derived = Omit<Fixture, "name">;

/**
 * Derives a fixture's reference from `compiled`: events, states, handlers, schedules, rows, and
 * each operation's concurrency, key fields and endings.
 */
// RETURN_TYPE: the contract the requirement checks are written against (T47 step 1); the body comes in its step.
export const referenceOf = (_compiled: CompiledOf): Partial<Derived> => ({});

/**
 * The fixture of a part: its derived reference with the part's `classify` on each operation.
 */
// RETURN_TYPE: the contract the requirement checks are written against (T47 step 1); the body comes in its step.
export const partFixture = (_part: Part): Partial<Fixture> => ({});
