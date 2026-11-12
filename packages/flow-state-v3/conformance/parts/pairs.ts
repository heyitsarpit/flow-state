import type { Code } from "./codes.ts";

/**
 * One generated run's reach: the codes each composite's steps exercised, and whether it was an
 * app mix (several composites in one runtime).
 */
export type RunReach = {
  readonly id: string;
  readonly mix: boolean;
  readonly byComposite: Readonly<Record<string, ReadonlySet<Code>>>;
};

/**
 * Who will reach an unreached pair: an open Task of a slice, the part, operation or pair sweep
 * that will reach it, and the date the owner was set.
 */
export type Owner = {
  readonly task: string;
  readonly slice: number;
  readonly by: string;
  readonly date: string;
};

/**
 * What the combination gate reads.
 *
 * **Details**
 *
 * - `declared`: the codes the runtime under test declares.
 * - `sliceOf`: the slice that builds each code; `current` is the slice being built.
 * - `tasks`: each Task's status and slice, read from the records.
 */
export type PairInput = {
  readonly declared: ReadonlyArray<Code>;
  readonly runs: ReadonlyArray<RunReach>;
  readonly owners: Readonly<Record<string, Owner>>;
  readonly tasks: Readonly<Record<string, { readonly open: boolean; readonly slice: number }>>;
  readonly sliceOf: Readonly<Record<Code, number>>;
  readonly current: number;
};

/**
 * The combination gate's verdict: its failures, the pairs reached and owed, and the triples and
 * their reach, which never fail it.
 */
export type PairVerdict = {
  readonly failures: ReadonlyArray<string>;
  readonly reached: number;
  readonly owed: number;
  readonly triples: { readonly total: number; readonly reached: number };
};

/**
 * The key of a pair in `owners`: its two codes in the closed list's order, joined by `+`.
 */
export const pairKey = (a: Code, b: Code) => `${a}+${b}`;

/**
 * The combination gate (Conformance R18).
 */
// RETURN_TYPE: the contract the requirement checks are written against (T47 step 1); the body comes in its step.
export const combinationGate = (_input: PairInput): PairVerdict => ({
  failures: [],
  reached: 0,
  owed: 0,
  triples: { total: 0, reached: 0 },
});
