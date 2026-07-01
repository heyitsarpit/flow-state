import type {
  FlowChildSnapshot,
  FlowEvent,
  FlowSnapshot,
  FlowTraceActorNode,
} from "./core/api/types.js";

function childNode(snapshot: FlowChildSnapshot): FlowTraceActorNode {
  const nestedChildren = snapshot.snapshot?.children ?? {};
  const state = snapshot.state ?? snapshot.snapshot?.value;

  return Object.freeze({
    id: snapshot.id,
    ...(snapshot.actorId === undefined ? {} : { actorId: snapshot.actorId }),
    status: snapshot.status,
    ...(state === undefined ? {} : { state }),
    ...(snapshot.parentState === undefined ? {} : { parentState: snapshot.parentState }),
    ...(snapshot.supervision === undefined ? {} : { supervision: snapshot.supervision }),
    children: Object.freeze(
      Object.fromEntries(
        Object.entries(nestedChildren).map(([id, child]) => [id, childNode(child)]),
      ),
    ),
  });
}

export function createTraceActorHierarchy<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
): FlowTraceActorNode {
  return Object.freeze({
    id: snapshot.machine.id,
    state: snapshot.value,
    children: Object.freeze(
      Object.fromEntries(
        Object.entries(snapshot.children).map(([id, child]) => [id, childNode(child)]),
      ),
    ),
  });
}
