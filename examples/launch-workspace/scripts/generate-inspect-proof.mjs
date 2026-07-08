import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import * as flow from "flow-state";
import { captureTrace, createLocalInspectionProof } from "flow-state/inspect";

const outputPath = resolve(
  process.argv[2] ?? "./.eval-artifacts/latest/inspect-local-proof.json",
);

const machine = flow.machine({
  id: "launch-workspace.eval.inspect.machine",
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
  actor.send({ type: "STOP" });
  actor.send({ type: "START" });
  actor.send({ type: "STOP" });
  await actor.flush();

  const proof = createLocalInspectionProof(
    captureTrace(actor.snapshot(), {
      includeSnapshots: true,
    }),
    runtime.inspection.entries(),
  );

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
  console.log(outputPath);
} finally {
  await actor.dispose();
  await runtime.dispose();
}
