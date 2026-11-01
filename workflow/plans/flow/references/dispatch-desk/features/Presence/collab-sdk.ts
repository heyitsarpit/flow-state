// The collaboration SDK, as the desk uses it: a structural subset of a hosted realtime service's client (Ably,
// Liveblocks, Supabase Realtime all have this shape). Effect-only: no Flow API, so it type-checks with Effect alone.
//
// Recipe S (M6 2.4): the SDK owns ONE app-wide connection, its reconnect and its backoff. Each Flow session is a
// subscription on a channel the client service hands out by name and reference-counts, so a session's finalizer
// releases only its own listeners and never detaches a channel another session holds (S9).
//
// What the SDK reports, and what the adapter (presence.contracts.ts) makes of it:
//   status "attached" { resumed }   Feed.live(), or Feed.live({ proof }) when the SDK resumed the channel in place
//   status "suspended" { reason }   Feed.down(reason): the SDK is reconnecting by itself, the row dims
//   status "failed" { reason }      the session fails: the SDK has given up (its budget is the budget)
//   presence members                a state feed's value (the whole set, each time)
//   "typing" messages               a fact feed; the SDK awaits the listener's promise (back-pressure)
import { Context, Schema } from "effect";

export const Member = Schema.Struct({ id: Schema.String, name: Schema.String });

export type Member = typeof Member.Type;

// Keyed by member id.
export const Members = Schema.Record(Schema.String, Member);

export type Members = typeof Members.Type;

export const Typing = Schema.Struct({
  memberId: Schema.String,
  at: Schema.Number,
  id: Schema.String,
});

export type Typing = typeof Typing.Type;

export type ChannelStatus =
  | { readonly state: "attached"; readonly resumed: boolean }
  | { readonly state: "suspended"; readonly reason: string }
  | { readonly state: "failed"; readonly reason: string };

export interface CollabChannel {
  readonly onStatus: (listener: (status: ChannelStatus) => void) => () => void;
  readonly presence: {
    readonly subscribe: (listener: (members: Members) => void) => () => void;
    readonly enter: (member: Member) => Promise<void>;
    readonly leave: () => Promise<void>;
  };
  // The SDK awaits the listener's promise before delivering the next message on this channel.
  readonly subscribe: (event: "typing", listener: (message: Typing) => Promise<void>) => () => void;
  // Resolves on the server's ack; rejects on a refusal, or when the connection drops before the ack.
  readonly publish: (event: "typing", message: Typing) => Promise<void>;
}

export class CollabClient extends Context.Service<
  CollabClient,
  {
    // A channel by name, shared and reference-counted: the last `release` detaches it.
    readonly acquire: (name: string) => CollabChannel;
    readonly release: (name: string) => void;
  }
>()("DispatchDesk/CollabClient") {}

// The SDK ended a channel for good (its own retries spent, or auth revoked). Terminal for the session.
export class CollabFailed extends Schema.TaggedError<CollabFailed>()("CollabFailed", {
  reason: Schema.String,
}) {}

// The SDK was disconnected from the channel: the reason it reports, typed author data for `Feed.down` (SR15).
export class CollabDown extends Schema.TaggedError<CollabDown>()("CollabDown", {
  reason: Schema.String,
}) {}

// A publish the SDK could not deliver (dropped before the ack, or refused).
export class PublishLost extends Schema.TaggedError<PublishLost>()("PublishLost", {}) {}

export const ticketChannel = (key: { workspaceId: string; ticketId: string }) =>
  `ticket:${key.workspaceId}:${key.ticketId}`;

export const technicianChannel = (key: { workspaceId: string; technicianId: string }) =>
  `technician:${key.workspaceId}:${key.technicianId}`;
