import { TestClock } from "effect/testing";

import type { FlowMachine } from "../../core/api/types.js";
import { createRuntime } from "../../runtime/contract-runtime.js";
import { createFocusedTestApp } from "../focused-app.js";

export function createFocusedRuntimeWithTestClock(machine: FlowMachine, moduleName: string) {
  return createRuntime(
    createFocusedTestApp(machine, moduleName).layer({
      store: {
        kind: "store",
        mode: "test",
      },
      orchestrators: {
        kind: "orchestrators",
        mode: "test",
      },
      services: [TestClock.layer()],
    }),
  );
}
