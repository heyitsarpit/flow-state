import type { Fault } from "./faults.ts";

const SURFACE = "tests/surface/surface.test.ts";

/**
 * Wrong runtimes of the public boundary: a public function handed out without its wrapper, a
 * wrapper that lets a raw throw through, and a driver that keeps running after a throw outside the
 * core's step.
 */
export const boundaryFaults: ReadonlyArray<Fault> = [
  {
    name: "entry-unwrapped",
    tests: [SURFACE],
    says: "app is exported without its entry wrapper, so a value no check refused escapes as a raw throw",
    rule: "Diagnostics R1",
    edits: [
      {
        file: "src/host/app.ts",
        find: "export const app = entry(",
        replace: "export const app = ((_name, run) => run)(",
      },
    ],
  },
  {
    name: "stray-throw-raw",
    tests: [SURFACE],
    says: "an entry rethrows what its body threw instead of a FlowError Defect with it as the cause",
    rule: "Diagnostics R1, R3",
    edits: [
      {
        file: "src/entry.ts",
        find: "  cause instanceof FlowError\n    ? cause\n",
        replace: "  cause instanceof FlowError || Number.isFinite(0)\n    ? (cause as FlowError)\n",
      },
    ],
  },
  {
    name: "driver-throw-stays-open",
    tests: ["src/host/runtime.test.ts"],
    says: "a throw while a step's commands are performed leaves the Runtime running",
    rule: "Actors R25",
    edits: [
      {
        file: "src/host/driver.ts",
        find: "        stop(performed.failure);\n",
        replace: "",
      },
    ],
  },
];
