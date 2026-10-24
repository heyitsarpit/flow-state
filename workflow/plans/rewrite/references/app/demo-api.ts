// In-memory application adapter. A production adapter would own transport and remote journaling.
import { Effect } from "effect";
import { TicketApi } from "../features/Tickets/ticket-api.js";
import type { Ticket } from "../features/Tickets/types.js";

// Every provider acquisition gets fresh state. No state leaks between Story runs.
export const acquireDemoApi = Effect.sync(() => {
  let ticket: Ticket = {
    workspaceId: "north",
    ticketId: "T-42",
    title: "Replace lobby light",
  };

  return TicketApi.of({
    load: (input, signal) =>
      Effect.suspend(() => {
        if (signal.aborted) return Effect.interrupt;

        if (input.workspaceId !== ticket.workspaceId || input.ticketId !== ticket.ticketId) {
          return Effect.fail({ message: "Ticket not found" });
        }

        return Effect.succeed({ ...ticket });
      }),
    saveTitle: (input, signal) =>
      Effect.suspend(() => {
        if (signal.aborted) return Effect.interrupt;

        if (input.workspaceId !== ticket.workspaceId || input.ticketId !== ticket.ticketId) {
          return Effect.fail({ message: "Ticket not found" });
        }

        if (input.title.trim().length === 0) {
          return Effect.fail({ message: "Enter a ticket title" });
        }

        ticket = { ...ticket, title: input.title };

        return Effect.succeed({ ...ticket });
      }),
  });
});
