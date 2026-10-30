// Pending merge 6 (M6 4.2): the shape of a presence socket. `frames(ticket)` emits the server's
// frames as decoded; presence.contracts.ts folds them with `Stream.scan` into one `Members` value
// inside `Feed.reconnect`. The server sends `presence_state` (everyone) on every join, then
// `presence_diff` with `joins` and `leaves` (Phoenix Presence's shape), so each connection's
// state is correct again after a reconnect even if nobody joined or left.
import { Context, Schema, type Stream } from "effect";
import type { SignedOut, SocketDropped, TicketKey } from "../Tickets/types.js";

export const Member = Schema.Struct({ id: Schema.String, name: Schema.String });

export type Member = typeof Member.Type;

// Keyed by member id.
export const Members = Schema.Record(Schema.String, Member);

export type Members = typeof Members.Type;

export const PresenceFrame = Schema.Union([
  Schema.Struct({ t: Schema.Literal("presence_state"), members: Members }),
  Schema.Struct({ t: Schema.Literal("presence_diff"), joins: Members, leaves: Members }),
  Schema.Struct({ t: Schema.Literal("ping") }),
]);

export type PresenceFrame = typeof PresenceFrame.Type;

// Applies one diff to a state: leaves first, then joins, so a leave and a rejoin in one diff
// (a refreshed tab) ends present.
export const applyDiff = (members: Members, diff: { joins: Members; leaves: Members }): Members => {
  const left = Object.fromEntries(Object.entries(members).filter(([id]) => !(id in diff.leaves)));

  return { ...left, ...diff.joins };
};

export class PresenceApi extends Context.Service<
  PresenceApi,
  {
    frames: (ticket: TicketKey) => Stream.Stream<PresenceFrame, SocketDropped | SignedOut>;
  }
>()("DispatchDesk/PresenceApi") {}
