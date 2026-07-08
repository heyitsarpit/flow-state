#!/usr/bin/env node

/*
Compatibility wrapper over the package-owned TypeScript CLI source.
The durable source of truth lives in ../src/cli/index.ts.
*/

import { runFlowStateCli } from "../src/cli/index.ts";

await runFlowStateCli();
