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

const runtime = flow.runtime(
  flow.app({ modules: [] }).layer({
    store: flow.store.test(),
    orchestrators: flow.orchestrators.test(),
  }),
);
const actor = runtime.createActor(machine);

try {
  actor.send({ type: "START" });
  actor.send({ type: "STOP" });
  await actor.flush();

  const trace = captureTrace(actor.snapshot(), {
    includeSnapshots: true,
  });
  const proof = createLocalInspectionProof(trace, runtime.inspection.entries());

  console.log(JSON.stringify(proof, null, 2));
} finally {
  await actor.dispose();
  await runtime.dispose();
}
