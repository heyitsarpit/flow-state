import type {
  FlowActorSnapshotTree,
  FlowInspectionChildEvent,
  FlowInspectionChildEventType,
  FlowInspectionEvent,
  FlowInspectionExportOptions,
  FlowInspectionFilter,
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

function eventFamilyOf(event: FlowInspectionEvent): FlowInspectionFilter["family"] {
  const separator = event.type.indexOf(":");
  return (
    separator === -1 ? event.type : event.type.slice(0, separator)
  ) as FlowInspectionFilter["family"];
}

export function matchesInspectionFilter(
  event: FlowInspectionEvent,
  filter?: FlowInspectionFilter,
): boolean {
  if (filter === undefined) {
    return true;
  }

  if (filter.type !== undefined && event.type !== filter.type) {
    return false;
  }

  if (filter.types !== undefined && !filter.types.includes(event.type)) {
    return false;
  }

  if (filter.family !== undefined && eventFamilyOf(event) !== filter.family) {
    return false;
  }

  if (filter.id !== undefined && event.id !== filter.id) {
    return false;
  }

  if (filter.actorId !== undefined && event.actorId !== filter.actorId) {
    return false;
  }

  if (filter.rootActorId !== undefined && event.rootActorId !== filter.rootActorId) {
    return false;
  }

  if (filter.appId !== undefined && event.appId !== filter.appId) {
    return false;
  }

  if (filter.moduleId !== undefined && event.moduleId !== filter.moduleId) {
    return false;
  }

  if (filter.correlationId !== undefined && event.correlationId !== filter.correlationId) {
    return false;
  }

  if (filter.eventType !== undefined && event.eventType !== filter.eventType) {
    return false;
  }

  if (filter.afterSequence !== undefined && event.sequence <= filter.afterSequence) {
    return false;
  }

  return filter.predicate?.(event) ?? true;
}

export function exportInspectionEvents<Redacted = FlowInspectionEvent, Serialized = Redacted>(
  events: ReadonlyArray<FlowInspectionEvent>,
  options?: FlowInspectionExportOptions<Redacted, Serialized>,
): ReadonlyArray<Serialized> {
  return Object.freeze(
    events.map((event) => {
      const redacted = options?.redact?.(event) ?? (event as unknown as Redacted);
      return options?.serialize?.(redacted) ?? (redacted as unknown as Serialized);
    }),
  );
}

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
