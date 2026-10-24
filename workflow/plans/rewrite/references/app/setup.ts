// Complete executable configuration, kept independent of testing/Story registration.
import { runtimeSetup } from "flow-state";
import { DeskApp } from "./app.js";
import { DemoImplementation } from "./implementation.js";

export const DeskSetup = runtimeSetup({ app: DeskApp, implementation: DemoImplementation });
