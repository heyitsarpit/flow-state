import type { Played } from "./play.ts";

/**
 * The work a replay did (Conformance R23): turns, publications, commits invoked and requests by
 * operation, batches landed and bytes written.
 */
export type Fingerprint = {
  readonly turns: number;
  readonly publications: number;
  readonly commits: Readonly<Record<string, number>>;
  readonly requests: Readonly<Record<string, number>>;
  readonly batches: number;
  readonly bytes: number;
};

/**
 * The fingerprint of a conformance replay, from the facts it recorded.
 */
// RETURN_TYPE: the contract the requirement checks are written against (T47 step 1); the body comes in its step.
export const fingerprintOf = (_played: Played): Fingerprint => ({
  turns: 0,
  publications: 0,
  commits: {},
  requests: {},
  batches: 0,
  bytes: 0,
});
