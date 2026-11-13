// One description field's autosave, placed by the editor once per field with `.each` (F6): a copy that OWNS its
// write. The field's text lives in its nested `check` Field (validation, no timer); the debounce is the HOST's,
// a keyed schedule with one timer per dirty field (S2), which raises `Flush` into the copy when its field settles.
//
// How it differs from the other copies that own writes (COVERAGE.md 5.6): the upload copy commits on creation and
// releases on abandon; this one commits on a host's signal, on `latest` (a newer value replaces the queued one, last
// write wins, O4), waits behind its own unsure save (O5), and is never released on leave: the text is user intent.
import { Schema } from "effect";
import { deny, Flow, trait } from "flow-state";
import { FieldName } from "./details-api.js";
import { Field } from "./field.trait.js";
import { saveTicketField } from "./fields.contracts.js";

export const MAX_FIELD = 280;

export const MAX_RESENDS = 3;

// One validator for every description field, so one template serves every copy. An access code is digits.
const validate = (value: string) =>
  value.length <= MAX_FIELD || deny("TooLong", { length: value.length, max: MAX_FIELD });

export const Autosave = trait(
  {
    id: "Autosave",
    hostEvents: { Flush: {} }, // the host's per-field debounce fired: send what the field holds now
    internalEvents: {
      Saved: { value: Schema.String },
      Rejected: { reason: Schema.String },
      NotSent: {},
      Unsure: Flow.uncertain({}),
      ResendDue: {},
    },
    callbacks: {
      // F17: the editor's "all saved" badge listens. Optional: a host that shows no badge leaves it unfilled.
      onSaved: Flow.optional(Flow.Callback({ field: FieldName })),
    },
    memory: {
      workspaceId: Flow.input(Schema.String),
      ticketId: Flow.input(Schema.String),
      field: Flow.input(FieldName),
      saved: Flow.input(Schema.String), // what the server holds, as last confirmed
      problem: Flow.initial(Schema.NullOr(Schema.Literals(["rejected", "gaveUp"])), null),
      reason: Flow.initial(Schema.NullOr(Schema.String), null),
    },
    traits: { check: Field({ validate }) }, // nested: the editor cannot reach it (rule 10)
    operations: ({ E }) => ({
      save: saveTicketField.outcomes({
        success: E.Saved.from((_details, { input }) => ({ value: input.value })),
        failure: {
          FieldRejected: E.Rejected.from((e) => ({ reason: e.reason })),
          // Rejected (another path), Restored (a reload before the send): nothing left. The host's debounce sees the
          // field still dirty and flushes the coalesced text again.
          NotSent: E.NotSent,
        },
        unknown: E.Unsure, // Restored mid-autosave too: re-send the same Attempt (O12)
      }),
    }),
  },
  ({ E, O, callbacks }) => ({
    traits: { check: { input: ({ memory }) => ({ value: memory.saved }) } },
    schedules: {
      resend: {
        schedule: "2 seconds",
        armOn: [E.Unsure],
        disarmOn: [E.Saved, E.Rejected],
        send: E.ResendDue,
      },
    },
    on: {
      // No `idle` guard: under `latest` a flush while a save is on the wire queues the newest value, and a newer one
      // replaces it (`Superseded`). While the field's save is unsure, the queued value waits behind the hold (O5).
      Flush: {
        target: "self",
        guard: [
          ({ memory }) => memory.check.value !== memory.saved || deny("Clean"),
          ({ memory }) => memory.check.error ?? true, // the field's own reason, as a guard returns it
        ],
        updateMemory: () => ({ problem: null, reason: null }),
        actions: [
          O.save.commit(({ memory }) => ({
            workspaceId: memory.workspaceId,
            ticketId: memory.ticketId,
            field: memory.field,
            value: memory.check.value,
          })),
        ],
      },
      Saved: {
        target: "self",
        updateMemory: ({ event }) => ({ saved: event.value }),
        notify: [callbacks.onSaved.from(({ memory }) => ({ field: memory.field }))],
      },
      Rejected: {
        target: "self",
        updateMemory: ({ event }) => ({ problem: "rejected", reason: event.reason }),
      },
      NotSent: { target: "self" },
      Unsure: { target: "self" }, // held; `resend` arms
      ResendDue: [
        {
          target: "self",
          guard: [O.save.retryable({ times: MAX_RESENDS })],
          actions: [O.save.retry],
        },
        // Give up and release: the field stays dirty, so the next edit's debounce sends it as a new write.
        { target: "self", updateMemory: () => ({ problem: "gaveUp" }), actions: [O.save.cancel] },
      ],
    },
  }),
);
