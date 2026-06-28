import type { Effect } from "effect";

import type {
  FlowEvent,
  FlowInvalidationTarget,
  FlowPreviewPatch,
  FlowTransactionDefinition,
} from "./public/types.js";

export function resolveTransactionParams<
  Id extends string,
  Params,
  Value,
  Error,
  Requirements,
  Event extends FlowEvent,
>(
  definition: FlowTransactionDefinition<Id, Params, Value, Error, Requirements, Event>,
  args: Record<string, unknown>,
): Params | null | undefined {
  return definition.config.params?.(args);
}

export function resolveTransactionPreviewPatches<
  Id extends string,
  Params,
  Value,
  Error,
  Requirements,
  Event extends FlowEvent,
>(
  definition: FlowTransactionDefinition<Id, Params, Value, Error, Requirements, Event>,
  params: Params,
): ReadonlyArray<FlowPreviewPatch> {
  return definition.config.preview?.apply({ params }) ?? [];
}

export function resolveTransactionInvalidationTargets<
  Id extends string,
  Params,
  Value,
  Error,
  Requirements,
  Event extends FlowEvent,
>(
  definition: FlowTransactionDefinition<Id, Params, Value, Error, Requirements, Event>,
  params: Params,
): ReadonlyArray<FlowInvalidationTarget> {
  const configuredTargets = definition.config.invalidates;
  if (configuredTargets === undefined) {
    return [];
  }

  return typeof configuredTargets === "function"
    ? configuredTargets({ params })
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
  definition: FlowTransactionDefinition<Id, Params, Value, Error, Requirements, Event>,
  params: Params,
): Effect.Effect<Value, Error, Requirements> {
  return definition.config.commit(params);
}
