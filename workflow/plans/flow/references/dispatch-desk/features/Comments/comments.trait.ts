// Comments, a writing root trait: one ticket's thread, and the posts waiting to join it.
//
// Two hosts place it: the editor at its root (`comments: Comments`, subject path `[]`) and the queue's
// preview drawer (`preview: Comments` with `resetOn` on the previewed ticket, subject path `[ticketId]`,
// rule 51). A trait cannot know which, so it maps `failure.NotSent` (needed wherever the path is not
// empty: another path's commit is declined `Rejected`) and it never assumes it is the only ticket it will see.
//
// What it owns, by the rules:
//  - the thread: a read in its body `activities` (rule 52), placed while the incarnation lives;
//  - `post`: a write whose lane is `clientId` (rule 51); `writes` invalidates the thread (rule 36);
//  - drafts: memory the view shows apart from the thread, pruned against the thread's ids (rule 33);
//  - an unknown post is re-sent as the same write on a keyed schedule, three times, then released (OD7).
//
// There is no `whenAbandoned: [O.post.cancel]` (rule 60). A comment someone wrote is user intent, not
// worthless work, so leaving (a closed drawer, another ticket previewed) keeps the post going; its ending is
// parked for the subject and the next incarnation with the same path adopts it (rule 54). Releasing is for
// work nobody can want any more (a replaced avatar upload).
// Hosts: the transition that changes the reset value may guard with `Comments.O.post.idle` (rule 56's default).
// The queue does not, on purpose (B7): its Story "A, B, A" walks the parked case.
import { Schema } from "effect";
import { deny, Flow, trait } from "flow-state";
import { commentsOn, postComment } from "./comments.contracts.js";

export const MAX_RESENDS = 3; // user-defined: re-sends after the first send, then give up

// Why a draft is not going to the thread. `null` means it is on its way (the lane says whether it is on the
// wire or unconfirmed).
const Problem = Schema.Literals(["rejected", "notSent", "gaveUp", "ticketGone"]);

// A draft is what the author typed, kept until the thread holds it. It never has a thread id: a comment
// the server has not returned is not in the list (rule 33). `sent` is "the server said yes", shown as
// "Sent" until the refetch brings the real row.
export const Draft = Schema.Struct({
  clientId: Schema.String,
  text: Schema.String,
  sent: Schema.Boolean,
  problem: Schema.NullOr(Problem),
  reason: Schema.NullOr(Schema.String), // the server's words for a rejected text
});

export type Draft = typeof Draft.Type;

type Mine = { clientId: string; text: string };

// Add the draft if this incarnation has never seen it (an adopted ending after a reset or a reload:
// rule 55, the event carries the text), otherwise change what the patch names.
const upsert = (drafts: ReadonlyArray<Draft>, mine: Mine, patch: Partial<Draft> = {}) =>
  drafts.some((d) => d.clientId === mine.clientId)
    ? drafts.map((d) => (d.clientId === mine.clientId ? { ...d, ...patch } : d))
    : [...drafts, { ...mine, sent: false, problem: null, reason: null, ...patch }];

// Every ending names its draft the same way: from the input the commit carried.
const mine = (_ending: unknown, { input }: { input: Mine }): Mine => ({
  clientId: input.clientId,
  text: input.text,
});

