import { Option, Result } from "effect";
import { inputFieldsOf, LOCAL_PREFIX, refName } from "../core/identity.ts";
import type { ActorId } from "../core/world.ts";
import type { ActorRef, AnyDefinition, InputOf, Machine } from "../definition.ts";
import type { ContextRefs } from "./context-refs.ts";
import { entry } from "../entry.ts";
import { flowError, raise, refuse } from "../error.ts";
import { type KindOf, made, madeOf } from "../made.ts";
import { compiledOf } from "../compiled-of.ts";

export type { ActorRef } from "../definition.ts";

/**
 * What names an actor of `D`: a value carrying its input fields when it has any, otherwise a
 * literal string that does not start with `~`.
 */
export type RefName<D extends AnyDefinition, N> = [keyof InputOf<D["memory"]>] extends [never]
  ? N extends string
    ? string extends N
      ? never
      : N extends `${typeof LOCAL_PREFIX}${string}`
        ? never
        : N
    : never
  : InputOf<D["memory"]>;

/**
 * Names a shared actor. Inert.
 *
 * **When to use**
 *
 * `actorRef(machine, value)` names a machine with `Flow.input` fields by those fields of `value`;
 * `actorRef(machine, "name")` names a machine with no input by a literal name.
 *
 * **Details**
 *
 * An actor is its machine plus its input: the input fields are encoded with their Schemas, in
 * field-name order, so a reorder or a field beyond the input names the same actor. The value is
 * checked where the ref is used: an ensure, send or dispose throws SchemaValidation naming a
 * field its Schema refuses.
 */
export const actorRef = entry(
  "actorRef",
  // RETURN_TYPE: the ActorRef keeps its machine's definition type.
  <D extends AnyDefinition, const N>(
    machine: Machine<D>,
    nameOrValue: N & RefName<D, N>,
    // oxlint-disable-next-line lint-bomb/no-optional-domain-properties, lint-bomb/no-nullish-function-contracts -- the Plan's public word: a ref with no context uses its machine entry's wiring
    options?: { readonly context: ContextRefs<D["context"]> },
  ): ActorRef<D> =>
    refOf(
      machine,
      nameOrValue,
      // An untyped caller's options may lack `context`: such a ref uses its entry's wiring too.
      options?.context === undefined ? {} : slotRefs(options.context),
    ),
);

// The owner of every ref: a ref names its actor by its machine and value, never by owner.
const REFS = Symbol("flow-state/ref");

/**
 * A ref as `actorRef` makes it: its machine, its value and its context refs by slot.
 */
// RETURN_TYPE: the ActorRef keeps its machine's definition type.
export const refOf = <D extends AnyDefinition>(
  machine: Machine<D>,
  // FLOW_STATE_ALLOW_UNKNOWN: a ref's value is the caller's, checked where the ref is used.
  value: unknown,
  context: Readonly<Record<string, ActorRef>>,
): ActorRef<D> => {
  const face: Omit<ActorRef<D>, typeof KindOf> = { machine, value, context: { ...context } };

  // SAFETY: the face is every field of the ref but its kind, a phantom key the brand carries.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the kind brand is a phantom key no value holds
  return made("ref", REFS, face, {}) as ActorRef<D>;
};

// A ref's context refs as the runtime reads them: a ref by slot name. The typed form checks each
// ref's provider.
const slotRefs = <Cx>(refs: ContextRefs<Cx>) =>
  // SAFETY: ContextRefs<Cx> is a record of refs keyed by slot name, so it is the wide record.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a mapped type over a generic key set does not assign to its record (a TypeScript limit)
  refs as Readonly<Record<string, ActorRef>>;

/**
 * The identity a ref names, checked: a value's input fields by their Schemas, a literal name by
 * its form. Throws the FlowError a refused ref names.
 */
// RETURN_TYPE: the core's ActorId, which every input that names an actor takes.
export const actorIdOf = (ref: ActorRef): ActorId => {
  refuse(Result.match(madeOf("ref")(ref, ["ref"]), { onFailure: (f) => [f], onSuccess: () => [] }));

  const compiled = compiledOf(ref.machine);

  return Result.match(refName(compiled, ref.value), {
    onSuccess: (name) => ({ machine: compiled.id, name }),
    onFailure: (field) =>
      raise(
        flowError([
          inputFieldsOf(compiled).length === 0
            ? {
                code: "InvalidConfiguration" as const,
                path: [compiled.id, "name"],
                summary: `${compiled.id} has no input, so it is named by a literal string not starting with ${LOCAL_PREFIX}`,
                help: "Name the actor with a literal string, or give the machine Flow.input fields.",
              }
            : Option.match(field, {
                onSome: (name) => ({
                  code: "SchemaValidation" as const,
                  path: [compiled.id, name],
                  summary: `the input field ${name} of ${compiled.id} is missing or refused by its Schema`,
                  help: `Give ${name} a value its Schema accepts.`,
                }),
                onNone: () => ({
                  code: "SchemaValidation" as const,
                  path: [compiled.id],
                  summary: `the input of ${compiled.id} has no encoded form, so it cannot name an actor`,
                  help: "Name the actor by values JSON can hold: no non-finite number, lone surrogate or cycle.",
                }),
              }),
        ]),
      ),
  });
};
