import type { Option } from "effect";
import type { Code } from "./codes.ts";

/**
 * How a Plan feature is checked: in a composite part, a hand case, a static case, an example-app
 * check or a package check (Conformance R17).
 */
export type Kind = "part" | "hand" | "static" | "app" | "package";

/**
 * One row of the feature matrix: a Plan feature, its fixture kind, the codes or cases that reach
 * it, and the slice and Task that owe it while no runtime under test implements it.
 */
export type Feature = {
  readonly id: string;
  readonly kind: Kind;
  readonly codes: ReadonlyArray<Code>;
  readonly cases: ReadonlyArray<string>;
  readonly owed: Option.Option<{ readonly slice: number; readonly task: string }>;
};

/**
 * Every Plan feature's row.
 */
export const FEATURES: ReadonlyArray<Feature> = [];

/**
 * What the matrix gate reads.
 *
 * **Details**
 *
 * - `ids`: the Plan features' ids, read from their source table.
 * - `declared`: codes the runtimes under test declare; `reached`: codes the reach recorder saw.
 * - `claimed`: codes the parts' commands claim; `cases`: case ids that run on a runtime under test.
 */
export type MatrixInput = {
  readonly features: ReadonlyArray<Feature>;
  readonly ids: ReadonlyArray<string>;
  readonly declared: ReadonlyArray<Code>;
  readonly reached: ReadonlySet<Code>;
  readonly claimed: ReadonlyArray<Code>;
  readonly cases: ReadonlySet<string>;
  readonly tasks: Readonly<Record<string, { readonly open: boolean; readonly slice: number }>>;
};

/**
 * The matrix gate's failures (Conformance R17); none means it passes.
 */
// RETURN_TYPE: the contract the requirement checks are written against (T47 step 1); the body comes in its step.
export const matrixGate = (_input: MatrixInput): ReadonlyArray<string> => [];
