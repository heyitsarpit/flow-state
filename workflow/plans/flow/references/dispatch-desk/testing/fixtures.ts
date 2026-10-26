// Fixtures are Layers built on top of the setup's services (Testing.plan O1): they may read the
// demo server and shadow the TicketApi it provides. They replace service behaviour, never
// operation kernels, and never inject results into pending work.
import { Effect, Layer } from "effect";
import { DemoServer } from "../app/demo-api.js";
import { TicketApi } from "../features/Tickets/ticket-api.js";
import { QueueUnavailable, TicketLocked } from "../features/Tickets/types.js";

type Service = typeof TicketApi.Service;

// Start from the demo server's API and change some methods.
const overriding = (change: (api: Service) => Partial<Service>) =>
  Layer.effect(
    TicketApi,
    DemoServer.useSync((server) => TicketApi.of({ ...server.api, ...change(server.api) })),
  );

// Saves take two seconds of TestClock time, so a Story can act while one is in flight.
export const SlowSave = overriding((api) => ({
  saveTitle: (request, signal) => api.saveTitle(request, signal).pipe(Effect.delay("2 seconds")),
}));

// Assignments take two seconds too, so a Story can checkpoint the prediction before it settles.
export const SlowAssign = overriding((api) => ({
  assign: (request, signal) => api.assign(request, signal).pipe(Effect.delay("2 seconds")),
}));

export const LockedSave = overriding(() => ({
  saveTitle: () => Effect.fail(new TicketLocked({ lockedBy: "dispatcher-2" })),
}));

export const UnavailableQueue = overriding(() => ({
  list: () => Effect.fail(new QueueUnavailable({ retryAfter: 5 })),
}));

// Another dispatcher renames T-43 three seconds in. The change goes through the server's own
// state, so every later read agrees with the push the domain maps to Ticket.save.
export const RenamedElsewhere = Layer.effectDiscard(
  DemoServer.use((server) =>
    Effect.sleep("3 seconds").pipe(
      Effect.andThen(
        server.externalSave(
          { workspaceId: "north", ticketId: "T-43" },
          { title: "Fix the loading dock door" },
        ),
      ),
      Effect.orDie,
      Effect.forkScoped,
    ),
  ),
);

// Allocate one counter per scenario/test. Counts live outside the Runtime so no invented
// checkpoint-service accessor is needed; each service build resets its own invocation counts.
export function countingTicketApi() {
  const calls = { list: 0, openCount: 0 };

  const layer = overriding((api) => {
    calls.list = 0;
    calls.openCount = 0;

    return {
      list: (input, signal) =>
        Effect.suspend(() => {
          calls.list++;

          return api.list(input, signal);
        }),
      openCount: (input, signal) =>
        Effect.suspend(() => {
          calls.openCount++;

          return api.openCount(input, signal);
        }),
    };
  });

  return { layer, calls: () => ({ ...calls }) };
}