export const Comments = trait(
  {
    id: "Comments",
    events: {
      Post: { clientId: Schema.String, text: Schema.String }, // the view mints `clientId` (2.9.5)
      Resend: { clientId: Schema.String }, // "Send again" on a draft that never left
      Discard: { clientId: Schema.String },
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
      ResendDue: { clientId: Schema.String },
    },
    callbacks: {
      // The ticket does not exist (any more): the editor closes itself, the preview shows its notice.
      onTicketGone: Flow.optional(Flow.Callback({})),
    },
    memory: {
      workspaceId: Flow.input(Schema.String),
      ticketId: Flow.input(Schema.String), // "" while the queue previews nothing
      drafts: Flow.initial(Schema.Array(Draft), []),
    },
    operations: ({ E }) => ({
      thread: commentsOn.outcomes({
        value: E.ThreadLoaded.from((thread) => ({ clientIds: thread.map((c) => c.clientId) })),
        failure: {
          TicketNotFound: E.ThreadGone,
          NoResponse: E.ThreadFailed, // a lost read (REVIEW gap 34)
          Defect: E.ThreadFailed, // a read's tag record maps Flow's two (rule 37)
          Interrupted: E.ThreadFailed,
        },
      }),
      post: postComment.outcomes(
        {
          success: E.Posted.from(mine),
          failure: {
            TicketNotFound: E.PostGone.from(mine),
            CommentRejected: E.PostRejected.from((e, ctx) => ({
              ...mine(e, ctx),
              reason: e.reason,
            })),
            NotSent: E.PostNotSent.from(mine), // Rejected: another path's lane. Restored: reload before the send
          },
          unknown: E.PostUnsure.from(mine),
        },
        // A post changes the thread on the server, so the cached list is stale the moment it lands. This
        // runs at settlement, whoever is placed then, so a post that outlives the drawer still refreshes it.
        {
          writes: ({ input }) => [
            commentsOn.invalidate({ workspaceId: input.workspaceId, ticketId: input.ticketId }),
          ],
        },
      ),
    }),
  },
  ({ E, O, callbacks }) => {
    const ofEvent = ({ event }: { event: { clientId: string } }) => ({ clientId: event.clientId });
    const noTicket = ({ memory }: { memory: { ticketId: string } }) =>
      memory.ticketId !== "" || deny("NoTicket");
    const draftOf = (drafts: ReadonlyArray<Draft>, clientId: string) =>
      drafts.find((d) => d.clientId === clientId);

    const send = O.post.commit(({ memory, event }) => ({
      workspaceId: memory.workspaceId,
      ticketId: memory.ticketId,
      clientId: event.clientId,
      text: event.text,
    }));

    // A draft that never left is sent again as a new write (a definite failure sent nothing, rule 19).
    const sendAgain = O.post.commit(({ memory, event }) => ({
      workspaceId: memory.workspaceId,
      ticketId: memory.ticketId,
      clientId: event.clientId,
      text: draftOf(memory.drafts, event.clientId)?.text ?? "",
    }));

    return {
      // Placed for the incarnation's life. Nothing is read for a drawer that previews nothing.
      activities: [
        O.thread.subscribe(
          ({ memory }) => ({
            workspaceId: memory.workspaceId,
            ticketId: memory.ticketId,
          }),
          { when: ({ memory }) => memory.ticketId !== "" },
        ),
      ],

      schedules: {
        // One timer per unconfirmed post, read from the lanes, not from a list kept in memory (rule 23).
        // `uncertain` is false during a re-send, so a post that is unknown again arms a fresh timer.
        resend: {
          keys: ({ operations }) =>
            operations.post.filter((lane) => lane.uncertain).map((lane) => lane.key),
          schedule: "3 seconds",
          send: E.ResendDue.from(({ key }) => ({ clientId: key.clientId })),
        },
      },

      on: {
        Post: {
          target: "self",
          guard: [
            noTicket, // the queue's preview has ticketId "" while it previews nothing: no post into ticket ""
            ({ event }) => event.text.trim() !== "" || deny("EmptyComment"),
            ({ memory, event }) =>
              !draftOf(memory.drafts, event.clientId) || deny("DuplicateDraft"),
            O.post.idle(ofEvent),
          ],
          updateMemory: ({ memory, event }) => ({ drafts: upsert(memory.drafts, event) }),
          actions: [send],
        },
        Resend: {
          target: "self",
          guard: [
            noTicket,
            ({ memory, event }) =>
              draftOf(memory.drafts, event.clientId)?.problem === "notSent" ||
              deny("NotResendable"),
            O.post.idle(ofEvent),
          ],
          updateMemory: ({ memory, event }) => ({
            drafts: memory.drafts.map((d) =>
              d.clientId === event.clientId ? { ...d, problem: null, reason: null } : d,
            ),
          }),
          actions: [sendAgain],
        },
        // A draft whose post is on the wire or unconfirmed is not discarded: it would hide a post that may land.
        Discard: {
          target: "self",
          guard: O.post.idle(ofEvent),
          updateMemory: ({ memory, event }) => ({
            drafts: memory.drafts.filter((d) => d.clientId !== event.clientId),
          }),
        },
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
        // Held; `resend` arms. Not a problem yet: the lane's `uncertain` is what the view reads.
        PostUnsure: {
          target: "self",
          updateMemory: ({ memory, event }) => ({ drafts: upsert(memory.drafts, event) }),
        },

        ResendDue: [
          {
            target: "self",
            guard: [O.post.retryable(ofEvent, { times: MAX_RESENDS })],
            actions: [O.post.retry(ofEvent)],
          }, // the same Attempt
          {
            // Give up: release the hold. The post may still land; the refetch then removes the draft.
            target: "self",
            updateMemory: ({ memory, event }) => ({
              drafts: memory.drafts.map((d) =>
                d.clientId === event.clientId ? { ...d, problem: "gaveUp" } : d,
              ),
            }),
            actions: [O.post.cancel(ofEvent)],
          },
        ],
      },
    };
  },
);
