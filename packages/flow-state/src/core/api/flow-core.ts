import type { Layer } from "effect";

import type {
  AnyFlowMachine,
  FlowEnsureDefinition,
  FlowEvent,
  FlowInvalidateDefinition,
  FlowInvalidationTarget,
  FlowIssue,
  FlowMachine,
  FlowMachineConfig,
  FlowModuleDefinition,
  FlowModuleInventory,
  FlowModuleMeta,
  FlowObserveDefinition,
  FlowPatchDefinition,
  FlowRefreshDefinition,
  FlowResourceRef,
  FlowRunDefinition,
  FlowRuntime,
  FlowSnapshot,
  InferEffectRequirements,
} from "../../public/types.js";
import type {
  FlowAppDefinition,
  FlowChildConfig,
  FlowChildDefinition,
  FlowResourceConfig,
  FlowStreamConfig,
  FlowStreamDefinition,
  FlowTransactionConfig,
  FlowTransactionDefinition,
  FlowViewConfig,
  FlowViewDefinition,
} from "../../public/types.js";

import { createAppDefinition } from "../../descriptors/app.js";
import { createChildDefinition } from "../../descriptors/child.js";
import { createMachineDefinition } from "../../descriptors/machine.js";
import { createModuleDefinition } from "../../descriptors/module.js";
import { createResourceDefinition } from "../../descriptors/resource.js";
import { createStreamDefinition } from "../../descriptors/stream.js";
import { createAfterDefinition } from "../../descriptors/timer.js";
import { createOutcomeRoutes, createTransactionDefinition } from "../../descriptors/transaction.js";
import { canMachineTransition } from "../../machine-transition.js";
import { createViewDefinition } from "../../descriptors/view.js";
import { createRuntime, type RuntimeReadyLayer } from "../../runtime/contract-runtime.js";
import { resolveViewSelectionWithDiagnostics } from "../../view-callbacks.js";

function flowResource<
  Params extends ReadonlyArray<unknown>,
  Value,
  Error = never,
  LookupReturn extends import("effect").Effect.Effect<Value, Error, unknown> =
    import("effect").Effect.Effect<Value, Error, never>,
  const Id extends string = string,
  Schema = unknown,
>(
  config: Readonly<{
    readonly id: Id;
    readonly key: (...params: Params) => import("../../public/types.js").FlowKey;
    readonly lookup: (...params: Params) => LookupReturn;
    readonly schema?: Schema;
    readonly tags?: (...params: Params) => ReadonlyArray<import("../../public/types.js").FlowTag>;
    readonly placeholder?: (...params: Params) => unknown;
    readonly freshness?: Readonly<{
      readonly staleAfter: string | number;
      readonly onInvalidate?: "active" | "lazy" | "never";
    }>;
  }>,
): import("../../public/types.js").FlowResourceDefinition<
  Id,
  Params,
  Value,
  Error,
  InferEffectRequirements<LookupReturn>,
  Schema
> {
  return createResourceDefinition<
    Id,
    Params,
    Value,
    Error,
    InferEffectRequirements<LookupReturn>,
    Schema
  >(
    config as FlowResourceConfig<
      Id,
      Params,
      Value,
      Error,
      InferEffectRequirements<LookupReturn>,
      Schema
    >,
  );
}

type FlowAppConfig<Modules extends ReadonlyArray<FlowModuleDefinition>> = Readonly<{
  readonly modules: Modules;
}>;

function flowApp<const Modules extends ReadonlyArray<FlowModuleDefinition>>(
  config: FlowAppConfig<Modules>,
): FlowAppDefinition<Modules>;
function flowApp<const Modules extends ReadonlyArray<FlowModuleDefinition>>(
  config: FlowAppConfig<Modules>,
): FlowAppDefinition<Modules> {
  return createAppDefinition(config);
}

export function selectView<Context, State extends string, Selected>(
  snapshot: FlowSnapshot<Context, State>,
  view: FlowViewDefinition<Context, State, Selected>,
  options?: Readonly<{
    readonly issues?: ReadonlyArray<FlowIssue>;
  }>,
): Selected {
  return resolveViewSelectionWithDiagnostics(snapshot, view, options?.issues ?? []);
}

