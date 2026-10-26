// Ticket data and finite mutation descriptors; none captures a machine or actor.
import { Effect, Stream } from "effect";
import { resource, stream, transaction } from "flow-state";
import { TicketApi } from "./ticket-api.js";
import { Ticket, type SaveTitleInput, type TicketListInput, type TicketRef } from "./types.js";

// Readers take the key input ({ workspaceId, ticketId }); lookup receives full parameters (D25).
export const ticketById = resource({
  id: "DispatchDesk/ticket-by-id",
  key: ({ workspaceId, ticketId }: TicketRef) => ({ workspaceId, ticketId }),
  lookup: (input: TicketRef, { signal }) => TicketApi.use((api) => api.load(input, signal)),
  staleTime: "30 seconds",
  gcTime: "5 minutes",
  persist: true,
  data: Ticket, // Persisted cache data crosses a boundary, so it carries its Schema (D46).
});

// A derived key: search is normalised, so "Lobby " and "lobby" share one cache entry.
// The key input is the whole list input; readers pass the same shape the machine holds.
export const ticketList = resource({
  id: "DispatchDesk/ticket-list",
  key: ({ workspaceId, filters, page }: TicketListInput) => ({
    workspaceId,
    status: filters.status,
    assignee: filters.assignee,
    search: filters.search.trim().toLowerCase(),
    page,
  }),
  lookup: (input: TicketListInput, { signal }) => TicketApi.use((api) => api.list(input, signal)),
  staleTime: "10 seconds",
  gcTime: "2 minutes",
});

// requestId is payload, not identity: one save lane per ticket per actor.
export const saveTitle = transaction({
  id: "DispatchDesk/save-title",
  key: ({ workspaceId, ticketId }: TicketRef) => ({ workspaceId, ticketId }),
  commit: (input: SaveTitleInput, { signal }) =>
    TicketApi.use((api) => api.saveTitle(input, signal)),
  concurrency: "reject",
  // Persistence follows the owning actor (D34): a durable editor keeps its save facts.
});

// Live technician progress is meaningless after a reload, so it opts out of the editor's durability.
export const technicianUpdates = stream({
  id: "DispatchDesk/technician-updates",
  key: ({ workspaceId, ticketId }: TicketRef) => ({ workspaceId, ticketId }),
  subscribe: (input: TicketRef) =>
    Stream.unwrap(TicketApi.use((api) => Effect.succeed(api.technicianUpdates(input)))),
  persist: false,
});

// The remote adapter journals requestId durably before dispatch; this demo is in-memory.
