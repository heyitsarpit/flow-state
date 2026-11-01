// TRIAL (proposal-v3.md): who has a ticket open, and who is typing in it, over the collaboration SDK.
// Two sessions on one channel: the viewers (latest: the set, each time) and typing (every: each message once).
import { Schema } from "effect";
import { definition, Flow } from "flow-state";
import type { CollabFailed } from "@desk/features/Presence/collab-sdk.js";
import { ViewerBadge } from "../../standin/viewer-badge.js";
import { typingIn, ticketViewers, typingPing } from "./presence.contracts.js";

export const TYPING_SHOWN_MS = 4_000;

export const Presence = definition({
  id: "DispatchDesk/Presence",
  states: ["WATCHING", "ENDED"],
  events: { Typed: { memberId: Schema.String, at: Schema.Number } },
  internalEvents: {
    Viewers: { ids: Schema.Array(Schema.String) },
    Typing: { memberId: Schema.String, at: Schema.Number, id: Schema.String },
    MayHaveMissed: {}, // CUT: why, initial
    Ended: { reason: Schema.String },
  },
  memory: {
    workspaceId: Flow.input(Schema.String),
    ticketId: Flow.input(Schema.String),
    viewerIds: Flow.initial(Schema.Array(Schema.String), []), // the `of:` list of `badges`
    typing: Flow.initial(Schema.Record(Schema.String, Schema.Number), {}), // memberId -> when
    reason: Flow.initial(Schema.String, ""),
  },
  traits: { badges: ViewerBadge.each({ of: "viewerIds", max: 20 }) },
  operations: ({ E }) => {
    const gaveUp = E.Ended.from((e: CollabFailed) => ({ reason: e.reason })); // the SDK's own words. Hoisted, so `e` is annotated
    const broke = E.Ended.from((e: { readonly _tag: string }) => ({
      reason: e._tag.toLowerCase(),
    })); // NEW: Feed. One line replaces four constant entries

    return {
      viewers: ticketViewers.outcomes({
        value: E.Viewers.from((members) => ({ ids: Object.keys(members) })),
        failure: { CollabFailed: gaveUp, Feed: broke },
      }),
      typing: typingIn.outcomes({
        value: E.Typing.from((t) => ({ memberId: t.memberId, at: t.at, id: t.id })),
        missed: E.MayHaveMissed, // required by the type (Q4)
        fills: false, // NEW: fills. Typing is a pruned map of who typed lately, not this feed's items: nothing to be void against
        failure: { CollabFailed: gaveUp, Feed: broke },
      }),
      ping: typingPing, // bare: fire and forget
    };
  },
});
