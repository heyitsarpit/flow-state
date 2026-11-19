import { Cause, Effect, Exit, Fiber, Option } from "effect";
import { endedBy, Verdict } from "../core/life.ts";
import { Input } from "../core/step.ts";
import { flowError, flowErrorOf, lifeRejection } from "../error.ts";
import type { Driver } from "./driver.ts";

// A host Effect's whole Cause, as the FlowError runPromise rejects with.
// FLOW_STATE_ALLOW_UNKNOWN: a host Effect fails with its own error.
const runFailed = (cause: Cause.Cause<unknown>) =>
  flowErrorOf(
    [
      {
        code: "RunFailed",
        path: ["runPromise"],
        summary: "the Effect runPromise ran did not succeed",
        help: "Read the cause on this error: the Effect failed, died or was interrupted.",
      },
    ],
    cause,
  );

/**
 * A Runtime's `runPromise` over the app's services `R`, as the Runtime type states it: admitted as
 * the life's call row, then forked in the Runtime's Scope. The signal interrupts the caller's wait,
 * which interrupts the Effect and awaits its end, as `Effect.runPromise` does.
 */
export const makeRunPromise = <R>(driver: Driver) => {
  // Host Effects are numbered by the Runtime that runs them, each its own fiber key.
  let runs = 0;

  const admitted = <A, E>(effect: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const verdict = driver.verdict(Input.Run());

      if (Verdict.$is("Reject")(verdict))
        return yield* Effect.fail(
          flowError([
            lifeRejection(
              verdict.code,
              "runPromise",
              "runPromise",
              "ready()",
              endedBy(driver.world().life),
            ),
          ]),
        );

      runs += 1;

      // SAFETY: the boot provides every service the app's contracts list, which is `R`.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the app's services are erased in the Runtime and provided by its fibers
      const provided = effect as Effect.Effect<A, E>;
      const fiber = driver.fibers.fork(`run/${String(runs)}`, provided, () => undefined);

      const exit = yield* Fiber.await(fiber).pipe(Effect.onInterrupt(() => Fiber.interrupt(fiber)));

      return yield* Exit.isSuccess(exit)
        ? Effect.succeed(exit.value)
        : Effect.fail(runFailed(exit.cause));
    });

  return <A, E>(
    effect: Effect.Effect<A, E, R>,
    // oxlint-disable-next-line lint-bomb/no-optional-domain-properties -- the Plan's public option, as Effect.runPromise takes it: an omitted signal never aborts
    options: { readonly signal?: AbortSignal } = {},
  ) =>
    // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- runPromise is the Runtime's public Promise boundary
    Effect.runPromiseExit(admitted(effect), options).then((exit) =>
      Exit.isSuccess(exit)
        ? exit.value
        : // oxlint-disable-next-line lint-bomb/no-unwrapped-promise-in-effect-core -- the public Promise rejects with the FlowError the Effect failed with
          Promise.reject(
            Option.getOrElse(Cause.findErrorOption(exit.cause), () => runFailed(exit.cause)),
          ),
    );
};
