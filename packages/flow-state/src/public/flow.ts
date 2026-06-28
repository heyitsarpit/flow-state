import type { Layer } from "effect";

import type {
  FlowActor,
  FlowAppDefinition,
  FlowChildConfig,
  FlowEvent,
  FlowResourceConfig,
  FlowInvalidationTarget,
  InferEffectRequirements,
  InferMachineContext,
  InferMachineEvent,
  InferMachineState,
  FlowKey,
  FlowMachine,
  FlowMachineConfig,
  FlowModuleDefinition,
  FlowModuleInventory,
  FlowModuleMeta,
  FlowResourceRef,
  FlowRuntime,
  FlowSnapshot,
  FlowStreamConfig,
  FlowTag,
  FlowTransactionConfig,
  FlowTransactionDefinition,
  FlowViewConfig,
  FlowViewDefinition,
} from "./types.js";

import { createAppDefinition } from "../descriptors/app.js";
import { createChildDefinition } from "../descriptors/child.js";
import { createMachineDefinition } from "../descriptors/machine.js";
import { createModuleDefinition } from "../descriptors/module.js";
import { createResourceDefinition } from "../descriptors/resource.js";
import { createStreamDefinition } from "../descriptors/stream.js";
import { createAfterDefinition } from "../descriptors/timer.js";
import { createTransactionDefinition, createOutcomeRoutes } from "../descriptors/transaction.js";
import { canMachineTransition } from "../machine-transition.js";
import { createViewDefinition } from "../descriptors/view.js";
import { createRuntime } from "../runtime/contract-runtime.js";

type FlowMachineAny = FlowMachine<unknown, FlowEvent, string>;

function flowResource<
  Params extends ReadonlyArray<unknown>,
  Value,
  Error = never,
  LookupReturn extends import("effect").Effect.Effect<Value, Error, unknown> =
    import("effect").Effect.Effect<Value, Error, never>,
  const Id extends string = string,
>(
  config: Readonly<{
    readonly id: Id;
    readonly key: (...params: Params) => FlowKey;
    readonly lookup: (...params: Params) => LookupReturn;
    readonly schema?: unknown;
    readonly tags?: (...params: Params) => ReadonlyArray<FlowTag>;
    readonly placeholder?: (...params: Params) => unknown;
    readonly freshness?: Readonly<{
      readonly staleAfter: string | number;
      readonly onInvalidate?: "active" | "lazy" | "never";
    }>;
  }>,
): import("./types.js").FlowResourceDefinition<
  Id,
  Params,
  Value,
  Error,
  InferEffectRequirements<LookupReturn>
> {
  return createResourceDefinition<Id, Params, Value, Error, InferEffectRequirements<LookupReturn>>(
    config as FlowResourceConfig<Id, Params, Value, Error, InferEffectRequirements<LookupReturn>>,
  );
}

function createUseActor<Machine extends FlowMachine>(
  machine: Machine,
): FlowActor<InferMachineContext<Machine>, InferMachineEvent<Machine>, InferMachineState<Machine>> {
  return createRuntime().createActor(machine);
}

export function selectView<Context, State extends string, Selected>(
  snapshot: FlowSnapshot<Context, State>,
  view: FlowViewDefinition<Context, State, Selected>,
): Selected {
  return view.config.select({
    context: snapshot.context,
    value: snapshot.value,
    resources: snapshot.resources,
    transactions: snapshot.transactions,
    streams: snapshot.streams,
    timers: snapshot.timers,
    children: snapshot.children,
    receipts: snapshot.receipts,
  });
}

export const flowExperimental = Object.freeze({
  graphOf: <Machine extends FlowMachineAny>(machine: Machine) =>
    Object.freeze({
      kind: "graph" as const,
      machine,
    }),
  captureTrace: <Snapshot extends FlowSnapshot<unknown, string>>(
    snapshot: Snapshot,
    options?: Readonly<Record<string, unknown>>,
  ) =>
    Object.freeze({
      kind: "trace" as const,
      snapshot,
      options,
    }),
  replayTrace: <Machine extends FlowMachineAny>(
    machine: Machine,
    trace: Readonly<Record<string, unknown>>,
  ) =>
    Object.freeze({
      kind: "replay" as const,
      machine,
      trace,
    }),
  flowStories: <Machine extends FlowMachineAny>(
    machine: Machine,
    stories: ReadonlyArray<Readonly<Record<string, unknown>>>,
  ) =>
    Object.freeze({
      kind: "stories" as const,
      machine,
      stories,
    }),
});

