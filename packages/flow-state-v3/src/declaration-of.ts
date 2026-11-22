import type { Bound } from "./contract.ts";
import type {
  ContextConfig,
  EventFields,
  MemoryConfig,
  ScheduleDecls,
  StateTree,
} from "./definition.ts";
import { type Container, internalsOf } from "./made.ts";

/**
 * A definition's declaration as Flow keeps it, its literal types erased: its states, events,
 * memory, context slots, operations and schedules, as `definition` was given them.
 */
export type Declaration = {
  readonly states: StateTree;
  readonly events: Readonly<Record<string, EventFields>>;
  readonly internalEvents: Readonly<Record<string, EventFields>>;
  readonly memory: MemoryConfig;
  readonly context: ContextConfig;
  readonly operations: Readonly<Record<string, Bound>>;
  readonly schedules: ScheduleDecls;
};

/**
 * What a definition keeps for `machine`, the compile and the Runtime under the internals key: its
 * declaration, off its public face.
 */
export type DefinitionInternals = { readonly declaration: Declaration };

/**
 * The declaration of a definition Flow made: for code past the door that read it as a definition.
 */
export const declarationOf = (definition: Container) =>
  internalsOf<DefinitionInternals>("definition", definition).declaration;
