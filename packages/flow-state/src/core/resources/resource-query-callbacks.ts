import { Cause, Exit } from "effect";

import { resourceCallbackThrewDiagnostic } from "../../shared/diagnostics.js";
import type {
  FlowEvent,
  FlowInvokeDescriptor,
  FlowOutcomeRoutes,
  FlowResourceRef,
} from "../api/types.js";
import { resolveTransactionOutcomeEvent } from "../transactions/transaction-outcome-callbacks.js";

export type FlowResourceQueryInvoke<Event extends FlowEvent = FlowEvent> = Extract<
  FlowInvokeDescriptor<Event>,
  { readonly kind: "ensure" | "observe" | "refresh" }
>;

export type ResolvedResourceQuery<Event extends FlowEvent = FlowEvent> = Readonly<{
  readonly kind: "ensure" | "observe" | "refresh";
  readonly ref: FlowResourceRef;
  readonly routes?: FlowOutcomeRoutes<unknown, unknown, Event>;
}>;

function runResourceQueryCallback<Result>(
  resourceId: string,
  callback: "params" | "routes.success" | "routes.failure" | "routes.defect" | "routes.interrupt",
  run: () => Result,
): Result {
  try {
    return run();
  } catch (cause) {
    throw resourceCallbackThrewDiagnostic({ resourceId, callback, cause });
  }
}

export function resolveResourceQuery<Event extends FlowEvent>(
  definition: FlowResourceQueryInvoke<Event>,
  args: Readonly<Record<string, unknown>>,
): ResolvedResourceQuery<Event> | null {
  if ("ref" in definition) {
    return Object.freeze({
      kind: definition.kind,
      ref: definition.ref,
    });
  }

  const selectParams = definition.config.params as (
    args: Readonly<Record<string, unknown>>,
  ) => ReadonlyArray<unknown> | null;
  const params = runResourceQueryCallback(definition.resource.id, "params", () =>
    selectParams(args),
  );
  if (params === null) return null;

  return Object.freeze({
    kind: definition.kind,
    ref: (
      definition.resource.ref as unknown as (...selected: ReadonlyArray<unknown>) => FlowResourceRef
    )(...params),
    ...(definition.config.routes === undefined ? {} : { routes: definition.config.routes }),
  }) as ResolvedResourceQuery<Event>;
}

export function routeResourceQueryExit<Event extends FlowEvent>(
  query: ResolvedResourceQuery<Event>,
  exit: Exit.Exit<unknown, unknown>,
): Event | undefined {
  if (Exit.isSuccess(exit)) {
    return runResourceQueryCallback(query.ref.id, "routes.success", () =>
      resolveTransactionOutcomeEvent(query.routes, "success", { value: exit.value }),
    );
  }
  if (Cause.hasInterruptsOnly(exit.cause)) {
    return runResourceQueryCallback(query.ref.id, "routes.interrupt", () =>
      resolveTransactionOutcomeEvent(query.routes, "interrupt", {}),
    );
  }
  const failure = exit.cause.reasons.find(Cause.isFailReason);
  return failure === undefined
    ? runResourceQueryCallback(query.ref.id, "routes.defect", () =>
        resolveTransactionOutcomeEvent(query.routes, "defect", { cause: exit.cause }),
      )
    : runResourceQueryCallback(query.ref.id, "routes.failure", () =>
        resolveTransactionOutcomeEvent(query.routes, "failure", { error: failure.error }),
      );
}
