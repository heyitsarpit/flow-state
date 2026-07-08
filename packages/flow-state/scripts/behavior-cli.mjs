#!/usr/bin/env node

/*
Compatibility entrypoint for the narrowed public behavior CLI surface:
  flow-state behavior build [--project-root <path>] [--gateway <path>] [--output <path>]
  flow-state behavior render [--input <path>] [--module <id>]
  flow-state behavior render [--section coverage] [--project-root <path>] [--gateway <path>] [--module <id>]
  flow-state behavior diff --left-input <path> --right-input <path> [--module <id>] [--format text|json]
  flow-state behavior diff [--left-project-root <path>] [--left-gateway <path>] [--right-project-root <path>] [--right-gateway <path>] [--module <id>] [--format text|json]
*/

import { runFlowStateCli } from "../dist/cli/index.mjs";

const forwarded = process.argv.slice(2);

await runFlowStateCli(forwarded[0] === "behavior" ? forwarded : ["behavior", ...forwarded]);
