import type { Brand } from "effect";

export type { ActorId, CallId, TicketId, TimerId } from "../../src/core/world.ts";

export type OwedId = string & Brand.Brand<"flow-state/OwedId">;
export type AttemptId = string & Brand.Brand<"flow-state/AttemptId">;
export type LaneId = string & Brand.Brand<"flow-state/LaneId">;
