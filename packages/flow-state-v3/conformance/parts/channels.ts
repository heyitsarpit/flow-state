import type { Code } from "./codes.ts";

/**
 * Two codes, in the closed list's order.
 */
export type Pair = readonly [Code, Code];

/**
 * A pair that does not interact, with the rule that says so.
 */
export type Quiet = { readonly pair: Pair; readonly rule: string };

/**
 * Whether two codes interact by the channel table's rule (Conformance R18).
 */
// RETURN_TYPE: the contract the requirement checks are written against (T47 step 1); the body comes in its step.
export const interacts = (_a: Code, _b: Code): boolean => false;

/**
 * The interacting pairs among `codes`, generated from the channel table.
 */
// RETURN_TYPE: the contract the requirement checks are written against (T47 step 1); the body comes in its step.
export const interactingPairs = (_codes: ReadonlyArray<Code>): ReadonlyArray<Pair> => [];

/**
 * The pairs among `codes` that do not interact, each with its rule: the list the user approves.
 */
// RETURN_TYPE: the contract the requirement checks are written against (T47 step 1); the body comes in its step.
export const quietPairs = (_codes: ReadonlyArray<Code>): ReadonlyArray<Quiet> => [];

/**
 * The shared-resource codes: a pair across two composites of the app mix counts only with one.
 */
export const SHARED: ReadonlyArray<Code> = [];
