import { Cause, Effect, Exit, Option } from "effect";
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
 * the life's call row, then run in an Owner of its own inside the Runtime's work. The signal closes
 * that Owner, which interrupts the Effect and awaits it; the wait itself is never interrupted, so
 * the rejection keeps the whole Cause, a failed cleanup included.
 */
export const makeRunPromise = <R>(driver: Driver) => {
  // Each call's Owner is numbered in the order calls are admitted.
  let runs = 0;

  const admitted = <A, E>(effect: Effect.Effect<A, E, R>, signal: Option.Option<AbortSignal>) =>
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

      // SAFETY: the boot provides every service the app's contracts list, which is `R`.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the app's services are erased in the Runtime and provided by its Owners
      const provided = effect as Effect.Effect<A, E>;
      const call = driver.work.child(`run ${runs}`);
      runs += 1;

      // The one who ends this call hears its cleanup's failure; the whole Exit already keeps it.
      const end = () => call.stop(() => undefined);

      const exit = yield* Effect.callback<Exit.Exit<A, E>>((resume) => {
        // A signal aborted already ends the call before its Effect starts.
        for (const s of Option.toArray(signal))
          if (s.aborted) end();
          else s.addEventListener("abort", end, { once: true });

        call.forkWhole("run", provided, (whole) => {
          for (const s of Option.toArray(signal)) s.removeEventListener("abort", end);
          resume(Effect.succeed(whole));
          end();
        });
      });

      return yield* Exit.isSuccess(exit)
        ? Effect.succeed(exit.value)
        : Effect.fail(runFailed(exit.cause));
    });

  return <A, E>(
    effect: Effect.Effect<A, E, R>,
    // oxlint-disable-next-line lint-bomb/no-optional-domain-properties -- the Plan's public option, as Effect.runPromise takes it: an omitted signal never aborts
    options: { readonly signal?: AbortSignal } = {},
  ) =>
    // The admitted Effect fails only with a FlowError, which the Promise rejects with.
    // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain, flow-state/owners-only -- runPromise is the Runtime's public Promise boundary; the Effect itself runs in its run Owner
    Effect.runPromise(admitted(effect, Option.fromUndefinedOr(options.signal)));
};
