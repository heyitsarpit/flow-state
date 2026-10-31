// Resolving on site: the contracts. Every contract states `input`, `output` and `key` (rule 39).
import { Effect, Schema } from "effect";
import { resource, transaction } from "flow-state";
import { unknownWhenLost } from "../shared/outcomes.js";
import { TicketRow } from "../Tickets/types.js";
import { Part, PendingSignatures, ResolveApi } from "./resolve-api.js";

const ticket = { workspaceId: Schema.String, ticketId: Schema.String };

// A part number the wizard waits on (R2): looked up one-off when the technician types it.
export const partByNumber = resource({
  id: "DispatchDesk/part-by-number",
  input: { partNumber: Schema.String },
  output: Part,
  key: ["partNumber"],
  lookup: (input, { signal }) => ResolveApi.use((api) => api.part(input, { signal })),
  staleTime: "5 minutes",
  gcTime: "10 minutes",
});

// One reservation per part per ticket: the host commits it when the wizard reports a part added.
export const reservePart = transaction({
  id: "DispatchDesk/reserve-part",
  input: { ...ticket, partNumber: Schema.String },
  output: Part,
  key: ["workspaceId", "ticketId", "partNumber"],
  concurrency: "reject",
  commit: (input, { attempt, signal }) =>
    ResolveApi.use((api) => api.reserve(input, { idempotencyKey: attempt.id, signal })).pipe(
      unknownWhenLost,
    ),
});

// Compensation (O20): give the reserved parts back when the wizard is abandoned. Safe to repeat: re-sent on unknown.
export const releaseParts = transaction({
  id: "DispatchDesk/release-parts",
  input: { ...ticket, partNumbers: Schema.Array(Schema.String) },
  key: ["workspaceId", "ticketId"],
  concurrency: "reject",
  commit: (input, { attempt, signal }) =>
    ResolveApi.use((api) => api.release(input, { idempotencyKey: attempt.id, signal })).pipe(
      unknownWhenLost,
    ),
});

// The signature's upload, with progress (O17). Its bytes come from tab memory (P6), never from persisted memory.
export const uploadSignature = transaction({
  id: "DispatchDesk/upload-signature",
  input: { ref: Schema.String },
  key: ["ref"],
  concurrency: "reject",
  progress: { sent: Schema.Number, total: Schema.Number },
  commit: ({ ref }, { attempt, signal, progress }) =>
    PendingSignatures.use((images) => images.take(ref)).pipe(
      Effect.flatMap((image) =>
        ResolveApi.use(
          (api) =>
            api.uploadSignature(
              { ref, image },
              { idempotencyKey: attempt.id, signal, onProgress: (p) => progress(p) },
            ), // pending merge 6: progress(p)
        ),
      ),
      unknownWhenLost,
    ),
});

// The resolution. The host's operation invalidates the ticket's history with `writes` (O22).
export const resolveTicket = transaction({
  id: "DispatchDesk/resolve-ticket",
  input: {
    ...ticket,
    reason: Schema.String,
    parts: Schema.Array(Schema.String),
    signatureRef: Schema.String,
  },
  output: TicketRow,
  key: ["workspaceId", "ticketId"],
  concurrency: "reject",
  commit: (input, { attempt, signal }) =>
    ResolveApi.use((api) => api.resolve(input, { idempotencyKey: attempt.id, signal })).pipe(
      unknownWhenLost,
    ),
});
