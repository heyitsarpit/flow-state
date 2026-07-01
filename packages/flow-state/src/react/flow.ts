import type {
  FlowActor,
  FlowActorStartOptions,
  FlowEvent,
  FlowMachine,
  FlowResourceRef,
  FlowViewDefinition,
} from "../public/types.js";

import { flow as flowCore } from "../public/flow-core.js";
import { useFlowActor as useReactActor } from "./use-actor.js";
import { useFlowResource as useReactResource } from "./use-resource.js";
import { useFlowView as useReactView } from "./use-view.js";

export const flow = Object.freeze({
  ...flowCore,
  use: <Context, Event extends FlowEvent, State extends string>(
    machine: FlowMachine<Context, Event, State>,
    options?: FlowActorStartOptions<FlowMachine<Context, Event, State>>,
  ) => useReactActor(machine, options),
  useResource: <Ref extends FlowResourceRef>(ref: Ref): ReturnType<typeof useReactResource<Ref>> =>
    useReactResource(ref),
  useView: <Context, Event extends FlowEvent, State extends string, Selected>(
    actor: FlowActor<Context, Event, State>,
    view: FlowViewDefinition<Context, State, Selected>,
    equal?: (left: Selected, right: Selected) => boolean,
  ) => useReactView(actor, view, equal),
});
