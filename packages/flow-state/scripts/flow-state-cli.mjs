#!/usr/bin/env node

/*
Compatibility wrapper over the packaged flow-state CLI binary.
The durable source of truth lives in ../src/cli/index.ts and ships from ../dist/cli/index.mjs.
*/

import { runFlowStateCli } from "../dist/cli/index.mjs";

await runFlowStateCli();
