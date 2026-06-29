import type {
  FlowActor,
  FlowActorStartOptions,
  FlowEvent,
  FlowMachine,
  FlowResourceRef,
  FlowViewDefinition,
} from "./types.js";

import { useFlowActor as useReactActor } from "../react/use-actor.js";
import { useFlowResource as useReactResource } from "../react/use-resource.js";
import { useFlowView as useReactView } from "../react/use-view.js";
import { flow as flowCore, flowExperimental, selectView } from "./flow-core.js";

export { flowExperimental, selectView };

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
