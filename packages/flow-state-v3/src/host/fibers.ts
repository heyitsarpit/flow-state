import { Context, Effect, type Exit, FiberMap, Option, Scheduler, Scope } from "effect";

/**
 * The Runtime's keyed fibers (calls, timers, persistence wakes), all owned by its one Scope.
 *
 * **Details**
 *
 * Forking under a live key interrupts that key's fiber; closing the Scope interrupts every fiber.
 * Each fiber runs with the Runtime's services and platform, so a call, a timer's sleep and a
 * commit's own deadline share one Clock and Scheduler.
 */
export const makeFibers = (scope: Scope.Scope, context: () => Context.Context<never>) => {
  // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- construct() is synchronous; the host builds its fiber registry once, in the Runtime's Scope
  const map = Effect.runSync(FiberMap.make<string>().pipe(Scope.provide(scope)));

  return {
    fork: <A, E>(
      key: string,
      effect: Effect.Effect<A, E>,
      onExit: (exit: Exit.Exit<A, E>) => void,
    ) => {
      const services = context();

      // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- the host boundary runs the core's work as fibers
      const fiber = Effect.runForkWith(services)(effect, {
        scheduler: Context.get(services, Scheduler.Scheduler),
      });

      FiberMap.setUnsafe(map, key, fiber);
      fiber.addObserver(onExit);
    },
    cancel: (key: string) =>
      Option.match(FiberMap.getUnsafe(map, key), {
        onNone: () => undefined,
        // oxlint-disable-next-line lint-bomb/no-unsafe-fiber-methods -- a cancel interrupts at once; the fiber's exit settles it
        onSome: (fiber) => fiber.interruptUnsafe(),
      }),
  };
};

/**
 * A Runtime's fiber registry.
 */
export type Fibers = ReturnType<typeof makeFibers>;
