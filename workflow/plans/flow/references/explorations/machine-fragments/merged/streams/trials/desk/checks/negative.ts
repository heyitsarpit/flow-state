// Claims the spec makes as "compile error", tried against the stand-in. Each `@ts-expect-error` must fire, or tsc reports it unused.
// That checks the stand-in against the spec's words, not Flow. Not formatted: a directive must sit on the line above its error.
import { Effect, Schema, Stream } from "effect";
import { Feed, definition, stream } from "flow-state";
import { Cursor, SignedOut, SocketDropped, TicketEvent } from "@desk/features/Tickets/types.js";

const input = { workspaceId: Schema.String };
const Entry = Schema.Struct({ id: Schema.String, cursor: Cursor });
const dropped = Stream.fail(new SocketDropped({ why: "x" }));
const droppedOrOut = Stream.fail(new SignedOut());
const done = Effect.succeed(Feed.done({ items: [], proof: "p" }));
const lost = Effect.fail(new SocketDropped({ why: "x" }));

// A: `idleTime` is required exactly when `reconnect` is present.
// @ts-expect-error reconnect without idleTime
stream({ id: "a", input, output: TicketEvent, key: ["workspaceId"], delivers: "every", subscribe: () => dropped, reconnect: { while: (e) => e._tag === "SocketDropped" } });
// @ts-expect-error idleTime without reconnect
stream({ id: "b", input, output: TicketEvent, key: ["workspaceId"], delivers: "every", subscribe: () => dropped, idleTime: "45 seconds" });
// "Infinity" is a duration here (3.2)
stream({ id: "b2", input, output: TicketEvent, key: ["workspaceId"], delivers: "every", subscribe: () => dropped, reconnect: {}, idleTime: "Infinity" });

// B: `while` is a predicate over E, which `subscribe` and `catchUp` fix.
stream({ id: "c", input, output: TicketEvent, key: ["workspaceId"], delivers: "every", subscribe: () => dropped, reconnect: { while: (e) => e._tag === "SocketDropped" }, idleTime: "45 seconds" });
// @ts-expect-error a tag that no error has
stream({ id: "c2", input, output: TicketEvent, key: ["workspaceId"], delivers: "every", subscribe: () => dropped, reconnect: { while: (e) => e._tag === "Nope" }, idleTime: "45 seconds" });
// catchUp's errors reach `while` when `reconnect` is written after it (3.2's typing rule)
stream({ id: "c3", input, output: Entry, key: ["workspaceId"], delivers: "every", position: "cursor", subscribe: () => droppedOrOut, catchUp: () => lost, reconnect: { while: (e) => e._tag === "SocketDropped" || e._tag === "SignedOut" }, idleTime: "45 seconds" });

// C: `catchUp` requires `position`; `latest` takes neither.
// @ts-expect-error catchUp without position
stream({ id: "d", input, output: Entry, key: ["workspaceId"], delivers: "every", subscribe: () => dropped, catchUp: () => done });
// @ts-expect-error latest with position
stream({ id: "e", input, output: Entry, key: ["workspaceId"], delivers: "latest", position: "cursor", subscribe: () => dropped });

// D: `restartAt` and `head` carry a position, so a feed with none cannot emit them.
// @ts-expect-error restartAt on a stream with no position
stream({ id: "f", input, output: TicketEvent, key: ["workspaceId"], delivers: "every", subscribe: () => Stream.make(Feed.live({ restartAt: { epoch: 1, seq: 0 } })) });
// @ts-expect-error `head` of the wrong type
stream({ id: "g", input, output: Entry, key: ["workspaceId"], delivers: "every", position: "cursor", subscribe: () => Stream.make(Feed.live({ head: "x" })) });

// E: outcomes, on one real contract.
const feed = stream({ id: "h", input, output: Entry, key: ["workspaceId"], delivers: "every", position: "cursor", subscribe: () => droppedOrOut, catchUp: () => lost, reconnect: { while: (e) => e._tag === "SocketDropped" }, idleTime: "45 seconds" });
const noCatchUp = stream({ id: "i", input, output: Entry, key: ["workspaceId"], delivers: "every", subscribe: () => Stream.empty });

definition({
  id: "x", states: ["A"], events: {}, internalEvents: { V: { id: Schema.String }, M: {}, F: {} }, memory: { items: Schema.Array(Schema.String), roomId: Schema.String, flag: Schema.Boolean, count: Schema.Number, by: Schema.Record(Schema.String, Schema.Number) },
  operations: ({ E }) => ({
    // @ts-expect-error `missed` is required on an `every` stream a machine consumes
    one: feed.outcomes({ value: E.V.from((v) => ({ id: v.id })), fills: "items", failure: { SignedOut: E.F, SocketDropped: E.F, Feed: E.F } }),
    // @ts-expect-error `failure` is exhaustive over E: the retried `SocketDropped` stays in the map (3.5)
    two: feed.outcomes({ value: E.V.from((v) => ({ id: v.id })), missed: E.M, fills: "items", failure: { SignedOut: E.F, Feed: E.F } }),
    // @ts-expect-error `Banned` is not in E
    three: feed.outcomes({ value: E.V.from((v) => ({ id: v.id })), missed: E.M, fills: "items", failure: { SignedOut: E.F, SocketDropped: E.F, Feed: E.F, Banned: E.F } }),
    // @ts-expect-error `pages` needs `catchUp` (this contract has none)
    four: noCatchUp.outcomes({ value: E.V.from((v) => ({ id: v.id })), pages: E.V.from(() => ({ id: "" })), missed: E.M, fills: false, failure: { Feed: E.F } }),
    // @ts-expect-error `fills` names a field of this memory: a misspelling does not compile (3.6)
    five: feed.outcomes({ value: E.V.from((v) => ({ id: v.id })), missed: E.M, fills: "no such field", failure: { SignedOut: E.F, SocketDropped: E.F, Feed: E.F } }),
    // @ts-expect-error a string is not an emptiness (3.6)
    six: feed.outcomes({ value: E.V.from((v) => ({ id: v.id })), missed: E.M, fills: "roomId", failure: { SignedOut: E.F, SocketDropped: E.F, Feed: E.F } }),
    // @ts-expect-error nor is a boolean
    seven: feed.outcomes({ value: E.V.from((v) => ({ id: v.id })), missed: E.M, fills: "flag", failure: { SignedOut: E.F, SocketDropped: E.F, Feed: E.F } }),
    // a number and a Record are
    eight: feed.outcomes({ value: E.V.from((v) => ({ id: v.id })), missed: E.M, fills: "count", failure: { SignedOut: E.F, SocketDropped: E.F, Feed: E.F } }),
    nine: feed.outcomes({ value: E.V.from((v) => ({ id: v.id })), missed: E.M, fills: "by", failure: { SignedOut: E.F, SocketDropped: E.F, Feed: E.F } }),
  }),
});
