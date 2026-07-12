import { Cause, Effect, Exit, Fiber } from "effect";

export type OwnedEffectHandle = ((interruptor?: number) => void) & {
  readonly awaitExit: Effect.Effect<void, unknown>;
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
    // Actor shutdown treats plain interruption as expected disposal, but any
    // cleanup failure that survives interruption still belongs in the final Cause.
    value: Fiber.await(fiber).pipe(
      Effect.flatMap((exit) =>
        Exit.isSuccess(exit) || Cause.hasInterruptsOnly(exit.cause)
          ? Effect.void
          : Effect.failCause(exit.cause),
      ),
    ),
    writable: false,
  });
  return interrupt;
}
