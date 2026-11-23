import type { Compiled } from "../core/compiled.ts";
import { type ActorId, actorKey, type Wiring } from "../core/world.ts";
import type { Machine } from "../definition.ts";
import { type Code, flowError, raise } from "../error.ts";
import { actorIdOf, type ActorRef } from "./runtime.ts";
import { compiledOf } from "../compiled-of.ts";

// A context graph admission refuses: thrown before any work.
const refused = (code: Code, path: ReadonlyArray<string>, summary: string, help: string) =>
  flowError([{ code, path, summary, help }]);

/**
 * The context overrides a ref gives, its providers' refs' own included, by identity key, each
 * provider named by `identity`.
 */
// RETURN_TYPE: recursive: a provider ref's own overrides are read on the way up.
export const overridesBy = (
  ref: ActorRef,
  identity: (slot: string, provider: ActorRef) => ActorId,
): Wiring => {
  const entries = Object.entries(ref.context);
  const own = new Map(entries.map(([slot, p]) => [slot, identity(slot, p)] as const));

  const graph = new Map(entries.flatMap(([, p]) => [...overridesBy(p, identity)]));

  if (own.size > 0) graph.set(actorKey(actorIdOf(ref)), own);

  return graph;
};

/**
 * Context wiring at admission: the providers each identity of a consumer's graph binds to are its
 * machine entry's wiring with the overrides its refs gave, each slot wired to an actor of the
 * machine it declares, and no actor reached again on the way up.
 *
 * **Details**
 *
 * `overridesOf` names the overrides a ref gives, its providers' refs' own included, by identity,
 * refusing a ref of a machine the app does not run. `wiringOf` returns the whole graph's wiring;
 * it throws MissingContextProvider for a slot with no provider in the app, ForeignActorRef for a
 * provider ref of a machine the app does not run, InvalidConfiguration for a provider of another
 * machine, and ContextCycle for a provider graph that reaches an actor twice; `path` holds the
 * identities already on the way up.
 */
export const makeWiring = (
  machines: ReadonlyMap<string, Machine>,
  defaults: ReadonlyMap<string, Readonly<Record<string, ActorRef>>>,
) => {
  const missing = (consumer: string, slot: string) =>
    refused(
      "MissingContextProvider",
      [consumer, "context", slot],
      `no provider is wired for the context slot ${slot} of ${consumer}`,
      "Wire the slot in the machine's app entry, or in the ref's context.",
    );

  // The identity a provider ref names, once its machine is one this app runs.
  const providerOf = (consumer: string, slot: string, ref: ActorRef) => {
    if (!machines.has(compiledOf(ref.machine).id)) return raise(missing(consumer, slot));

    if (machines.get(compiledOf(ref.machine).id) !== ref.machine)
      return raise(
        refused(
          "ForeignActorRef",
          [consumer, "context", slot],
          `${slot} is wired to a ${compiledOf(ref.machine).id} that is not this Runtime's app's`,
          "Wire context to refs of the machines this Runtime's app lists.",
        ),
      );

    return actorIdOf(ref);
  };

  const overridesOf = (ref: ActorRef) =>
    overridesBy(ref, (slot, provider) => providerOf(compiledOf(ref.machine).id, slot, provider));

  // The provider one slot binds to: the ref's override, else the entry's default, of the machine
  // the slot declares; with the overrides the default's ref gives.
  const slotProvider = (compiled: Compiled, own: ReadonlyMap<string, ActorId>, slot: string) => {
    const declared = compiled.context.get(slot)?.provider;
    const ref = defaults.get(compiled.id)?.[slot];
    const given = own.get(slot);

    const provider = given ?? (ref === undefined ? undefined : providerOf(compiled.id, slot, ref));

    const providing = provider === undefined ? undefined : machines.get(provider.machine);

    if (provider === undefined || providing === undefined) return raise(missing(compiled.id, slot));

    if (provider.machine !== declared)
      return raise(
        refused(
          "InvalidConfiguration",
          [compiled.id, "context", slot],
          `${slot} is provided by ${declared}, not ${provider.machine}`,
          `Wire ${slot} to an actor of ${declared}.`,
        ),
      );

    const inherited = given === undefined && ref !== undefined ? overridesOf(ref) : new Map();

    return { provider, providing, inherited };
  };

  // RETURN_TYPE: recursive: each provider's own wiring is checked on the way up.
  const wiringOf = (actor: ActorId, overrides: Wiring, path: ReadonlyArray<string>): Wiring => {
    const machine = machines.get(actor.machine);
    const compiled = machine === undefined ? undefined : compiledOf(machine);

    if (compiled === undefined) return new Map();

    const own = overrides.get(actorKey(actor)) ?? new Map<string, ActorId>();
    const wiring = new Map<string, ActorId>();
    const graph = new Map<string, ReadonlyMap<string, ActorId>>();

    for (const slot of compiled.context.keys()) {
      const { provider, inherited } = slotProvider(compiled, own, slot);
      const key = actorKey(provider);

      if (path.includes(key))
        return raise(
          refused(
            "ContextCycle",
            [...path, key],
            `the context of ${compiled.id} reaches ${key} again`,
            "Make context flow one way: no actor may provide, directly or not, to its own provider.",
          ),
        );

      for (const [k, w] of wiringOf(provider, new Map([...inherited, ...overrides]), [
        ...path,
        key,
      ]))
        graph.set(k, w);
      wiring.set(slot, provider);
    }

    graph.set(actorKey(actor), wiring);

    return graph;
  };

  return { wiringOf, overridesOf, refused };
};
