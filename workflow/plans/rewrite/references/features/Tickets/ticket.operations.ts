import { Effect } from "effect";
import { resource, transaction } from "flow-state";
import { TicketApi } from "./ticket-api.js";
import type { SaveTitleInput, TicketInput } from "./types.js";

// Ticket data and finite mutation descriptors; neither captures a machine or actor.

export const ticketById = resource({
  id: "DispatchDesk/ticket-by-id",
  key: ({ workspaceId, ticketId }: TicketInput) => [workspaceId, ticketId],
  lookup: (input, { signal }) =>
    Effect.gen(function* () {
      const api = yield* TicketApi;

      return yield* api.load(input, signal);
    }),
  persist: true,
});

export const saveTitle = transaction({
  id: "DispatchDesk/save-title",
  key: ({ workspaceId, ticketId }: SaveTitleInput) => [workspaceId, ticketId],
  commit: (input, { signal }) =>
    Effect.gen(function* () {
      const api = yield* TicketApi;

      return yield* api.saveTitle(input, signal);
    }),
  concurrency: "reject",
  persist: true,
});

// requestId is the remote idempotency identity, not the actor-local concurrency key.
// A real remote adapter journals requestId durably before dispatch; this demo is in-memory.
// Resource freshness defaults remain unresolved. Omission here establishes no policy.
