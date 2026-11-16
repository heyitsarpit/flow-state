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
 * ForeignActorRef for a provider ref of a machine the app does not run, InvalidConfiguration for a
 * provider of another machine, and ContextCycle for a provider graph that reaches an actor twice;
 * `path` holds the identities already on the way up. `overrideOf` names a ref's own context
 * overrides by identity, refusing a ref of a machine the app does not run.
 */
export const makeWiring = (
  machines: ReadonlyMap<string, Machine>,
  defaults: ReadonlyMap<string, Readonly<Record<string, ActorRef>>>,
) => {
  const missing = (compiled: Compiled, slot: string) =>
    refused(
      "MissingContextProvider",
      [compiled.id, "context", slot],
      `no provider is wired for the context slot ${slot} of ${compiled.id}`,
      "Wire the slot in the machine's app entry, or in the ref's context.",
    );

  // The identity a provider ref names, once its machine is one this app runs.
  const providerOf = (compiled: Compiled, slot: string, ref: ActorRef) => {
    if (!machines.has(ref.machine.compiled.id))
      // oxlint-disable-next-line lint-bomb/no-throw-in-core -- admission's contract: a context graph it refuses throws before any work
      throw missing(compiled, slot);

    if (machines.get(ref.machine.compiled.id) !== ref.machine)
      // oxlint-disable-next-line lint-bomb/no-throw-in-core -- admission's contract: a provider ref of another app throws before any work
      throw refused(
        "ForeignActorRef",
        [compiled.id, "context", slot],
        `${slot} is wired to a ${ref.machine.compiled.id} that is not this Runtime's app's`,
        "Wire context to refs of the machines this Runtime's app lists.",
      );

    return actorIdOf(ref);
  };

  const overrideOf = (compiled: Compiled, override: Readonly<Record<string, ActorRef>>) =>
    new Map(Object.entries(override).map(([slot, ref]) => [slot, providerOf(compiled, slot, ref)]));

  // The provider one slot binds to: the ref's override, else the entry's default, of the machine
  // the slot declares.
  const slotProvider = (
    compiled: Compiled,
    override: ReadonlyMap<string, ActorId>,
    slot: string,
    declared: string,
  ) => {
    const ref = defaults.get(compiled.id)?.[slot];

    const provider =
      override.get(slot) ?? (ref === undefined ? undefined : providerOf(compiled, slot, ref));

    const providing = provider === undefined ? undefined : machines.get(provider.machine);

    if (provider === undefined || providing === undefined)
      // oxlint-disable-next-line lint-bomb/no-throw-in-core -- admission's contract: a context graph it refuses throws before any work
      throw missing(compiled, slot);

    if (provider.machine !== declared)
      // oxlint-disable-next-line lint-bomb/no-throw-in-core -- admission's contract: a context graph it refuses throws before any work
      throw refused(
        "InvalidConfiguration",
        [compiled.id, "context", slot],
        `${slot} is provided by ${declared}, not ${provider.machine}`,
        `Wire ${slot} to an actor of ${declared}.`,
      );

    return { provider, providing };
  };

  // RETURN_TYPE: recursive: each provider's own wiring is checked on the way up.
  const wiringOf = (
    compiled: Compiled,
    override: ReadonlyMap<string, ActorId>,
    path: ReadonlyArray<string>,
  ): ReadonlyMap<string, ActorId> => {
    const wiring = new Map<string, ActorId>();

    for (const [slot, declared] of compiled.context) {
      const { provider, providing } = slotProvider(compiled, override, slot, declared.provider);
      const key = actorKey(provider);

      if (path.includes(key))
        // oxlint-disable-next-line lint-bomb/no-throw-in-core -- admission's contract: a context graph it refuses throws before any work
        throw refused(
          "ContextCycle",
          [...path, key],
          `the context of ${compiled.id} reaches ${key} again`,
          "Make context flow one way: no actor may provide, directly or not, to its own provider.",
        );

      wiringOf(providing.compiled, new Map(), [...path, key]);
      wiring.set(slot, provider);
    }

    return wiring;
  };

  return { wiringOf, overrideOf, refused };
};
