// the feed's adapter, as a service, as `ChatSocket` is. It turns `DeskSocket`'s frames into values and
// Feed's signals. The contract below calls it as `commit` calls `StripeApi`, and `E` is inferred from the service.
import { Context, Effect, Layer, Stream } from "effect";
import { Feed } from "flow-state";
import {
  type ActivityEntry,
  type Cursor,
  type SignedOut,
  type SocketDropped,
  type TicketEvent,
  sameCursor,
} from "../types.js";
import { type DeskFrame, DeskSocket } from "./desk-socket.js";

const show = (cursor: Cursor) => `${String(cursor.epoch)}:${String(cursor.seq)}`;

// The server's first frame registers. Two switches, not one: `restartAt` carries a position, and a feed with none has `P = never`.
const hello = (frame: Extract<DeskFrame, { t: "hello" }>, from: Cursor | undefined) =>
  frame.replayedFrom !== undefined && sameCursor(frame.replayedFrom, from)
    ? Feed.live({ proof: `server replayed from ${show(frame.replayedFrom)}` }) // only on the server's echo of this `from`
    : Feed.live(); // registered, nothing proven (the wire has no head to give)

const ticketSignals = (frame: DeskFrame): ReadonlyArray<TicketEvent | Feed.Signal> => {
  switch (frame.t) {
    case "hello":
      return [hello(frame, undefined)];
    case "reset":
      return [Feed.live()]; // no position here: `listen` refetches what a start cannot prove
    case "ping":
      return [Feed.ping];
    case "change":
      return [frame.event];
    case "activity":
      return [];
  }
};

const activitySignals =
  (from: Cursor | undefined) =>
  (frame: DeskFrame): ReadonlyArray<ActivityEntry | Feed.Signal<Cursor>> => {
    switch (frame.t) {
      case "hello":
        return [hello(frame, from)];
      case "reset":
        return [Feed.live({ restartAt: { epoch: frame.epoch, seq: 0 } })];
      case "ping":
        return [Feed.ping];
      case "activity":
        return [frame.entry];
      case "change":
        return [];
    }
  };

export class DeskFeedSocket extends Context.Service<
  DeskFeedSocket,
  {
    readonly changes: (
      workspaceId: string,
    ) => Stream.Stream<TicketEvent | Feed.Signal, SocketDropped | SignedOut>;
    readonly activity: (
      workspaceId: string,
      from: Cursor | undefined,
    ) => Stream.Stream<ActivityEntry | Feed.Signal<Cursor>, SocketDropped | SignedOut>;
  }
>()("DispatchDesk/DeskFeedSocket") {
  static readonly layer = Layer.effect(
    DeskFeedSocket,
    Effect.map(DeskSocket, (socket) => ({
      changes: (workspaceId: string) =>
        socket
          .frames(workspaceId, undefined)
          .pipe(Stream.flatMap((frame) => Stream.fromIterable(ticketSignals(frame)))),
      activity: (workspaceId: string, from: Cursor | undefined) =>
        socket
          .frames(workspaceId, from)
          .pipe(Stream.flatMap((frame) => Stream.fromIterable(activitySignals(from)(frame)))),
    })),
  );
}
