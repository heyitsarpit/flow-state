import { useRef } from "react";

import type {
  FlowActor,
  FlowEvent,
  FlowViewDefinition,
  SelectionSource,
} from "../core/api/types.js";

import { useSource } from "./use-source.js";
import { createViewSource } from "./view-source.js";

export function useFlowView<
  ViewContext,
  ViewState extends string,
  ActorContext extends ViewContext,
  Event extends FlowEvent,
  ActorState extends ViewState,
  Selected,
>(
  actor: FlowActor<ActorContext, Event, ActorState>,
  view: FlowViewDefinition<ViewContext, ViewState, Selected>,
  equal?: (left: Selected, right: Selected) => boolean,
): Selected {
  const current = useRef<Readonly<{
    readonly actor: FlowActor<ActorContext, Event, ActorState>;
    readonly view: FlowViewDefinition<ViewContext, ViewState, Selected>;
    readonly equal: ((left: Selected, right: Selected) => boolean) | undefined;
    readonly source: SelectionSource<Selected>;
  }> | null>(null);

  if (
    current.current === null ||
    current.current.actor !== actor ||
    current.current.view !== view ||
    current.current.equal !== equal
  ) {
    current.current = {
      actor,
      view,
      equal,
      source: createViewSource(actor, view, equal),
    };
  }

  return useSource(current.current.source);
}
