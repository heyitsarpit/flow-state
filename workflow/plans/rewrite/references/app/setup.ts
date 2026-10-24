// Complete executable configuration, kept independent of testing and Story registration.
import { Context, Layer } from "effect";
import { runtimeSetup } from "flow-state";
import { TicketApi } from "../features/Tickets/ticket-api.js";
import { DeskApp } from "./app.js";
import { DemoTicketApi } from "./demo-api.js";

export const DeskSetup = runtimeSetup({ app: DeskApp, services: DemoTicketApi });

class DeskSettings extends Context.Service<DeskSettings, { locale: string }>()(
  "DispatchDesk/Settings",
) {}

// A host can supply an existing service. Reusing it shares application-owned state, whereas
// DemoTicketApi builds fresh state per Runtime. Supersets are fine; duplicates reject.
export function setupWithAnExistingService(api: typeof TicketApi.Service) {
  return runtimeSetup({
    app: DeskApp,
    services: Layer.mergeAll(
      Layer.succeed(TicketApi, api),
      Layer.succeed(DeskSettings, { locale: "en-IN" }),
    ),
  });
}
