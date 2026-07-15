import { Option } from "effect";

import * as flow from "flow-state";

import { outboxResource } from "./resources";
import { drainOutbox } from "./transactions";
import type { WorkerContext, WorkerEvent } from "./worker-types";

export const outboxWorkerMachine = flow.machine<WorkerContext, WorkerEvent, "draining">({
  id: "offline.outbox-worker",
  initial: "draining",
  context: () => ({ lastError: Option.none() }),
  states: {
    draining: {
      invoke: [flow.observe(outboxResource.ref()), flow.run(drainOutbox)],
      on: {
        DRAIN_FAILED: {
          update: ({ event }) =>
            event.type === "DRAIN_FAILED" ? { lastError: Option.some(event.error) } : {},
        },
      },
    },
  },
});

export const outboxWorker = flow.child({
  id: "offline.outbox-worker",
  machine: outboxWorkerMachine,
  supervision: "stop-on-failure",
});
