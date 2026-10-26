// The complete executable configuration, independent of testing and Story registration.
import { runtimeSetup } from "flow-state";
import { DeskApp } from "./app.js";
import { DemoTicketApi } from "./demo-api.js";

// Services are an Effect Layer (Runtime.plan O2). A production setup swaps in the HTTP adapter.
export const DeskSetup = runtimeSetup({ app: DeskApp, services: DemoTicketApi });
