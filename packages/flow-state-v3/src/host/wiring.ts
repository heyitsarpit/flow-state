import type { Compiled } from "../core/compiled.ts";
import { type ActorId, actorKey } from "../core/world.ts";
import type { Machine } from "../definition.ts";
import { type Code, flowError } from "../error.ts";
import { actorIdOf, type ActorRef } from "./runtime.ts";

// A context graph admission refuses: thrown before any work.
const refused = (code: Code, path: ReadonlyArray<string>, summary: string, help: string) =>
  flowError([{ code, path, summary, help }]);

/**
 * Context wiring at admission: the providers a consumer's slots bind to are its machine entry's
 * wiring with the ref's overrides, each slot wired to an actor of the machine it declares, and no
 * actor reached again on the way up.
 *
 * **Details**
 *
 * `wiringOf` throws MissingContextProvider for a slot with no provider in the app,
 * InvalidConfiguration for a provider of another machine, and ContextCycle for a provider graph
 * that reaches an actor twice; `path` holds the identities already on the way up.
 */
export const makeWiring = (
  machines: ReadonlyMap<string, Machine>,
  defaults: ReadonlyMap<string, Readonly<Record<string, ActorRef>>>,
) => {
  // RETURN_TYPE: recursive: each provider's own wiring is checked on the way up.
  const wiringOf = (
    compiled: Compiled,
    override: Readonly<Record<string, ActorRef>>,
    path: ReadonlyArray<string>,
  ): ReadonlyMap<string, ActorId> => {
    const refs = { ...defaults.get(compiled.id), ...override };
    const wiring = new Map<string, ActorId>();

    for (const [slot, declared] of compiled.context) {
      const ref = refs[slot];

      if (ref === undefined || !machines.has(ref.machine.compiled.id))
        // oxlint-disable-next-line lint-bomb/no-throw-in-core -- admission's contract: a context graph it refuses throws before any work
        throw refused(
          "MissingContextProvider",
          [compiled.id, "context", slot],
          `no provider is wired for the context slot ${slot} of ${compiled.id}`,
          "Wire the slot in the machine's app entry, or in the ref's context.",
        );

      if (machines.get(ref.machine.compiled.id) !== ref.machine)
        // oxlint-disable-next-line lint-bomb/no-throw-in-core -- admission's contract: a provider ref of another app throws before any work
        throw refused(
          "ForeignActorRef",
          [compiled.id, "context", slot],
          `${slot} is wired to a ${ref.machine.compiled.id} that is not this Runtime's app's`,
          "Wire context to refs of the machines this Runtime's app lists.",
        );

      if (ref.machine.compiled.id !== declared.provider)
        // oxlint-disable-next-line lint-bomb/no-throw-in-core -- admission's contract: a context graph it refuses throws before any work
        throw refused(
          "InvalidConfiguration",
          [compiled.id, "context", slot],
          `${slot} is provided by ${declared.provider}, not ${ref.machine.compiled.id}`,
          `Wire ${slot} to an actor of ${declared.provider}.`,
        );

      const provider = actorIdOf(ref);
      const key = actorKey(provider);

      if (path.includes(key))
        // oxlint-disable-next-line lint-bomb/no-throw-in-core -- admission's contract: a context graph it refuses throws before any work
        throw refused(
          "ContextCycle",
          [...path, key],
          `the context of ${compiled.id} reaches ${key} again`,
          "Make context flow one way: no actor may provide, directly or not, to its own provider.",
        );

      wiringOf(ref.machine.compiled, {}, [...path, key]);
      wiring.set(slot, provider);
    }

    return wiring;
  };

  return { wiringOf, refused };
};
