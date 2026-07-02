import type { FlowChildSnapshot } from "../api/data-types.js";
import type { FlowChildDefinition } from "../api/machine-invoke-types.js";

export type ChildLifecycleSpawnReason = "state-entry" | "retry";
export type ChildLifecycleStopReason = "state-exit" | "parent-dispose" | "child-dispose";
export type ChildLifecycleRetryCause = "manual";

type ChildLifecycleReceiptOptions = Readonly<{
  readonly ownerPath?: string | undefined;
  readonly parentState: string;
  readonly state?: string | undefined;
  readonly supervision?: FlowChildSnapshot["supervision"] | undefined;
}>;

export function childLifecycleReceiptFacts(
  definition: FlowChildDefinition,
  actorId: string,
  options: ChildLifecycleReceiptOptions,
): Readonly<{
  readonly actorId: string;
  readonly parentState: string;
  readonly ownerPath?: string;
  readonly supervision?: FlowChildSnapshot["supervision"];
  readonly state?: string;
}> {
  const supervision = options.supervision ?? definition.config.supervision;

  return Object.freeze({
    actorId,
    parentState: options.parentState,
    ...(options.ownerPath === undefined ? {} : { ownerPath: options.ownerPath }),
    ...(supervision === undefined ? {} : { supervision }),
    ...(options.state === undefined ? {} : { state: options.state }),
  });
}

export function childStartReceiptFacts(
  definition: FlowChildDefinition,
  actorId: string,
  spawnReason: ChildLifecycleSpawnReason,
  options: ChildLifecycleReceiptOptions,
): Readonly<{
  readonly actorId: string;
  readonly parentState: string;
  readonly ownerPath?: string;
  readonly supervision?: FlowChildSnapshot["supervision"];
  readonly state?: string;
  readonly spawnReason: ChildLifecycleSpawnReason;
}> {
  return Object.freeze({
    ...childLifecycleReceiptFacts(definition, actorId, options),
    spawnReason,
  });
}

export function childStopReceiptFacts(
  definition: FlowChildDefinition,
  actorId: string,
  stopReason: ChildLifecycleStopReason,
  options: ChildLifecycleReceiptOptions,
): Readonly<{
  readonly actorId: string;
  readonly parentState: string;
  readonly ownerPath?: string;
  readonly supervision?: FlowChildSnapshot["supervision"];
  readonly state?: string;
  readonly stopReason: ChildLifecycleStopReason;
}> {
  return Object.freeze({
    ...childLifecycleReceiptFacts(definition, actorId, options),
    stopReason,
  });
}

export function childRetryReceiptFacts(
  definition: FlowChildDefinition,
  actorId: string,
  retryCause: ChildLifecycleRetryCause,
  options: ChildLifecycleReceiptOptions,
): Readonly<{
  readonly actorId: string;
  readonly parentState: string;
  readonly ownerPath?: string;
  readonly supervision?: FlowChildSnapshot["supervision"];
  readonly state?: string;
  readonly retryCause: ChildLifecycleRetryCause;
}> {
  return Object.freeze({
    ...childLifecycleReceiptFacts(definition, actorId, options),
    retryCause,
  });
}
