import { Effect, type Layer } from "effect";

import type { FlowRuntime } from "../core/api/types.js";
import { createRuntime, type RuntimeReadyLayer } from "./contract-runtime.js";

export async function withRequestRuntime<AppLayer extends Layer.Any, Result>(
  layer: RuntimeReadyLayer<AppLayer>,
  handler: (
    runtime: FlowRuntime<Layer.Success<AppLayer>, Layer.Error<AppLayer>>,
  ) => Result | Promise<Result>,
): Promise<Result> {
  const runtime = createRuntime(layer);
  let requestOutcome:
    | Readonly<{ readonly success: true; readonly value: Result }>
    | Readonly<{ readonly success: false; readonly error: unknown }>;

  try {
    // Acquire the host-supplied Layer before exposing the runtime so partial
    // acquisition rolls back inside this request's own ManagedRuntime Scope.
    await runtime.runPromise(Effect.void);
    requestOutcome = { success: true, value: await handler(runtime) };
  } catch (error) {
    requestOutcome = { success: false, error };
  }

  let disposeOutcome:
    | Readonly<{ readonly success: true }>
    | Readonly<{ readonly success: false; readonly error: unknown }>;
  try {
    await runtime.dispose();
    disposeOutcome = { success: true };
  } catch (error) {
    disposeOutcome = { success: false, error };
  }

  if (!requestOutcome.success && !disposeOutcome.success) {
    if (Object.is(requestOutcome.error, disposeOutcome.error)) {
      throw requestOutcome.error;
    }
    throw new AggregateError(
      [requestOutcome.error, disposeOutcome.error],
      "Flow request and runtime finalization both failed",
      { cause: requestOutcome.error },
    );
  }
  if (!requestOutcome.success) {
    throw requestOutcome.error;
  }
  if (!disposeOutcome.success) {
    throw disposeOutcome.error;
  }

  return requestOutcome.value;
}
