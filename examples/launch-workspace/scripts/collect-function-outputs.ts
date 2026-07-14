/// <reference types="node" />

import { resolve } from "node:path";

import { collectBehaviorOutputs } from "./function-outputs/collect-behavior";
import { collectInspectionOutputs } from "./function-outputs/collect-inspection";
import { collectInventoryOutputs } from "./function-outputs/collect-inventory";
import { collectTestingOutputs } from "./function-outputs/collect-testing";
import { createOutputWriter } from "./function-outputs/output-writer";

const outputRoot = resolve(process.argv[2] ?? "./.eval-artifacts/latest/function-outputs");
const repoRoot = resolve(process.argv[3] ?? "../..");

const writer = await createOutputWriter(outputRoot);
await collectInventoryOutputs(writer);
await collectBehaviorOutputs(writer, repoRoot);
await collectTestingOutputs(writer);
await collectInspectionOutputs(writer);
await writer.writeManifest();
