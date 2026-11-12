import type { Script } from "../conformance/dsl/script.ts";
import type { Fingerprint } from "../conformance/parts/fingerprint.ts";

/**
 * One bench replay: the work it did and each turn's cost in milliseconds.
 */
export type Benched = { readonly fingerprint: Fingerprint; readonly turnMs: ReadonlyArray<number> };

/**
 * How a bench boots: with the store as a real page has it, or with persistence off, the planted
 * bench the fingerprint check must refuse.
 */
export type BenchOptions = { readonly persistence: boolean };

/**
 * Replays a script on production with no oracles and no Observation decoding (Conformance R23).
 */
// RETURN_TYPE: the contract the requirement checks are written against (T47 step 1); the body comes in its step.
export const benchReplay = (
  _script: Script,
  _options: BenchOptions = { persistence: true },
): Benched => ({
  fingerprint: { turns: 0, publications: 0, commits: {}, requests: {}, batches: 0, bytes: 0 },
  turnMs: [],
});
