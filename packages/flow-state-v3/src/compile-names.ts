import { Predicate } from "effect";
import type { TreeNode } from "./construction.ts";
import type { AnyDefinition } from "./definition.ts";
import { type Finding, invalid } from "./error.ts";

/**
 * A place in a machine body, as findings and slots name it.
 */
export type Path = ReadonlyArray<string | number>;

const joined = (slot: string, segment: string) => (slot === "" ? segment : `${slot}.${segment}`);

/**
 * A place's slot name, as Compiled names its closures: `states.ON.on.Flip[0].guard[1]`.
 */
export const slotOf = (at: Path) =>
  at.reduce<string>(
    (slot, segment) =>
      Predicate.isNumber(segment) ? `${slot}[${segment}]` : joined(slot, segment),
    "",
  );

/**
 * Everything one compile reads and collects: the definition's tokens by identity, the tree, and
 * the findings in walk order.
 */
export type Compile = {
  readonly definition: AnyDefinition;
  readonly owner: symbol;
  readonly nodes: ReadonlyMap<string, TreeNode>;
  // FLOW_STATE_ALLOW_UNKNOWN: an authored or compiled value, checked here before it is trusted.
  readonly tokens: ReadonlyMap<unknown, string>;
  // FLOW_STATE_ALLOW_UNKNOWN: an authored or compiled value, checked here before it is trusted.
  readonly histories: ReadonlyMap<unknown, string>;
  readonly events: ReadonlySet<string>;
  // FLOW_STATE_ALLOW_UNKNOWN: an authored or compiled value, checked here before it is trusted.
  readonly sends: ReadonlySet<unknown>;
  readonly findings: Array<Finding>;
  readonly scheduleNames: Map<string, string>;
};

/**
 * A finding for a token of another definition.
 */
export const foreign = (at: Path, what: string) =>
  invalid(
    at,
    "ForeignToken",
    `${what} is not this definition's`,
    "Use the tokens the machine body receives: S, E and O of this definition.",
  );
