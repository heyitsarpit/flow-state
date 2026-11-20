// The raw workspace socket, as a Stream of decoded frames. 1): feed.contracts.ts
// wraps `DeskSocket.frames` in `reconnect` and turns `hello` / `reset` into `Feed.live`. This
// file knows the wire only: it names no Flow API, so it type-checks with Effect alone.
//
// Protocol: the server's first frame is its registration, either `hello` (it registered the
// workspace and, if it could, replayed from the `after` it echoes) or `reset` (the log restarted in
// a new epoch). It pings every 20 s. Close code 4401 means the token expired.
import { Context, Effect, Schema, type Stream } from "effect";
import { ActivityEntry, Cursor, SignedOut, SocketDropped, TicketEvent } from "../types.js";

export const DeskFrame = Schema.Union([
  Schema.Struct({ t: Schema.Literal("hello"), replayedFrom: Schema.optional(Cursor) }),
  Schema.Struct({ t: Schema.Literal("reset"), epoch: Schema.Int }),
  Schema.Struct({ t: Schema.Literal("change"), event: TicketEvent }),
  Schema.Struct({ t: Schema.Literal("activity"), entry: ActivityEntry }),
  Schema.Struct({ t: Schema.Literal("ping") }),
]);

export type DeskFrame = typeof DeskFrame.Type;

// Text from the socket to a frame. A frame the schema rejects drops the connection: the retry
// reconnects and replays, which is safer than guessing what a half-understood frame meant.
export const decodeFrame = (text: string): Effect.Effect<DeskFrame, SocketDropped> =>
  Schema.decodeUnknownEffect(Schema.fromJsonString(DeskFrame))(text).pipe(
    Effect.mapError(() => new SocketDropped({ why: "BadFrame" })),
  );

// What a close code means. 4401 is terminal; every other close, including 1006 (no close frame
// at all), is transient. The adapter classifies; the machine never reads a code (SR15).
export const closedWith = (code: number): SocketDropped | SignedOut =>
  code === 4401 ? new SignedOut() : new SocketDropped({ why: `Closed${String(code)}` });

export class DeskSocket extends Context.Service<
  DeskSocket,
  {
    // `from` is the position the caller last handled; the server replays after it when it can.
    frames: (
      workspaceId: string,
      from: Cursor | undefined,
    ) => Stream.Stream<DeskFrame, SocketDropped | SignedOut>;
  }
>()("DispatchDesk/DeskSocket") {}
