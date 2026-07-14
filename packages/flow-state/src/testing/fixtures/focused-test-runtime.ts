import { TestClock } from "effect/testing";

import type { FlowMachine } from "../../core/api/types.js";
import type { AnyResourceDefinition } from "../../core/api/resource-runtime.js";
import * as flow from "../../index.js";
import { createRuntime } from "../../runtime/contract-runtime.js";
import { focusedMachineInventory } from "../focused-app.js";

export function createFocusedRuntimeWithTestClock(
  machine: FlowMachine,
  moduleName: string,
  resources: Readonly<Record<string, AnyResourceDefinition>> = {},
) {
  const app = flow.app({
    modules: [
      flow.module(moduleName, {
        machines: focusedMachineInventory(machine),
        resources,
      }),
    ],
  });

  return createRuntime(
    app.layer({
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
