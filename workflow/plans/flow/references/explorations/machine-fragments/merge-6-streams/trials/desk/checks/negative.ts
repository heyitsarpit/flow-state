// Claims the spec makes as "compile error", tried against the stand-in. Each `@ts-expect-error` must fire, or tsc reports it unused.
// That checks the stand-in against the spec's words, not Flow. Not formatted: a directive must sit on the line above its error.
import { Effect, Schema, Stream } from "effect";
import { Feed, definition, stream } from "flow-state";
import { Cursor, SignedOut, SocketDropped, TicketEvent } from "@desk/features/Tickets/types.js";

const input = { workspaceId: Schema.String };
const none = Stream.empty;
const done = Effect.succeed(Feed.done([]));
const Entry = Schema.Struct({ id: Schema.String, cursor: Cursor });

// A: `idle` is required exactly when `reconnect` is present.
// @ts-expect-error reconnect without idle
stream({ id: "a", input, output: TicketEvent, key: ["workspaceId"], delivers: "every", errors: [SocketDropped], reconnect: { while: ["SocketDropped"] }, subscribe: () => none });
// @ts-expect-error idle without reconnect
stream({ id: "b", input, output: TicketEvent, key: ["workspaceId"], delivers: "every", errors: [SocketDropped], idle: "45 seconds", subscribe: () => none });

// B: `while` names tags of `errors`.
// @ts-expect-error a tag that is not in errors
stream({ id: "c", input, output: TicketEvent, key: ["workspaceId"], delivers: "every", errors: [SocketDropped], idle: "45 seconds", reconnect: { while: ["Nope"] }, subscribe: () => none });

// C: `catchUp` requires `position`; `latest` takes neither.
// @ts-expect-error catchUp without position
stream({ id: "d", input, output: Entry, key: ["workspaceId"], delivers: "every", subscribe: () => none, catchUp: () => done });
// @ts-expect-error latest with position
stream({ id: "e", input, output: Entry, key: ["workspaceId"], delivers: "latest", position: "cursor", subscribe: () => none });

// D: `restartAt` carries a position, so a feed with none cannot emit it.
// @ts-expect-error restartAt on a stream with no position
stream({ id: "f", input, output: TicketEvent, key: ["workspaceId"], delivers: "every", subscribe: () => Stream.make(Feed.live({ restartAt: { epoch: 1, seq: 0 } })) });
// @ts-expect-error `at` of the wrong type
stream({ id: "g", input, output: Entry, key: ["workspaceId"], delivers: "every", position: "cursor", subscribe: () => Stream.make(Feed.live({ at: "x" })) });

// E: outcomes, on one real contract.
const feed = stream({ id: "h", input, output: Entry, key: ["workspaceId"], delivers: "every", position: "cursor", errors: [SocketDropped, SignedOut], idle: "45 seconds", reconnect: { while: ["SocketDropped"] }, subscribe: () => none, catchUp: () => done });
const noCatchUp = stream({ id: "i", input, output: Entry, key: ["workspaceId"], delivers: "every", subscribe: () => none });

definition({
  id: "x", states: ["A"], events: {}, internalEvents: { V: { id: Schema.String }, M: {}, F: {} }, memory: { items: Schema.Array(Schema.String) },
  operations: ({ E }) => ({
    // @ts-expect-error `missed` is required on an `every` stream a machine consumes
    one: feed.outcomes({ value: E.V.from((v) => ({ id: v.id })), fills: "items", failure: { SignedOut: E.F, Feed: E.F } }),
    // @ts-expect-error `failure` must name SignedOut (SocketDropped is retried by the default and need not be named)
    two: feed.outcomes({ value: E.V.from((v) => ({ id: v.id })), missed: E.M, fills: "items", failure: { Feed: E.F } }),
    // @ts-expect-error `Banned` is not in `errors`
    three: feed.outcomes({ value: E.V.from((v) => ({ id: v.id })), missed: E.M, fills: "items", failure: { SignedOut: E.F, Feed: E.F, Banned: E.F } }),
    // @ts-expect-error `pages` needs `catchUp` (this contract has none)
    four: noCatchUp.outcomes({ value: E.V.from((v) => ({ id: v.id })), pages: E.V.from(() => ({ id: "" })), missed: E.M, fills: false, failure: { Feed: E.F } }),
    // NOT an error, and the spec gives no way for it to be: `fills` names a memory field and `outcomes` cannot see the memory.
    // Only Inspection's `FillsUntouched` catches this, at run time, and it fails no build.
    five: feed.outcomes({ value: E.V.from((v) => ({ id: v.id })), missed: E.M, fills: "no such field", failure: { SignedOut: E.F, Feed: E.F } }),
  }),
});
