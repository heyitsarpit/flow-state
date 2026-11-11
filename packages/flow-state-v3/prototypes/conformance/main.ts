// bun packages/flow-state-v3/prototypes/conformance/main.ts --round 6 --runtime ../round-6/adapter.ts
//   [--no-search] [--lock]. Searches run separately: search/run.ts. Ends with one VERDICT line (verdicts/state.ts); the suite is suite.ts,
//   loaded inside `stated`, so a throw while loading it or the runtime is the verdict's `threw`.
import { stated } from "./verdicts/state.ts";

await stated("suite", async () => (await import("./suite.ts")).cli());