export const flow = Object.freeze({
  resource: flowResource,
  transaction: <
    Params,
    Value,
    Error = never,
    Requirements = never,
    Event extends FlowEvent = FlowEvent,
    const Id extends string = string,
  >(
    config: FlowTransactionConfig<Id, Params, Value, Error, Requirements, Event>,
  ) => createTransactionDefinition(config),
  machine: <
    Context,
    Event extends FlowEvent,
    State extends string,
    Initial extends State = State,
    const Id extends string = string,
  >(
    config: FlowMachineConfig<Id, Context, Event, State, Initial>,
  ) => createMachineDefinition(config),
  view: <Context, State extends string, Selected, const Id extends string = string>(
    config: FlowViewConfig<Id, Context, State, Selected>,
  ) => createViewDefinition(config),
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
  ) => createStreamDefinition(config),
  after: createAfterDefinition,
  child: <Machine extends FlowMachineAny>(config: FlowChildConfig<Machine>) =>
    createChildDefinition(config),
  module: <const Id extends string, Inventory extends FlowModuleInventory>(
    id: Id,
    inventoryOrFactory: Inventory | (() => Inventory),
    meta?: FlowModuleMeta,
  ): FlowModuleDefinition<Id, Inventory> => createModuleDefinition(id, inventoryOrFactory, meta),
  app: <const Modules extends ReadonlyArray<FlowModuleDefinition>>(config: {
    readonly modules: Modules;
  }): FlowAppDefinition<Modules> => createAppDefinition(config),
  runtime: <AppLayer extends Layer.Layer<any, any, never>>(
    layer: AppLayer,
  ): FlowRuntime<Layer.Success<AppLayer>, Layer.Error<AppLayer>> => createRuntime(layer),
  outcomes: createOutcomeRoutes,
  ensure: (ref: FlowResourceRef) =>
    Object.freeze({
      kind: "ensure" as const,
      ref,
    }),
  observe: (ref: FlowResourceRef) =>
    Object.freeze({
      kind: "observe" as const,
      ref,
    }),
  refresh: (ref: FlowResourceRef) =>
    Object.freeze({
      kind: "refresh" as const,
      ref,
    }),
  run: (transaction: FlowTransactionDefinition<string, any, any, any, any, FlowEvent>) =>
    Object.freeze({
      kind: "run" as const,
      id: transaction.id,
      transaction,
    }),
  patch: (ref: FlowResourceRef, patch: unknown) =>
    Object.freeze({
      kind: "patch" as const,
      ref,
      patch,
    }),
  invalidate: (target: FlowInvalidationTarget) =>
    Object.freeze({
      kind: "invalidate" as const,
      target,
    }),
  can: (snapshot: FlowSnapshot<unknown, string>, event: FlowEvent) =>
    canMachineTransition(snapshot, event),
  use: <Context, Event extends FlowEvent, State extends string>(
    machine: FlowMachine<Context, Event, State>,
  ) => createUseActor(machine),
  useResource: (_ref: FlowResourceRef) => null,
  useView: <Context, Event extends FlowEvent, State extends string, Selected>(
    actor: FlowActor<Context, Event, State>,
    view: FlowViewDefinition<Context, State, Selected>,
  ) => selectView(actor.getSnapshot(), view),
  store: Object.freeze({
    memory: ({ namespace }: { readonly namespace: string }) =>
      Object.freeze({
        kind: "store" as const,
        mode: "memory" as const,
        namespace,
      }),
    test: ({ namespace }: { readonly namespace: string }) =>
      Object.freeze({
        kind: "store" as const,
        mode: "test" as const,
        namespace,
      }),
  }),
  orchestrators: Object.freeze({
    live: (options: Readonly<Record<string, unknown>>) =>
      Object.freeze({
        kind: "orchestrators" as const,
        mode: "live" as const,
        options,
      }),
    test: (options: Readonly<Record<string, unknown>>) =>
      Object.freeze({
        kind: "orchestrators" as const,
        mode: "test" as const,
        options,
      }),
  }),
  persist: (config: Readonly<Record<string, unknown>>) =>
    Object.freeze({
      kind: "persist" as const,
      config,
    }),
  permission: (config: Readonly<Record<string, unknown>>) =>
    Object.freeze({
      kind: "permission" as const,
      config,
    }),
});
