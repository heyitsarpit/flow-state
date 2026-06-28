import { useRef } from "react";

import type {
  FlowActor,
  FlowEvent,
  FlowSnapshot,
  FlowIssue,
  FlowViewDefinition,
  SelectionSource,
} from "../public/types.js";
import { selectSource } from "../store/selected-source.js";
import { useSource } from "./use-source.js";

function readViewSelection<Context, State extends string, Selected>(
  snapshot: FlowSnapshot<Context, State>,
  view: FlowViewDefinition<Context, State, Selected>,
  issues: ReadonlyArray<FlowIssue>,
): Selected {
  return view.config.select({
    context: snapshot.context,
    value: snapshot.value,
    resources: snapshot.resources,
    transactions: snapshot.transactions,
    streams: snapshot.streams,
    timers: snapshot.timers,
    children: snapshot.children,
    issues,
    receipts: snapshot.receipts,
  });
}

export function useFlowView<Context, Event extends FlowEvent, State extends string, Selected>(
  actor: FlowActor<Context, Event, State>,
  view: FlowViewDefinition<Context, State, Selected>,
  equal?: (left: Selected, right: Selected) => boolean,
): Selected {
  const current = useRef<Readonly<{
    readonly actor: FlowActor<Context, Event, State>;
    readonly view: FlowViewDefinition<Context, State, Selected>;
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
      source: selectSource(
        actor,
        (snapshot: FlowSnapshot<Context, State, Event>) =>
          readViewSelection(snapshot, view, actor.issues()),
        equal,
      ),
    };
  }

  return useSource(current.current.source);
}
