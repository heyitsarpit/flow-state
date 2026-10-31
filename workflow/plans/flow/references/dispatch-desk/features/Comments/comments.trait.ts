// Comments, a writing root trait: one ticket's thread of `Comment` records, the posts waiting to join it, and
// what a reader does to a comment (edit, delete, pin, react, mark read).
//
// How this module is different (COVERAGE.md 5.1): the only fragment placed on two hosts with `resetOn`; the only
// entity owned by a fragment (CommentsDomain, registered for whichever actor places it, rule 49); the only
// `serialize` lane inside a fragment; and manual re-sends only.
//
// Two hosts place it: the editor at its root (`comments: Comments`, subject path `[]`) and the queue's preview
// drawer (`preview: Comments` with `resetOn` on the previewed ticket, subject path `[ticketId]`, rule 51). A trait
// cannot know which, so every mapped write maps `failure.NotSent` (another path's commit is declined `Rejected`).
//
// The post lane is the ticket, `serialize`: posts go one at a time in the order typed, and the lane's
// addressable Attempt is the head of that FIFO (rule N2). An unconfirmed head HOLDS the queue: nothing typed after
// it is sent while it may still land, so the thread can never show a reply above the comment it answers. Nothing
// re-sends it on a timer. The draft says "may not have saved" and offers two buttons: Resend (the same Attempt, so
// the server dedupes) and Give up (release the head; the next post goes). That is the user's decision, because a
// conversation is not a background sync. Compare the editor's title, which re-sends on a schedule.
//
// No `whenAbandoned: [O.post.cancel]` (rule 60): a comment someone wrote is user intent, so leaving keeps the post
// going and the next incarnation with the same path adopts its ending (rule 54). Rule 56's default guard is left
// off on the queue on purpose; its Story "A, B, A" walks the parked case.
import { Schema } from "effect";
import { deny, Flow, trait } from "flow-state";
import { CommentsDomain } from "./comments.domain.js";
import { react, reactionsOn } from "./comments.contracts.js";
import type { Reactions } from "./comments-api.js";

export const MAX_RESENDS = 3; // user-defined: how many times "Resend" may re-send one unconfirmed post

// Why a draft is not going to the thread. `null` means it is on its way (the lane says whether it is on the
// wire, waiting in the FIFO, or unconfirmed).
const Problem = Schema.Literals(["unsure", "rejected", "notSent", "gaveUp", "ticketGone"]);

// A draft is what the author typed, kept until the thread holds it. It never has a thread id: a comment the
// server has not returned is not in the list (rule 33). `sent` is "the server said yes", shown as "Sent" until the
// thread holds the real row.
export const Draft = Schema.Struct({
  clientId: Schema.String,
  text: Schema.String,
  sent: Schema.Boolean,
  problem: Schema.NullOr(Problem),
  reason: Schema.NullOr(Schema.String), // the server's words for a rejected text
});

export type Draft = typeof Draft.Type;

type Mine = { clientId: string; text: string };

// Add the draft if this incarnation has never seen it (an adopted ending after a reset or a reload: rule 55, the
// event carries the text), otherwise change what the patch names.
const upsert = (drafts: ReadonlyArray<Draft>, mine: Mine, patch: Partial<Draft> = {}) =>
  drafts.some((d) => d.clientId === mine.clientId)
    ? drafts.map((d) => (d.clientId === mine.clientId ? { ...d, ...patch } : d))
    : [...drafts, { ...mine, sent: false, problem: null, reason: null, ...patch }];

// Every post ending names its draft the same way: from the input the commit carried.
const mine = (_ending: unknown, { input }: { input: Mine }): Mine => ({
  clientId: input.clientId,
  text: input.text,
});

// The predicted look of a reaction: the store's entry, one count moved. Plain data in the plain resource.
const bump = (
  current: Reactions | undefined,
  r: { commentId: string; emoji: string; on: boolean },
) => {
  const counts = current?.[r.commentId] ?? {};
  const count = Math.max(0, (counts[r.emoji] ?? 0) + (r.on ? 1 : -1));

  return { ...current, [r.commentId]: { ...counts, [r.emoji]: count } };
};

const CommentId = { commentId: Schema.String };

