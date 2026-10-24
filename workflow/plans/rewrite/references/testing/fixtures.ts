// Service substitutions shared by Stories. Fixtures are Layers (D47): they replace whole service
// implementations and never mock operation kernels or inject pending results. The happy-path
// service is the app's own DemoTicketApi (app/demo-api.ts).
import { Effect, Layer, Stream } from "effect";
import { TicketApi } from "../features/Tickets/ticket-api.js";
import { QueueUnavailable, TicketLocked, TicketNotFound } from "../features/Tickets/types.js";

export const LockedTicketApi = Layer.effect(
  TicketApi,
  Effect.sync(() =>
    TicketApi.of({
      load: () =>
        Effect.succeed({
          workspaceId: "north",
          ticketId: "T-42",
          title: "Replace lobby light",
          status: "assigned",
          assignee: "dispatcher-2",
        }),
      list: () => Effect.succeed({ tickets: [], total: 0 }),
      saveTitle: () => Effect.fail(new TicketLocked({ lockedBy: "dispatcher-2" })),
      technicianUpdates: () => Stream.empty,
    }),
  ),
);

export const UnavailableQueueApi = Layer.effect(
  TicketApi,
  Effect.sync(() =>
    TicketApi.of({
      load: ({ ticketId }) => Effect.fail(new TicketNotFound({ ticketId })),
      list: () => Effect.fail(new QueueUnavailable({ retryAfter: 5 })),
      saveTitle: ({ ticketId }) => Effect.fail(new TicketNotFound({ ticketId })),
      technicianUpdates: () => Stream.empty,
    }),
  ),
);
