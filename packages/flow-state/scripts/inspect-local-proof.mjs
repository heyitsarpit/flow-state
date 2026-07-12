import * as flow from "../dist/index.mjs";
import { captureTrace, createLocalInspectionProof } from "../dist/inspect.mjs";

const machine = flow.machine({
  id: "inspect.local-proof.machine",
  initial: "idle",
  context: () => ({
    count: 0,
  }),
  states: {
    idle: {
      on: {
        START: {
          target: "running",
          update: ({ context }) => ({
            count: context.count + 1,
          }),
        },
      },
    },
    running: {
      on: {
        STOP: {
          target: "done",
        },
      },
    },
    done: {},
  },
});

const runtime = flow.runtime();
const actor = runtime.orchestrators.start(machine);

try {
  actor.send({ type: "START" });
  actor.send({ type: "STOP" });
  await actor.flush();

  const trace = captureTrace(actor.getSnapshot(), {
    includeSnapshots: true,
  });
  const proof = createLocalInspectionProof(trace, runtime.inspection.entries());

  console.log(JSON.stringify(proof, null, 2));
} finally {
  await actor.dispose();
  await runtime.dispose();
}
