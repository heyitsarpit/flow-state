import { Effect, type Exit, Fiber } from "effect";

export type OwnedEffectHandle = ((interruptor?: number) => void) & {
  readonly awaitExit: Effect.Effect<void>;
};

export type OwnedEffectRunner = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  onExit?: (exit: Exit.Exit<A, E>) => void,
) => OwnedEffectHandle;

export function ownedEffectHandleFromFiber<A, E>(
  fiber: Fiber.Fiber<A, E>,
  onExit?: (exit: Exit.Exit<A, E>) => void,
): OwnedEffectHandle {
  if (onExit !== undefined) {
    fiber.addObserver(onExit);
  }
  const interrupt = ((interruptor?: number) => {
    fiber.interruptUnsafe(interruptor);
  }) as OwnedEffectHandle;
  Object.defineProperty(interrupt, "awaitExit", {
    configurable: false,
    enumerable: false,
    value: Effect.asVoid(Fiber.await(fiber)),
    writable: false,
  });
  return interrupt;
}
