import type { Scenario } from "../dsl/case.ts";

/**
 * The scenarios added after the hand cases froze (2026-11-11) that cite no ruling (Conformance
 * R15, I50).
 */
// RETURN_TYPE: the contract the requirement checks are written against (T47 step 1); the body comes in its step.
export const uncitedNew = (_scenarios: ReadonlyArray<Scenario>): ReadonlyArray<string> => [];
