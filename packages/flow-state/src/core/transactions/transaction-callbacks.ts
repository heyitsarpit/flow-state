import type { Effect } from "effect";

import { transactionCallbackThrewDiagnostic } from "../../shared/diagnostics.js";
import type {
  FlowEvent,
  FlowInvalidationTarget,
  FlowMachineRoutedBinding,
  FlowPreviewPatch,
  FlowTransactionBinding,
  FlowTransactionCallbackDefinition,
  FlowRuntimeTransactionDefinition,
} from "../api/types.js";
import { flowTransactionRuntime } from "../api/types.js";

export function runtimeTransactionDefinition<Event extends FlowEvent>(
  binding: Omit<FlowTransactionBinding<FlowEvent>, keyof FlowMachineRoutedBinding<FlowEvent>>,
): FlowRuntimeTransactionDefinition<Event> {
  return binding[flowTransactionRuntime] as FlowRuntimeTransactionDefinition<Event>;
}

function runTransactionCallback<
  Id extends string,
  Params,
  Value,
  Error,
  Requirements,
  Event extends FlowEvent,
  Result,
>(
  definition: FlowTransactionCallbackDefinition<Id, Params, Value, Error, Requirements, Event>,
  callback: "params" | "preview.apply" | "invalidates" | "commit",
  run: () => Result,
): Result {
  try {
    return run();
  } catch (cause) {
    throw transactionCallbackThrewDiagnostic({
      transactionId: definition.id,
      callback,
      cause,
    });
  }
}

export function resolveTransactionParams<
  Id extends string,
  Params,
  Value,
  Error,
  Requirements,
  Event extends FlowEvent,
>(
  definition: FlowTransactionCallbackDefinition<Id, Params, Value, Error, Requirements, Event>,
  args: Record<string, unknown>,
): Params | null | undefined {
  return runTransactionCallback(definition, "params", () => definition.config.params?.(args));
}

export function resolveRequiredTransactionParams<
  Id extends string,
  Params,
  Value,
  Error,
  Requirements,
  Event extends FlowEvent,
>(
  definition: FlowTransactionCallbackDefinition<Id, Params, Value, Error, Requirements, Event> &
    Readonly<{
      readonly config: Readonly<{
        readonly params: (args: Readonly<Record<string, unknown>>) => Params | null;
      }>;
    }>,
  args: Readonly<Record<string, unknown>>,
): Params | null {
  return runTransactionCallback(definition, "params", () => definition.config.params(args));
}

export function resolveTransactionPreviewPatches<
  Id extends string,
  Params,
  Value,
  Error,
  Requirements,
  Event extends FlowEvent,
>(
  definition: FlowTransactionCallbackDefinition<Id, Params, Value, Error, Requirements, Event>,
  params: Params,
): ReadonlyArray<FlowPreviewPatch> {
  return runTransactionCallback(
    definition,
    "preview.apply",
    () => definition.config.preview?.apply({ params }) ?? [],
  );
}

export function resolveTransactionInvalidationTargets<
  Id extends string,
  Params,
  Value,
  Error,
  Requirements,
  Event extends FlowEvent,
>(
  definition: FlowTransactionCallbackDefinition<Id, Params, Value, Error, Requirements, Event>,
  params: Params,
): ReadonlyArray<FlowInvalidationTarget> {
  const configuredTargets = definition.config.invalidates;
  if (configuredTargets === undefined) {
    return [];
  }

  return typeof configuredTargets === "function"
    ? runTransactionCallback(definition, "invalidates", () => configuredTargets({ params }))
    : configuredTargets;
}

export function resolveTransactionCommitEffect<
  Id extends string,
  Params,
  Value,
  Error,
  Requirements,
  Event extends FlowEvent,
>(
  definition: FlowTransactionCallbackDefinition<Id, Params, Value, Error, Requirements, Event>,
  params: Params,
): Effect.Effect<Value, Error, Requirements> {
  return runTransactionCallback(definition, "commit", () => definition.config.commit(params));
}
