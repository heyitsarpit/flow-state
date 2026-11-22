import type { Bound } from "./contract.ts";
import type {
  ContextConfig,
  EventFields,
  MemoryConfig,
  ScheduleDecls,
  StateTree,
} from "./definition.ts";
import type { TreeNode } from "./construction.ts";
import { type Container, internalsOf } from "./made.ts";

/**
 * A definition's declaration: its states, events, memory, context slots, operations and
 * schedules, as `definition` was given them. With no arguments, their literal types erased, as
 * Flow keeps it.
 */
export type Declaration<
  States extends StateTree = StateTree,
  Ev extends Readonly<Record<string, EventFields>> = Readonly<Record<string, EventFields>>,
  In extends Readonly<Record<string, EventFields>> = Readonly<Record<string, EventFields>>,
  M extends MemoryConfig = MemoryConfig,
  O extends Readonly<Record<string, Bound>> = Readonly<Record<string, Bound>>,
  Cx extends ContextConfig = ContextConfig,
  Sch extends ScheduleDecls = ScheduleDecls,
> = {
  readonly states: States;
  readonly events: Ev;
  readonly internalEvents: In;
  readonly memory: M;
  readonly context: Cx;
  readonly operations: O;
  readonly schedules: Sch;
};

/**
 * What a definition keeps for `machine`, the compile and the Runtime under the internals key: its
 * declaration, its state tree in declaration order with its top-level paths, and the path of each
 * of its state and history tokens, by identity; all off its public face.
 */
export type DefinitionInternals = {
  readonly declaration: Declaration;
  readonly tree: { readonly nodes: ReadonlyArray<TreeNode>; readonly top: ReadonlyArray<string> };
  // FLOW_STATE_ALLOW_UNKNOWN: a value a body names, recognised by identity.
  readonly tokens: ReadonlyMap<unknown, string>;
  // FLOW_STATE_ALLOW_UNKNOWN: a value a body names, recognised by identity.
  readonly histories: ReadonlyMap<unknown, string>;
};

/**
 * What a definition Flow made keeps for its machines' compile: its declaration, tree and tokens.
 */
export const definitionInternalsOf = (definition: Container) =>
  internalsOf<DefinitionInternals>("definition", definition);

/**
 * The declaration of a definition Flow made: for code past the door that read it as a definition.
 */
export const declarationOf = (definition: Container) =>
  definitionInternalsOf(definition).declaration;