export const Comments = trait(
  {
    id: "Comments",
    events: {
      Post: { clientId: Schema.String, text: Schema.String }, // the view mints `clientId` (2.9.5)
      Resend: { clientId: Schema.String }, // an unconfirmed head: the same Attempt; a draft never sent: a new one
      GiveUp: { clientId: Schema.String }, // release an unconfirmed head; the post may still land
      Discard: { clientId: Schema.String },
      Edit: { ...CommentId, text: Schema.String },
      Delete: CommentId,
      Pin: { ...CommentId, pinned: Schema.Boolean },
      React: { ...CommentId, emoji: Schema.String, on: Schema.Boolean },
      MarkRead: { at: Schema.Number }, // the view's `useNow` reading: a click has a time, the select reads no clock
      LoadOlder: {},
      Refresh: {},
    },
    internalEvents: {
      ThreadLoaded: { clientIds: Schema.Array(Schema.String) },
      ThreadGone: {},
      ThreadFailed: {},
      Posted: { clientId: Schema.String, text: Schema.String },
      PostRejected: { clientId: Schema.String, text: Schema.String, reason: Schema.String },
      PostNotSent: { clientId: Schema.String, text: Schema.String },
      PostGone: { clientId: Schema.String, text: Schema.String },
      PostUnsure: Flow.uncertain({ clientId: Schema.String, text: Schema.String }),
      Changed: {}, // an edit, delete, pin or read landed: the store shows it, memory has nothing to write
      ChangeRefused: { notice: Schema.String },
      // One unknown event per keyed operation whose handler acts on its lane (rule 43): key-less there.
      EditUnsure: Flow.uncertain({}),
      DeleteUnsure: Flow.uncertain({}),
      PinUnsure: Flow.uncertain({}),
      ReadUnsure: Flow.uncertain({}),
      Reacted: {},
      ReactUnsure: Flow.uncertain({}),
    },
    callbacks: {
      // The ticket does not exist (any more): the editor closes itself, the preview shows its notice.
      onTicketGone: Flow.optional(Flow.Callback({})),
    },
    memory: {
      workspaceId: Flow.input(Schema.String),
      ticketId: Flow.input(Schema.String), // "" while the queue previews nothing
      drafts: Flow.initial(Schema.Array(Draft), []),
      notice: Flow.initial(Schema.String, ""),
    },
    operations: ({ E }) => {
      const refused = (notice: string) => E.ChangeRefused.from(() => ({ notice }));

      return {
        // The thread and the "Pinned" strip: two placements of one domain read, with different inputs.
        // design gap: what a paged live read's `value` mapper receives is not said; here it is every loaded page,
        // as the row's `data` is (the queue reads `operations.list?.data` the same way).
        thread: CommentsDomain.thread.outcomes({
          value: E.ThreadLoaded.from((pages) => ({
            clientIds: pages.flatMap((page) => page.comments.map((c) => c.clientId)),
          })),
          failure: {
            TicketNotFound: E.ThreadGone,
            NoResponse: E.ThreadFailed, // a lost read (REVIEW gap 34)
            Defect: E.ThreadFailed, // a read's tag record maps Flow's two (rule 37)
            Interrupted: E.ThreadFailed,
          },
        }),
        pinned: CommentsDomain.thread, // bare: the strip reads its rows
        reactions: reactionsOn, // bare: the counts are the row's data
        post: CommentsDomain.post.outcomes({
          success: E.Posted.from(mine),
          failure: {
            TicketNotFound: E.PostGone.from(mine),
            CommentRejected: E.PostRejected.from((e, ctx) => ({
              ...mine(e, ctx),
              reason: e.reason,
            })),
            // Rejected (another path's lane), Overloaded (a 65th post), Restored (a reload before the send)
            NotSent: E.PostNotSent.from(mine),
          },
          unknown: E.PostUnsure.from(mine), // StillUnknown too (rule 18)
        }),
        edit: CommentsDomain.edit.outcomes({
          success: E.Changed,
          failure: {
            EditWindowClosed: refused("Comments can be edited for fifteen minutes"),
            CommentGone: refused("That comment was deleted"),
            CommentRejected: refused("A comment needs text"),
            NotSent: refused("That edit was not sent"),
          },
          unknown: E.EditUnsure,
        }),
        remove: CommentsDomain.remove.outcomes({
          success: E.Changed,
          failure: {
            EditWindowClosed: refused("Past the edit window: the comment stays"), // the store restored it (E3)
            CommentGone: E.Changed, // already gone: what the user wanted
            NotSent: refused("That delete was not sent"),
          },
          unknown: E.DeleteUnsure,
        }),
        pin: CommentsDomain.pin.outcomes({
          success: E.Changed,
          failure: {
            CommentGone: refused("That comment was deleted"),
            NotSent: refused("Not pinned"),
          },
          unknown: E.PinUnsure,
        }),
        markRead: CommentsDomain.markRead.outcomes({
          success: E.Changed,
          failure: { NotSent: E.Changed }, // Overloaded past 4,096 comments: nothing marked, nothing to say
          unknown: E.ReadUnsure,
        }),
        // A plain write (no domain): its look is the commit's `optimistic`, removed on a failure (2.7.1).
        react: react.outcomes({
          success: E.Reacted,
          failure: { CommentGone: E.Reacted, NotSent: E.Reacted },
          unknown: E.ReactUnsure,
        }),
      };
    },
  },
  ({ E, O, callbacks }) => {
    const ticketKey = ({ memory }: { memory: { workspaceId: string; ticketId: string } }) => ({
      workspaceId: memory.workspaceId,
      ticketId: memory.ticketId,
    });
    const commentKey = ({
      memory,
      event,
    }: {
      memory: { workspaceId: string; ticketId: string };
      event: { commentId: string };
    }) => ({ ...ticketKey({ memory }), commentId: event.commentId });
    const noTicket = ({ memory }: { memory: { ticketId: string } }) =>
      memory.ticketId !== "" || deny("NoTicket");
    const draftOf = (drafts: ReadonlyArray<Draft>, clientId: string) =>
      drafts.find((d) => d.clientId === clientId);
    const isDraft =
      (problems: ReadonlyArray<Draft["problem"]>, code: string) =>
      ({
        memory,
        event,
      }: {
        memory: { drafts: ReadonlyArray<Draft> };
        event: { clientId: string };
      }) =>
        problems.includes(draftOf(memory.drafts, event.clientId)?.problem ?? null) || deny(code);

    const send = O.post.commit(({ memory, event }) => ({
      ...ticketKey({ memory }),
      clientId: event.clientId,
      text: event.text,
    }));

    // A draft that never left is sent again as a new write (a definite failure sent nothing, rule 19).
    const sendAgain = O.post.commit(({ memory, event }) => ({
      ...ticketKey({ memory }),
      clientId: event.clientId,
      text: draftOf(memory.drafts, event.clientId)?.text ?? "",
    }));

    const notice = ({ event }: { event: { notice: string } }) => ({ notice: event.notice });

    return {
      // Placed for the incarnation's life. Nothing is read for a drawer that previews nothing.
      activities: [
        O.thread.subscribe(ticketKey, { when: ({ memory }) => memory.ticketId !== "" }),
        O.pinned.subscribe(({ memory }) => ({ ...ticketKey({ memory }), pinned: true }), {
          when: ({ memory }) => memory.ticketId !== "",
        }),
        O.reactions.subscribe(ticketKey, { when: ({ memory }) => memory.ticketId !== "" }),
      ],

      on: {
        // No `idle` guard: the lane is a FIFO, so a post while another is on the wire queues behind it and the
        // row's `outstanding` counts it ("2 more waiting"). The 65th is declined `Overloaded` (PostNotSent).
        Post: {
          target: "self",
          guard: [
            noTicket, // the queue's preview has ticketId "" while it previews nothing: no post into ticket ""
            ({ event }) => event.text.trim() !== "" || deny("EmptyComment"),
            ({ memory, event }) =>
              !draftOf(memory.drafts, event.clientId) || deny("DuplicateDraft"),
          ],
          updateMemory: ({ memory, event }) => ({ drafts: upsert(memory.drafts, event) }),
          actions: [send],
        },
        // Two meanings, by the draft: an unconfirmed head is re-sent as the same Attempt (the FIFO's head is the
        // lane's addressable Attempt, rule N2), within a budget; a draft that never left is a new write.
        Resend: [
          {
            target: "self",
            guard: [
              isDraft(["unsure"], "NotUnsure"),
              O.post.retryable(ticketKey, { times: MAX_RESENDS }),
            ],
            updateMemory: ({ memory, event }) => ({
              drafts: memory.drafts.map((d) =>
                d.clientId === event.clientId ? { ...d, problem: null } : d,
              ),
            }),
            actions: [O.post.retry(ticketKey)],
          },
          {
            target: "self",
            guard: [noTicket, isDraft(["notSent"], "NotResendable")],
            updateMemory: ({ memory, event }) => ({
              drafts: memory.drafts.map((d) =>
                d.clientId === event.clientId ? { ...d, problem: null, reason: null } : d,
              ),
            }),
            actions: [sendAgain],
          },
        ],
        // Release the head: the server may still have it, the thread will say. The next post is promoted at once.
        GiveUp: {
          target: "self",
          guard: [isDraft(["unsure"], "NotUnsure")],
          updateMemory: ({ memory, event }) => ({
            drafts: memory.drafts.map((d) =>
              d.clientId === event.clientId ? { ...d, problem: "gaveUp" } : d,
            ),
          }),
          actions: [O.post.cancel(ticketKey)],
        },
        // Only a draft that is going nowhere may be discarded: a queued or unconfirmed post may still land.
        Discard: {
          target: "self",
          guard: [isDraft(["notSent", "rejected", "gaveUp", "ticketGone"], "StillGoing")],
          updateMemory: ({ memory, event }) => ({
            drafts: memory.drafts.filter((d) => d.clientId !== event.clientId),
          }),
        },

        Edit: {
          target: "self",
          guard: [
            ({ event }) => event.text.trim() !== "" || deny("EmptyComment"),
            O.edit.idle(commentKey),
          ],
          actions: [
            O.edit.commit(({ memory, event }) => ({
              ...commentKey({ memory, event }),
              text: event.text,
            })),
          ],
        },
        Delete: {
          target: "self",
          guard: [O.remove.idle(commentKey)],
          actions: [O.remove.commit(commentKey)],
        },
        Pin: {
          target: "self",
          guard: [O.pin.idle(commentKey)],
          actions: [
            O.pin.commit(({ memory, event }) => ({
              ...commentKey({ memory, event }),
              pinned: event.pinned,
            })),
          ],
        },
        // The unread comments come from the thread's rows in the pre-turn snapshot, never from the click.
        MarkRead: {
          target: "self",
          guard: [noTicket, O.markRead.idle(ticketKey)],
          actions: [
            O.markRead.commit(({ memory, event, operations }) => ({
              ...ticketKey({ memory }),
              comments: (operations.thread?.data?.flatMap((page) => page.comments) ?? [])
                .filter((c) => c.readAt === null)
                .map((c) => ({
                  workspaceId: c.workspaceId,
                  ticketId: c.ticketId,
                  commentId: c.commentId,
                })),
              at: event.at,
            })),
          ],
        },
        // `optimistic` is the commit's only option (OD26) and reads the starting turn's after memory (rule 36).
        // design gap: `setData`'s `data` is written as an updater of the entry's current value; 3.4 passes a value.
        React: {
          target: "self",
          actions: [
            O.react.commit(
              ({ memory, event }) => ({
                ...commentKey({ memory, event }),
                emoji: event.emoji,
                on: event.on,
              }),
              {
                optimistic: [
                  reactionsOn.setData(({ memory, input }) => ({
                    key: ticketKey({ memory }),
                    data: (current: Reactions | undefined) => bump(current, input),
                  })),
                ],
              },
            ),
          ],
        },
        // PROPOSED, not decided: `more` on a paged live read is the plan's (gap 23); here it pages backwards.
        LoadOlder: { target: "self", guard: [noTicket], actions: [O.thread.more(ticketKey)] },
        Refresh: { target: "self", actions: [O.thread.refetch] },

        // The thread holds a draft's id: the draft's job is done (rule 33).
        ThreadLoaded: {
          target: "self",
          updateMemory: ({ memory, event }) => ({
            drafts: memory.drafts.filter((d) => !event.clientIds.includes(d.clientId)),
          }),
        },
        ThreadGone: { target: "self", notify: [callbacks.onTicketGone] },
        ThreadFailed: { target: "self" }, // the row's Failure shows; "Refresh" asks again

        Posted: {
          target: "self",
          updateMemory: ({ memory, event }) => ({
            drafts: upsert(memory.drafts, event, { sent: true, problem: null }),
          }),
        },
        PostRejected: {
          target: "self",
          updateMemory: ({ memory, event }) => ({
            drafts: upsert(memory.drafts, event, { problem: "rejected", reason: event.reason }),
          }),
        },
        PostNotSent: {
          target: "self",
          updateMemory: ({ memory, event }) => ({
            drafts: upsert(memory.drafts, event, { problem: "notSent" }),
          }),
        },
        PostGone: {
          target: "self",
          updateMemory: ({ memory, event }) => ({
            drafts: upsert(memory.drafts, event, { problem: "ticketGone" }),
          }),
          notify: [callbacks.onTicketGone],
        },
        // The head is held. Nothing re-sends it: Resend and GiveUp are the owner (rule 45).
        PostUnsure: {
          target: "self",
          updateMemory: ({ memory, event }) => ({
            drafts: upsert(memory.drafts, event, { problem: "unsure" }),
          }),
        },

        Changed: { target: "self", updateMemory: () => ({ notice: "" }) },
        ChangeRefused: { target: "self", updateMemory: notice },
        // An edit, delete, pin or read that may have landed: send it once more as the same Attempt, then release
        // it. The record stays marked uncertain until a later write to it succeeds (rule 32).
        EditUnsure: [
          { target: "self", guard: [O.edit.retryable({ times: 1 })], actions: [O.edit.retry] },
          {
            target: "self",
            updateMemory: () => ({ notice: "We couldn't confirm that edit" }),
            actions: [O.edit.cancel],
          },
        ],
        DeleteUnsure: [
          { target: "self", guard: [O.remove.retryable({ times: 1 })], actions: [O.remove.retry] },
          {
            target: "self",
            updateMemory: () => ({ notice: "We couldn't confirm that delete" }),
            actions: [O.remove.cancel],
          },
        ],
        PinUnsure: { target: "self", actions: [O.pin.cancel] },
        ReadUnsure: { target: "self", actions: [O.markRead.cancel] },
        Reacted: { target: "self" },
        ReactUnsure: { target: "self", actions: [O.react.cancel] }, // release; the look stays marked uncertain
      },
    };
  },
);
