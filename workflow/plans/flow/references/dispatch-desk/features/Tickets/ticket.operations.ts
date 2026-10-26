// Plain requests. Nothing here imports an entity or a domain: adopting entities edits only
// ticket.domain.ts (entity-domain.md section 1).
import { Schema, Stream } from "effect";
import { resource, stream, transaction } from "flow-state";
import { TicketApi } from "./ticket-api.js";
import { TicketPage, TicketRow, type TicketKey, type TicketListInput } from "./types.js";

export const ticketById = resource({
  id: "DispatchDesk/ticket-by-id",
  key: ({ workspaceId, ticketId }: TicketKey) => ({ workspaceId, ticketId }),
  lookup: (key, { signal }) => TicketApi.use((api) => api.load(key, signal)),
  result: TicketRow,
  staleTime: "30 seconds", // required, with no library default (Operations.plan O1)
  gcTime: "5 minutes",
  persist: true,
});

// A normalised key: "Lobby " and "lobby" share one cache entry. Absent filters stay absent.
export const ticketList = resource({
  id: "DispatchDesk/ticket-list",
  key: ({ workspaceId, status, assignee, search, page }: TicketListInput) => ({
    workspaceId,
    status,
    assignee,
    search: search?.trim().toLowerCase(),
    page,
  }),
  lookup: (input, { signal }) => TicketApi.use((api) => api.list(input, signal)),
  result: TicketPage,
  staleTime: "10 seconds",
  gcTime: "2 minutes",
});

// result Schemas are what let an answer cross a boundary: persisted, or carried in a server
// render's payload (ServerRendering plan). An answer without one is fetched by the browser.
export const openCount = resource({
  id: "DispatchDesk/open-count",
  key: ({ workspaceId }: { workspaceId: string }) => ({ workspaceId }),
  lookup: (input, { signal }) => TicketApi.use((api) => api.openCount(input, signal)),
  result: Schema.Number,
  staleTime: "30 seconds",
  gcTime: "5 minutes",
});

// attempt.id is minted by Flow per attempt and reused when the attempt is reconciled, so it is
// the idempotency key the API deduplicates on (Operations.plan O3).
export const saveTitle = transaction({
  id: "DispatchDesk/save-title",
  key: ({ workspaceId, ticketId }: TicketKey) => ({ workspaceId, ticketId }),
  commit: (input: TicketKey & { title: string }, { signal, attempt }) =>
    TicketApi.use((api) => api.saveTitle({ ...input, idempotencyKey: attempt.id }, signal)),
  concurrency: "reject", // a second save of one ticket while one is running is declined
});

export const assignTicket = transaction({
  id: "DispatchDesk/assign-ticket",
  key: ({ workspaceId, ticketId }: TicketKey) => ({ workspaceId, ticketId }),
  commit: (input: TicketKey & { assignee: string }, { signal, attempt }) =>
    TicketApi.use((api) => api.assign({ ...input, idempotencyKey: attempt.id }, signal)),
  concurrency: "serialize",
});

// Live technician progress is meaningless after a reload, so it keeps no latest value across one.
// Stream adapters return a Stream (D35); the service is reached through Stream.unwrap.
export const technicianUpdates = stream({
  id: "DispatchDesk/technician-updates",
  key: ({ workspaceId, ticketId }: TicketKey) => ({ workspaceId, ticketId }),
  subscribe: (key) => Stream.unwrap(TicketApi.useSync((api) => api.technicianUpdates(key))),
  persist: false,
});

export const ticketEvents = stream({
  id: "DispatchDesk/ticket-events",
  key: ({ workspaceId }: { workspaceId: string }) => ({ workspaceId }),
  subscribe: (input) => Stream.unwrap(TicketApi.useSync((api) => api.events(input))),
});
