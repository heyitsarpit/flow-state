// Complete service substitutions shared by Stories; no mock operation engine or pending-result injection.
import { Effect } from "effect";
import { Implementation } from "flow-state";
import { fixture } from "flow-state/testing";
import { DemoImplementation } from "../app/implementation.js";
import { acquireDemoApi } from "../app/demo-api.js";
import { TicketApi } from "../features/Tickets/ticket-api.js";

export const demoFixture = fixture({
  id: "dispatch-desk-demo",
  implementation: DemoImplementation,
});

export const lockedFixture = fixture({
  id: "locked-ticket",
  implementation: Implementation.effect(
    TicketApi,
    Effect.gen(function* () {
      const api = yield* acquireDemoApi;

      return TicketApi.of({
        load: api.load,
        saveTitle: () => Effect.fail({ message: "Ticket is locked" }),
      });
    }),
  ),
});
