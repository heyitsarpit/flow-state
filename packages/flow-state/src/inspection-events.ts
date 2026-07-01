import type {
  FlowActorSnapshotTree,
  FlowInspectionChildEvent,
  FlowInspectionChildEventType,
  FlowInspectionEvent,
  FlowReceipt,
} from "./public/types.js";

export type FlowInspectionOwner = Readonly<{
  readonly actorId: string;
  readonly rootActorId: string;
  readonly appId?: string;
  readonly moduleId?: string;
}>;

type FlowInspectionSourceSnapshotEvent = Readonly<{
  readonly type: "actor:snapshot";
  readonly id: string;
  readonly snapshot: FlowActorSnapshotTree;
  readonly eventType?: string;
  readonly sourceActorId?: string;
  readonly targetActorId?: string;
  readonly correlationId?: string;
}>;
type FlowInspectionSourceChildEvent = FlowReceipt &
  Readonly<{
    readonly type: FlowInspectionChildEventType;
    readonly actorId: string;
  }>;

export type FlowInspectionSourceEvent = FlowReceipt | FlowInspectionSourceSnapshotEvent;
type FlowInspectionEventInputOf<Event> = Event extends FlowInspectionEvent
  ? Omit<Event, "timestamp" | "sequence">
  : never;

export type FlowInspectionEventInput = FlowInspectionEventInputOf<FlowInspectionEvent>;

export function withInspectionOwnership(
  owner: FlowInspectionOwner,
  event: FlowInspectionSourceEvent,
): FlowInspectionEventInput {
  const base = {
    actorId: owner.actorId,
    rootActorId: owner.rootActorId,
    ...(owner.appId === undefined ? {} : { appId: owner.appId }),
    ...(owner.moduleId === undefined ? {} : { moduleId: owner.moduleId }),
  };

  if (event.type.startsWith("child:")) {
    const childEvent = event as FlowInspectionSourceChildEvent;
    const { actorId: childActorId, ...rest } = childEvent;

    return Object.freeze({
      ...rest,
      ...base,
      childActorId,
    }) satisfies Omit<FlowInspectionChildEvent, "timestamp" | "sequence">;
  }

  return Object.freeze({
    ...event,
    ...base,
  }) as FlowInspectionEventInput;
}
