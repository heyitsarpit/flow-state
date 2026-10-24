import { Context } from "effect";
import { Implementation, runtimeSetup } from "flow-state";
import { DeskApp } from "./app.js";
import { acquireDemoApi } from "./demo-api.js";
import { TicketApi } from "../features/Tickets/ticket-api.js";

export const DemoImplementation = Implementation.effect(TicketApi, acquireDemoApi);

class DeskSettings extends Context.Service<DeskSettings, { locale: string }>()(
  "DispatchDesk/Settings",
) {}

export function setupWithAnExistingService(api: ReturnType<typeof TicketApi.of>) {
  // The host supplies an existing service. Reusing it shares application-owned state.
  // The default DemoImplementation instead acquires fresh state per Runtime.
  const suppliedApi = Implementation.succeed(TicketApi, api);
  const settings = Implementation.succeed(DeskSettings, { locale: "en-IN" });

  return runtimeSetup({
    app: DeskApp,
    implementation: Implementation.merge(suppliedApi, settings),
  });
}
