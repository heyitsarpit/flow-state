import { Cause, Exit } from "effect";

import type {
  FlowEvent,
  FlowRuntimeTransactionAttempt,
  FlowRuntimeTransactionDefinition,
  FlowRuntimeTransactionSettlement,
  FlowTransactionCallbackDefinition,
} from "../api/types.js";
import {
  resolveTransactionCommitEffect,
  resolveTransactionInvalidationTargets,
  resolveRequiredTransactionParams,
  resolveTransactionPreviewPatches,
} from "./transaction-callbacks.js";
import { resolveTransactionOutcomeEventWithDiagnostics } from "./transaction-outcome-callbacks.js";

function settlementFor<
  Id extends string,
  Params,
  Value,
  Error,
  Requirements,
  Event extends FlowEvent,
  PreviewPatches extends ReadonlyArray<unknown>,
>(
  definition: FlowTransactionCallbackDefinition<
    Id,
    Params,
    Value,
    Error,
    Requirements,
    Event,
    PreviewPatches
  >,
  exit: Exit.Exit<Value, Error>,
): FlowRuntimeTransactionSettlement<Event> {
  return Object.freeze({
    exit,
    route: () => {
      if (Exit.isSuccess(exit)) {
        return resolveTransactionOutcomeEventWithDiagnostics(definition, "success", {
          value: exit.value,
        });
      }
      if (Cause.hasInterruptsOnly(exit.cause)) {
        return resolveTransactionOutcomeEventWithDiagnostics(definition, "interrupt", {});
      }
      const failure = exit.cause.reasons.find(Cause.isFailReason);
      return failure === undefined
        ? resolveTransactionOutcomeEventWithDiagnostics(definition, "defect", {
            cause: exit.cause,
          })
        : resolveTransactionOutcomeEventWithDiagnostics(definition, "failure", {
            error: failure.error,
          });
    },
  });
}

function createRuntimeAttempt<
  Id extends string,
  Params,
  Value,
  Error,
  Requirements,
  Event extends FlowEvent,
  PreviewPatches extends ReadonlyArray<unknown>,
>(
  definition: FlowTransactionCallbackDefinition<
    Id,
    Params,
    Value,
    Error,
    Requirements,
    Event,
    PreviewPatches
  >,
  params: Params,
): FlowRuntimeTransactionAttempt<Event> {
  return Object.freeze({
    id: definition.id,
    concurrency: definition.config.concurrency,
    scope: definition.config.scope,
    previewPatches: () => resolveTransactionPreviewPatches(definition, params),
    invalidationTargets: () => resolveTransactionInvalidationTargets(definition, params),
    runCommit: (run, onSettlement) =>
      run(resolveTransactionCommitEffect(definition, params), (exit) =>
        onSettlement(settlementFor(definition, exit)),
      ),
  });
}

export function createRuntimeTransactionDefinition<
  Id extends string,
  Params,
  Value,
  Error,
  Requirements,
  Event extends FlowEvent,
  PreviewPatches extends ReadonlyArray<unknown>,
>(
  definition: FlowTransactionCallbackDefinition<
    Id,
    Params,
    Value,
    Error,
    Requirements,
    Event,
    PreviewPatches
  > &
    Readonly<{
      readonly config: Readonly<{
        readonly params: (args: Readonly<Record<string, unknown>>) => Params | null;
      }>;
    }>,
): FlowRuntimeTransactionDefinition<Event> {
  return Object.freeze({
    id: definition.id,
    concurrency: definition.config.concurrency,
    scope: definition.config.scope,
    prepare: (args) => {
      const params = resolveRequiredTransactionParams(definition, args);
      if (params === null) {
        return null;
      }
      return createRuntimeAttempt(definition, params);
    },
  });
}

export function createVoidRuntimeTransactionDefinition<
  Id extends string,
  Value,
  Error,
  Requirements,
  Event extends FlowEvent,
  PreviewPatches extends ReadonlyArray<unknown>,
>(
  definition: FlowTransactionCallbackDefinition<
    Id,
    void,
    Value,
    Error,
    Requirements,
    Event,
    PreviewPatches
  >,
): FlowRuntimeTransactionDefinition<Event> {
  return Object.freeze({
    id: definition.id,
    concurrency: definition.config.concurrency,
    scope: definition.config.scope,
    prepare: () => createRuntimeAttempt(definition, undefined),
  });
}
