// The ticket's long body: an etag'd autosave, a root trait of the editor (path []). The same hold as the title's,
// with a version on the wire: a save carries `If-Match`, so a re-send after an unknown answer can meet 412 if
// someone saved in between, and it then arrives as `unknown { StillUnknown { BodyConflict } }` (rule 18), because
// the first send may be the reason the version moved (O1).
//
// Edits made while a save is on the wire are coalesced HERE, in memory, and sent after the answer with the etag
// that answer returned (fields.contracts.ts says why `latest` would send stale etags).
import { Schema } from "effect";
import { deny, Flow, trait } from "flow-state";
import { saveTicketBody } from "./fields.contracts.js";

export const BODY_RESENDS = 2;

const Status = Schema.Literals(["clean", "dirty", "conflict", "unsure"]);

export const Body = trait(
  {
    id: "Body",
    events: { Edited: { body: Schema.String }, KeepMine: {}, TakeTheirs: {} },
    hostEvents: { Loaded: { body: Schema.String, etag: Schema.String } }, // the host's details read answered
    internalEvents: {
      Settled: {},
      Saved: { body: Schema.String, etag: Schema.String },
      Conflict: { theirs: Schema.String, etag: Schema.String },
      NotSent: {},
      Unsure: Flow.uncertain({}),
      UnsureConflict: Flow.uncertain({}), // a re-send met 412 after an unknown first send
      ResendDue: {},
    },
    // F15: optional. A host that shows the body read-only leaves it unfilled and the trait carries on.
    callbacks: { onConflict: Flow.optional(Flow.Callback({ theirs: Schema.String })) },
    memory: {
      workspaceId: Flow.input(Schema.String),
      ticketId: Flow.input(Schema.String),
      body: Flow.initial(Schema.String, ""),
      saved: Flow.initial(Schema.String, ""),
      etag: Flow.initial(Schema.String, ""),
      theirs: Flow.initial(Schema.NullOr(Schema.String), null),
      status: Flow.initial(Status, "clean"),
    },
    operations: ({ E }) => ({
      save: saveTicketBody.outcomes({
        success: E.Saved.from((details) => ({ body: details.body, etag: details.etag })),
        failure: {
          BodyConflict: E.Conflict.from((e) => ({ theirs: e.body, etag: e.etag })),
          NotSent: E.NotSent,
        },
        unknown: {
          StillUnknown: E.UnsureConflict, // only a 412 can follow an unknown send here
          Cancelled: E.Unsure,
          NoResponse: E.Unsure,
          ServerError: E.Unsure,
          Restored: E.Unsure,
          Interrupted: E.Unsure,
          Defect: E.Unsure,
          StorageRefused: E.Unsure,
        },
      }),
    }),
  },
  ({ E, O, callbacks }) => {
    const dirty = ({ memory }: { memory: { body: string; saved: string } }) =>
      memory.body !== memory.saved || deny("Clean");

    // The select reads the after memory (rule 22), so writing `etag` and sending it in one turn works.
    const send = O.save.commit(({ memory }) => ({
      workspaceId: memory.workspaceId,
      ticketId: memory.ticketId,
      body: memory.body,
      ifMatch: memory.etag,
    }));

    return {
      schedules: {
        settle: { schedule: "1 second", send: E.Settled, restartOn: ({ memory }) => memory.body },
        resend: {
          schedule: "2 seconds",
          armOn: [E.Unsure],
          disarmOn: [E.Saved, E.Conflict],
          send: E.ResendDue,
        },
      },
      on: {
        // The first answer, or a newer one while nothing is typed: take the server's text.
        Loaded: [
          {
            target: "self",
            guard: [({ memory }) => memory.body === memory.saved || deny("LocalEdits")],
            updateMemory: ({ event }) => ({
              body: event.body,
              saved: event.body,
              etag: event.etag,
            }),
          },
          { target: "self", updateMemory: ({ event }) => ({ etag: event.etag }) },
        ],
        Edited: {
          target: "self",
          guard: [({ memory }) => memory.status !== "conflict" || deny("ResolveFirst")],
          updateMemory: ({ event }) => ({ body: event.body, status: "dirty" as const }),
        },
        Settled: { target: "self", guard: [dirty, O.save.idle], actions: [send] }, // a save on the wire coalesces
        Saved: [
          {
            // Typed during the save: send the newest text now, with the etag this answer returned.
            target: "self",
            guard: [({ memory, event }) => memory.body !== event.body || deny("NothingNewer")],
            updateMemory: ({ event }) => ({ saved: event.body, etag: event.etag }),
            actions: [send],
          },
          {
            target: "self",
            updateMemory: ({ event }) => ({
              saved: event.body,
              etag: event.etag,
              status: "clean" as const,
            }),
          },
        ],
        Conflict: {
          target: "self",
          updateMemory: ({ event }) => ({
            theirs: event.theirs,
            etag: event.etag,
            status: "conflict" as const,
          }),
          notify: [callbacks.onConflict.from(({ event }) => ({ theirs: event.theirs }))],
        },
        // The first send may have saved, and someone saved since: release it, and let the author compare.
        UnsureConflict: {
          target: "self",
          updateMemory: () => ({ status: "conflict" as const }),
          actions: [O.save.cancel],
        },
        NotSent: { target: "self" },
        Unsure: { target: "self", updateMemory: () => ({ status: "unsure" as const }) },
        ResendDue: [
          {
            target: "self",
            guard: [O.save.retryable({ times: BODY_RESENDS })],
            actions: [O.save.retry],
          },
          { target: "self", actions: [O.save.cancel] }, // still dirty: the next settle sends it as a new write
        ],
        // Mine wins: save my text over theirs (the 412 told us their etag). Theirs wins: drop mine.
        KeepMine: {
          target: "self",
          guard: [({ memory }) => memory.status === "conflict" || deny("NoConflict"), O.save.idle],
          updateMemory: () => ({ theirs: null, status: "dirty" as const }),
          actions: [send],
        },
        TakeTheirs: {
          target: "self",
          guard: [({ memory }) => memory.theirs !== null || deny("NoConflict")],
          updateMemory: ({ memory }) => ({
            body: memory.theirs ?? memory.body,
            saved: memory.theirs ?? memory.saved,
            theirs: null,
            status: "clean" as const,
          }),
        },
      },
    };
  },
);
