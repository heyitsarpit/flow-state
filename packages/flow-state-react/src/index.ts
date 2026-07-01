import type { ReactElement, ReactNode } from "react";

import { flow as coreFlow } from "@flow-state/core";
import type {
  FlowActor,
  FlowActorStartOptions,
  FlowEvent,
  FlowMachine,
  FlowResourceRef,
  FlowResourceSnapshot,
  FlowRuntime,
  FlowViewDefinition,
  InferMachineContext,
  InferMachineEvent,
  InferMachineState,
} from "@flow-state/core";

import { FlowProvider as InternalFlowProvider } from "../../flow-state/src/react/provider.js";
import { useFlowActor as useReactActor } from "../../flow-state/src/react/use-actor.js";
import { useFlowResource as useReactResource } from "../../flow-state/src/react/use-resource.js";
import { useFlowView as useReactView } from "../../flow-state/src/react/use-view.js";

export interface FlowProviderProps {
  readonly runtime: FlowRuntime<never, unknown>;
  readonly children?: ReactNode;
}

// The facade owns public React types while the implementation still lives in core source.
export const FlowProvider = InternalFlowProvider as unknown as (
  props: FlowProviderProps,
) => ReactElement;

type ResourceValue<Ref extends FlowResourceRef> =
  Ref extends FlowResourceRef<string, ReadonlyArray<unknown>, infer Value> ? Value : never;

type ResourceSnapshot<Ref extends FlowResourceRef> = FlowResourceSnapshot<
  ResourceValue<Ref>
> | null;

// Keep hook return types tied to @flow-state/core instead of leaking core source paths.
export type ReactFlowApi = typeof coreFlow &
  Readonly<{
    readonly use: <Machine extends FlowMachine>(
      machine: Machine,
      options?: FlowActorStartOptions<Machine>,
    ) => FlowActor<
      InferMachineContext<Machine>,
      InferMachineEvent<Machine>,
      InferMachineState<Machine>
    >;
    readonly useResource: <Ref extends FlowResourceRef>(ref: Ref) => ResourceSnapshot<Ref>;
    readonly useView: <Context, Event extends FlowEvent, State extends string, Selected>(
      actor: FlowActor<Context, Event, State>,
      view: FlowViewDefinition<Context, State, Selected>,
      equal?: (left: Selected, right: Selected) => boolean,
    ) => Selected;
  }>;

export const flow = Object.freeze({
  ...coreFlow,
  use: <Context, Event extends FlowEvent, State extends string>(
    machine: FlowMachine<Context, Event, State>,
    options?: FlowActorStartOptions<FlowMachine<Context, Event, State>>,
  ) => useReactActor(machine, options),
  useResource: <Ref extends FlowResourceRef>(ref: Ref): ResourceSnapshot<Ref> =>
    useReactResource(ref),
  useView: <Context, Event extends FlowEvent, State extends string, Selected>(
    actor: FlowActor<Context, Event, State>,
    view: FlowViewDefinition<Context, State, Selected>,
    equal?: (left: Selected, right: Selected) => boolean,
  ) => useReactView(actor, view, equal),
}) as unknown as ReactFlowApi;
