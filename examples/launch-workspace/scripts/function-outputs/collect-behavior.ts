import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  buildBehaviorContract,
  diffBehaviorContracts,
  renderBehaviorContract,
  renderBehaviorCoverage,
  renderBehaviorDiff,
  sliceBehaviorContract,
} from "flow-state/inspect";

import { BehaviorGateway } from "../../src/app/behavior";

import type { OutputWriter } from "./output-writer";

export async function collectBehaviorOutputs(
  writer: OutputWriter,
  repoRoot: string,
): Promise<void> {
  const behaviorContract = buildBehaviorContract(BehaviorGateway);
  const docsContract = JSON.parse(
    await readFile(resolve(repoRoot, "apps/docs/src/generated/behavior-contract.json"), "utf8"),
  );
  const launchWorkspaceSlice = sliceBehaviorContract(behaviorContract, "LaunchWorkspace");
  const behaviorDiff = diffBehaviorContracts(behaviorContract, docsContract, {
    moduleId: "LaunchWorkspace",
  });

  await writer.writeJson(
    "behavior/buildBehaviorContract.json",
    behaviorContract,
    "behavior",
    "buildBehaviorContract",
    "Canonical behavior contract built from the explicit behavior gateway.",
  );
  await writer.writeJson(
    "behavior/sliceBehaviorContract.LaunchWorkspace.json",
    launchWorkspaceSlice,
    "behavior",
    "sliceBehaviorContract",
    "Module slice derived from the canonical app contract.",
  );
  await writer.writeText(
    "behavior/renderBehaviorContract.txt",
    renderBehaviorContract(behaviorContract),
    "behavior",
    "renderBehaviorContract",
    "Shared brief renderer over the canonical contract.",
  );
  await writer.writeText(
    "behavior/renderBehaviorContract.LaunchWorkspace.txt",
    renderBehaviorContract(behaviorContract, { moduleId: "LaunchWorkspace" }),
    "behavior",
    "renderBehaviorContract",
    "Module-slice shared brief renderer.",
  );
  await writer.writeText(
    "behavior/renderBehaviorCoverage.LaunchWorkspace.txt",
    renderBehaviorCoverage(BehaviorGateway, { moduleId: "LaunchWorkspace" }),
    "behavior",
    "renderBehaviorCoverage",
    "Coverage renderer over the live behavior gateway.",
  );
  await writer.writeJson(
    "behavior/diffBehaviorContracts.LaunchWorkspace-vs-docs.json",
    behaviorDiff,
    "behavior",
    "diffBehaviorContracts",
    "Structured contract diff between the live Launch Workspace contract and the committed docs contract.",
  );
  await writer.writeText(
    "behavior/renderBehaviorDiff.LaunchWorkspace-vs-docs.txt",
    renderBehaviorDiff(behaviorDiff),
    "behavior",
    "renderBehaviorDiff",
    "Human-readable behavior diff for the module slice.",
  );
}