export const flow = Object.freeze({
  resource: flowResource,
  transaction: <
    Params,
    Value,
    Error = never,
    Requirements = never,
    Event extends FlowEvent = FlowEvent,
    const Id extends string = string,
    PreviewPatches extends ReadonlyArray<unknown> = ReadonlyArray<
      import("../../public/types.js").FlowPreviewPatch
    >,
  >(
    config: FlowTransactionConfig<Id, Params, Value, Error, Requirements, Event, PreviewPatches>,
  ): FlowTransactionDefinition<Id, Params, Value, Error, Requirements, Event, PreviewPatches> =>
    createTransactionDefinition(config),
  machine: <
    Context,
    Event extends FlowEvent,
    State extends string,
    Initial extends State = State,
    const Id extends string = string,
  >(
    config: FlowMachineConfig<Id, Context, Event, State, Initial>,
  ): FlowMachine<Context, Event, State, Initial, Id> => createMachineDefinition(config),
  view: <Context, State extends string, Selected, const Id extends string = string>(
    config: FlowViewConfig<Id, Context, State, Selected>,
  ): FlowViewDefinition<Context, State, Selected, Id> => createViewDefinition(config),
  stream: <
    Context = unknown,
    Event extends FlowEvent = FlowEvent,
    Params = void,
    Value = unknown,
    Error = never,
    Requirements = never,
    const Id extends string = string,
  >(
    config: FlowStreamConfig<Id, Context, Event, Params, Value, Error, Requirements>,
  ): FlowStreamDefinition<Value, Error, Params, Event, Context, Id, Requirements> =>
    createStreamDefinition(config),
  after: createAfterDefinition,
  child: <Machine extends AnyFlowMachine>(
    config: FlowChildConfig<Machine>,
  ): FlowChildDefinition<Machine> => createChildDefinition(config),
  module: <
    const Id extends string,
    const Inventory extends FlowModuleInventory,
    const Meta extends FlowModuleMeta = FlowModuleMeta,
  >(
    id: Id,
    inventory: Inventory,
    meta?: Meta,
  ): FlowModuleDefinition<Id, Inventory, Meta> => createModuleDefinition(id, inventory, meta),
  app: flowApp,
  runtime: <AppLayer extends Layer.Any>(
    layer: RuntimeReadyLayer<AppLayer>,
  ): FlowRuntime<Layer.Success<AppLayer>, Layer.Error<AppLayer>> => createRuntime(layer),
  outcomes: createOutcomeRoutes,
  ensure: <Ref extends FlowResourceRef>(ref: Ref): FlowEnsureDefinition<Ref> =>
    Object.freeze({
      kind: "ensure" as const,
      ref,
    }),
  observe: <Ref extends FlowResourceRef>(ref: Ref): FlowObserveDefinition<Ref> =>
    Object.freeze({
      kind: "observe" as const,
      ref,
    }),
  refresh: <Ref extends FlowResourceRef>(ref: Ref): FlowRefreshDefinition<Ref> =>
    Object.freeze({
      kind: "refresh" as const,
      ref,
    }),
  run: <
    Event extends FlowEvent,
    Transaction extends FlowTransactionDefinition<
      string,
      unknown,
      unknown,
      unknown,
      unknown,
      Event
    >,
  >(
    transaction: Transaction,
  ): FlowRunDefinition<Transaction> =>
    Object.freeze({
      kind: "run" as const,
      id: transaction.id,
      transaction,
    }),
  patch: <Ref extends FlowResourceRef, Patch>(
    ref: Ref,
    patch: Patch,
  ): FlowPatchDefinition<Ref, Patch> =>
    Object.freeze({
      kind: "patch" as const,
      ref,
      patch,
    }),
  invalidate: <Target extends FlowInvalidationTarget>(
    target: Target,
  ): FlowInvalidateDefinition<Target> =>
    Object.freeze({
      kind: "invalidate" as const,
      target,
    }),
  can: (snapshot: FlowSnapshot<unknown, string>, event: FlowEvent) =>
    canMachineTransition(snapshot, event),
  store: Object.freeze({
    memory: () =>
      Object.freeze({
        kind: "store" as const,
        mode: "memory" as const,
      }),
    test: () =>
      Object.freeze({
        kind: "store" as const,
        mode: "test" as const,
      }),
  }),
  orchestrators: Object.freeze({
    live: () =>
      Object.freeze({
        kind: "orchestrators" as const,
        mode: "live" as const,
      }),
    test: () =>
      Object.freeze({
        kind: "orchestrators" as const,
        mode: "test" as const,
      }),
  }),
});
