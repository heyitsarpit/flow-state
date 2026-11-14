import { Option } from "effect";
import type { Machine } from "../../src/index.ts";

/**
 * A machine's `Compiled`, as its public `Machine` type carries it.
 */
export type CompiledOf = Machine["compiled"];

/**
 * One level of handlers of a `Compiled`: the root's or a leaf's, by event.
 */
export type CompiledLevel = CompiledOf["root"];

/**
 * One handler alternative of a `Compiled`.
 */
export type CompiledAlternative = NonNullable<ReturnType<CompiledLevel["get"]>>[number];

/**
 * One operation of a `Compiled`: a write or a read.
 */
export type CompiledOperation = NonNullable<ReturnType<CompiledOf["operations"]["get"]>>;

/**
 * One write of a `Compiled`.
 */
export type CompiledWrite = Extract<CompiledOperation, { readonly _tag: "Write" }>;

/**
 * Memory or event values as a `Compiled`'s closures read them.
 */
export type Values = CompiledOf["initialMemory"];

const levelsOf = (compiled: CompiledOf) => [
  { leaf: Option.none<string>(), level: compiled.root },
  ...[...compiled.states].map(([leaf, node]) => ({ leaf: Option.some(leaf), level: node.on })),
];

/**
 * Every handler alternative of a `Compiled` with its leaf (`None` at the root), its event, its
 * position and its sibling list.
 */
export const alternativesOf = (compiled: CompiledOf) =>
  levelsOf(compiled).flatMap(({ leaf, level }) =>
    [...level].flatMap(([event, list]) =>
      list.map((alternative, position) => ({ leaf, event, alternative, position, list })),
    ),
  );

/**
 * Whether a guard reads a lane (`idle`, `retryable`), which the lane oracles judge.
 */
export const isLaneGuard = (guard: CompiledAlternative["guards"][number]) =>
  guard._tag === "Idle" || guard._tag === "Retryable";

/**
 * The states an alternative's state guards name.
 */
export const statesIn = (alternative: CompiledAlternative) =>
  alternative.guards.flatMap((g) => (g._tag === "InState" ? g.states : []));

/**
 * The writes of a `Compiled`.
 */
export const writesOf = (compiled: CompiledOf) =>
  [...compiled.operations.values()].flatMap((o) => (o._tag === "Write" ? [o] : []));
