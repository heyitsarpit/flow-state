import type {
  FlowActor,
  FlowEvent,
  FlowIssue,
  FlowSnapshot,
  FlowViewDefinition,
  SelectionSource,
} from "../core/api/types.js";
import { selectView } from "../core/api/flow-core.js";
import { selectSource } from "../store/selection-source.js";

import { createSubscribedSource } from "./subscribed-source.js";

type ActorViewState<Context, State extends string, Event extends FlowEvent> = Readonly<{
  readonly snapshot: FlowSnapshot<Context, State, Event>;
  readonly issues: ReadonlyArray<FlowIssue>;
}>;

function sameActorViewState<Context, State extends string, Event extends FlowEvent>(
  left: ActorViewState<Context, State, Event>,
  right: ActorViewState<Context, State, Event>,
): boolean {
  return left.snapshot === right.snapshot && left.issues === right.issues;
}

function currentActorViewState<Context, Event extends FlowEvent, State extends string>(
  actor: FlowActor<Context, Event, State>,
): ActorViewState<Context, State, Event> {
  return {
    snapshot: actor.getSnapshot(),
    issues: actor.issues(),
  };
}

export function createViewSource<Context, Event extends FlowEvent, State extends string, Selected>(
  actor: FlowActor<Context, Event, State>,
  view: FlowViewDefinition<Context, State, Selected>,
  equal?: (left: Selected, right: Selected) => boolean,
): SelectionSource<Selected> {
  const actorViewStateSource = createSubscribedSource({
    getCurrent: () => currentActorViewState(actor),
    subscribeToCurrent: (listener) =>
      actor.subscribe(() => {
        listener(currentActorViewState(actor));
      }),
    equal: sameActorViewState,
  });

  return selectSource(
    actorViewStateSource,
    ({ snapshot, issues }) => selectView(snapshot, view, { issues }),
    equal,
  );
}
