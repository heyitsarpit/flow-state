// One upload, placed by the editor as `uploads: AttachmentUpload.each({ of: "attachments", by: "ref", max: 10 })`. It commits when its
// copy is created, shows progress through the lane's row, stops on `Cancel`, re-sends an unknown a few
// times, and is released when its copy is removed: a removed attachment is worthless (rule 60).
import { Schema } from "effect";
import { deny, Flow, trait } from "flow-state"; // existing
import { AttachmentsDomain } from "./attachments.domain.js";

export const MAX_RESENDS = 3; // user-defined

export const AttachmentUpload = trait(
  // user-defined: AttachmentUpload
  {
    id: "AttachmentUpload",
    events: { Cancel: {} }, // existing: events; the row's Cancel button sends it to this copy
    internalEvents: {
      // existing; also this fragment's operation's endings (rule 49)
      StartDue: {},
      ResendDue: {},
      Stored: { url: Schema.String },
      TooBig: { limit: Schema.Number },
      Gone: {}, // FileGone: the bytes are not in this tab
      NotSent: {}, // never left the device (cancelled while waiting): nothing to clean up
      Stopped: Flow.uncertain({}), // existing: Flow.uncertain; `unknown { Cancelled }`, the user's own stop
      Unsure: Flow.uncertain({}), // the request may have landed
      Lost: Flow.uncertain({}), // `Restored`: a reload mid-upload. Its bytes cannot exist in a fresh tab, so it is over
    },
    callbacks: {
      // existing: callbacks, Flow.optional, Flow.Callback
      onStored: Flow.optional(Flow.Callback({ ref: Schema.String, url: Schema.String })),
      onFailed: Flow.optional(
        Flow.Callback({
          ref: Schema.String,
          problem: Schema.Literals(["TooLarge", "FileGone", "GaveUp"]),
        }),
      ),
    },
    memory: {
      workspaceId: Flow.input(Schema.String),
      ticketId: Flow.input(Schema.String),
      ref: Flow.input(Schema.String), // existing: Flow.input; the draft is { ref, name, size } in the editor's memory
      name: Flow.input(Schema.String),
      size: Flow.input(Schema.Number),
      status: Flow.initial(
        Schema.Literals(["queued", "sending", "unsure", "stored", "stopped", "failed"]),
        "queued",
      ), // mirrored from endings so a row can read it; `progress`, `pending` and `uncertain` are the lane's
      url: Flow.initial(Schema.NullOr(Schema.String), null),
      problem: Flow.initial(
        Schema.NullOr(Schema.Literals(["TooLarge", "FileGone", "GaveUp"])),
        null,
      ),
      limit: Flow.initial(Schema.NullOr(Schema.Number), null),
    },
    operations: ({ E }) => ({
      // existing key; in a fragment (rule 49)
      // A domain write: a stored upload joins the ticket's file list (AttachmentsDomain.files).
      put: AttachmentsDomain.put.outcomes({
        // existing: outcomes; user-defined: put
        success: E.Stored.from((stored) => ({ url: stored.url })),
        failure: {
          TooLarge: E.TooBig.from((r) => ({ limit: r.limit })),
          FileGone: E.Gone,
          NotSent: E.NotSent, // required where the subject path is not empty (rules 20, 51): Rejected or Cancelled
        },
        unknown: {
          // by tag (rule 13): the stop releases, a lost request re-sends
          Cancelled: E.Stopped,
          NoResponse: E.Unsure,
          ServerError: E.Unsure,
          Restored: E.Lost, // a reload mid-upload: the bytes are gone, so there is nothing to re-send (a re-send's
          // FileGone would come back as `unknown { StillUnknown }`, rule 18, and the copy would give up after three tries)
          Interrupted: E.Unsure,
          Defect: E.Unsure,
          StillUnknown: E.Unsure,
          StorageRefused: E.Unsure, // a persisted re-send whose lane-record capture failed (2.7.13)
        },
      }),
    }),
  },
  ({ E, O, callbacks }) => {
    const own = ({ memory }: { memory: { ref: string } }) => ({ ref: memory.ref }); // user-defined: this upload's lane

    return {
      schedules: {
        // existing: schedules. A 0 ms entry schedule commits on creation (F7: no entry hook).
        start: { schedule: "0 millis", armOn: [Flow.entry], send: E.StartDue },
        resend: {
          schedule: "3 seconds",
          armOn: [E.Unsure],
          disarmOn: [E.Cancel, E.Stored, E.Gone, E.TooBig, E.Stopped, E.Lost], // existing: disarmOn
          send: E.ResendDue,
        },
      },
      on: {
        StartDue: [
          {
            target: "self",
            guard: [
              ({ memory }) => memory.status === "queued" || deny("NotQueued"),
              O.put.idle(own),
            ], // rule 54's default: a restored or adopted copy does not commit twice
            updateMemory: () => ({ status: "sending" }),
            actions: [
              O.put.commit(({ memory }) => ({
                workspaceId: memory.workspaceId,
                ticketId: memory.ticketId,
                ref: memory.ref,
              })),
            ], // existing: commit; the bytes come from PendingFiles
          },
          { target: "self" },
        ],
        Cancel: {
          target: "self",
          guard: ({ memory }) =>
            memory.status === "queued" ||
            memory.status === "sending" ||
            memory.status === "unsure" ||
            deny("NothingToCancel"),
          updateMemory: () => ({ status: "stopped" }),
          actions: [O.put.cancel(own)], // on the wire: interrupts, and the ending is `Stopped`; held: releases now
        },
        Stopped: { target: "self", actions: [O.put.cancel] }, // key-less: release the stop's hold (2.7.7); nothing newer is waiting
        // A reload took the bytes: end it as FileGone, definitely, and release the restored Held lane (key-less).
        Lost: {
          target: "self",
          updateMemory: () => ({ status: "failed", problem: "FileGone" }),
          actions: [O.put.cancel],
          notify: [
            callbacks.onFailed.from(({ memory }) => ({
              ref: memory.ref,
              problem: "FileGone" as const,
            })),
          ],
        },
        NotSent: { target: "self" }, // a stop before the bytes left; status is already "stopped"
        Unsure: { target: "self", updateMemory: () => ({ status: "unsure" }) }, // Held; `resend` arms
        ResendDue: [
          {
            target: "self",
            guard: [O.put.retryable(own, { times: MAX_RESENDS })], // existing: retryable
            updateMemory: () => ({ status: "sending" }),
            actions: [O.put.retry(own)], // the same Attempt, the same idempotency key; progress starts again
          },
          {
            target: "self",
            updateMemory: () => ({ status: "failed", problem: "GaveUp" }),
            actions: [O.put.cancel(own)], // give up and release; the upload may still land (OD20)
            notify: [
              callbacks.onFailed.from(({ memory }) => ({
                ref: memory.ref,
                problem: "GaveUp" as const,
              })),
            ],
          },
        ],
        Stored: {
          target: "self",
          updateMemory: ({ event }) => ({ status: "stored", url: event.url }),
          notify: [
            callbacks.onStored.from(({ memory, event }) => ({ ref: memory.ref, url: event.url })),
          ],
        },
        TooBig: {
          target: "self",
          updateMemory: ({ event }) => ({
            status: "failed",
            problem: "TooLarge",
            limit: event.limit,
          }),
          notify: [
            callbacks.onFailed.from(({ memory }) => ({
              ref: memory.ref,
              problem: "TooLarge" as const,
            })),
          ],
        },
        Gone: {
          target: "self",
          updateMemory: () => ({ status: "failed", problem: "FileGone" }),
          notify: [
            callbacks.onFailed.from(({ memory }) => ({
              ref: memory.ref,
              problem: "FileGone" as const,
            })),
          ],
        },
      },
      // Release on leave (rule 60): a removed attachment is worthless, so its lane is interrupted or
      // released. The host needs no keep-busy line and rule 56 does not apply to it.
      whenAbandoned: [O.put.cancel],
    };
  },
);
