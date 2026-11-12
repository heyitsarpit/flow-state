import type { Part } from "../../fixtures/part.ts";
import type { Script } from "../dsl/script.ts";
import type { Code } from "./codes.ts";

/**
 * A suite-wide profile: the usual healthy run, the stress run with faults, or the app mix.
 */
export type Profile = "usual" | "stress";

/**
 * The seeds builders run; the held-out seeds are run only by the guard (advisor Q8).
 */
export const BUILD_SEEDS: ReadonlyArray<number> = [];

/**
 * Seeds no builder tunes against.
 */
export const HELD_OUT_SEEDS: ReadonlyArray<number> = [];

/**
 * The script of one part under a profile and a seed, drawn only from actions whose codes the
 * runtime declares (Conformance R15, R16).
 */
// RETURN_TYPE: the contract the requirement checks are written against (T47 step 1); the body comes in its step.
export const scriptOf = (
  _part: Part,
  _profile: Profile,
  _seed: number,
  _declared: ReadonlyArray<Code>,
): Script => ({ id: "", fixture: "", actor: "", steps: [] });

/**
 * The app mix: several parts' actors in one runtime and one world, under one seed.
 */
// RETURN_TYPE: the contract the requirement checks are written against (T47 step 1); the body comes in its step.
export const mixOf = (
  _parts: ReadonlyArray<Part>,
  _profile: Profile,
  _seed: number,
  _declared: ReadonlyArray<Code>,
): Script => ({ id: "", fixture: "", actor: "", steps: [] });
