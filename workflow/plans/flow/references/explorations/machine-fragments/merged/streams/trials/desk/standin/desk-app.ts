// STAND-IN for the desk's app wiring (app/setup.ts, Session and queue refs, the Desk client half). Not part of the trial.
import type { Layer } from "effect";
import type { ActorRef } from "flow-state";

export declare const DeskSetup: object;
export declare const DeskClient: Layer.Layer<never>;
export declare const SessionRef: ActorRef<unknown>;
export declare const queueRef: (workspaceId: string) => ActorRef<unknown>;
