// In-memory application adapter. A production adapter would own transport and remote journaling.
import { Effect, Layer, Stream } from "effect";
import { TicketApi } from "../features/Tickets/ticket-api.js";
import { TicketNotFound, TitleRejected, type Ticket } from "../features/Tickets/types.js";

// Each Layer build gets fresh state, so Story runs and Runtimes never share tickets.
export const DemoTicketApi = Layer.effect(
  TicketApi,
  Effect.sync(() => {
    let tickets: Ticket[] = [
      {
        workspaceId: "north",
        ticketId: "T-42",
        title: "Replace lobby light",
        status: "assigned",
        assignee: "dispatcher-7",
      },
      {
        workspaceId: "north",
        ticketId: "T-43",
        title: "Fix loading dock door",
        status: "open",
        assignee: null,
      },
    ];

    const find = (workspaceId: string, ticketId: string) =>
      tickets.find((ticket) => ticket.workspaceId === workspaceId && ticket.ticketId === ticketId);

    return TicketApi.of({
      load: ({ workspaceId, ticketId }) =>
        Effect.suspend(() => {
          const ticket = find(workspaceId, ticketId);

          return ticket
            ? Effect.succeed({ ...ticket })
            : Effect.fail(new TicketNotFound({ ticketId }));
        }),
      list: ({ workspaceId, filters, page }) =>
        Effect.sync(() => {
          const search = filters.search.trim().toLowerCase();

          const matching = tickets.filter(
            (ticket) =>
              ticket.workspaceId === workspaceId &&
              (filters.status === null || ticket.status === filters.status) &&
              (filters.assignee === null || ticket.assignee === filters.assignee) &&
              ticket.title.toLowerCase().includes(search),
          );

          return { tickets: matching.slice(page * 20, page * 20 + 20), total: matching.length };
        }),
      saveTitle: ({ workspaceId, ticketId, title }) =>
        Effect.gen(function* () {
          const ticket = find(workspaceId, ticketId);

          if (!ticket) return yield* Effect.fail(new TicketNotFound({ ticketId }));

          if (title.trim() === "") {
            return yield* Effect.fail(new TitleRejected({ reason: "Enter a ticket title" }));
          }

          const saved = { ...ticket, title };
          tickets = tickets.map((current) => (current === ticket ? saved : current));

          return { ...saved };
        }),
      technicianUpdates: () =>
        Stream.fromIterable([
          { stage: "assigned" as const, at: 0 },
          { stage: "on-site" as const, at: 60_000 },
        ]),
    });
  }),
);
