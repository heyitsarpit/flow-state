import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { buildBehaviorContract as buildBehaviorContractRuntime } from "../../dist/inspect.mjs";

import type { FlowBehaviorContract, FlowBehaviorGateway } from "../inspect.js";

// @ts-expect-error TS5097: the source CLI runs sibling .ts modules directly before dist rewrite.
import { loadGatewayTarget } from "./gateway.ts";

export type FlowCliBehaviorDiffMode = "input" | "target";

export type FlowCliBehaviorDiffOptions = Readonly<{
  readonly "left-input"?: string;
  readonly "right-input"?: string;
  readonly "left-project-root"?: string;
  readonly "right-project-root"?: string;
  readonly "left-gateway"?: string;
  readonly "right-gateway"?: string;
}>;

type FlowCliBehaviorDiffSide = "left" | "right";

const buildBehaviorContract = buildBehaviorContractRuntime as (
  target: FlowBehaviorGateway,
) => FlowBehaviorContract;

function isBehaviorContract(value: unknown): value is FlowBehaviorContract {
  return (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    value.version === "flow-state/behavior-contract.v1"
  );
}

export async function readBehaviorContract(inputPath: string): Promise<FlowBehaviorContract> {
  let source: string;

  try {
    source = await readFile(inputPath, "utf8");
  } catch (error) {
    throw new Error(
      `Unable to read behavior contract at ${inputPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let contract: unknown;

  try {
    contract = JSON.parse(source);
  } catch (error) {
    throw new Error(
      `Unable to parse behavior contract JSON at ${inputPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!isBehaviorContract(contract)) {
    throw new Error(`Expected a behavior contract JSON file at ${inputPath}.`);
  }

  return contract;
}

export async function resolveBehaviorDiffContract(
  options: FlowCliBehaviorDiffOptions,
  side: FlowCliBehaviorDiffSide,
): Promise<FlowBehaviorContract | undefined> {
  const inputPath = options[`${side}-input`];
  const projectRootOption = options[`${side}-project-root`];
  const gatewayOption = options[`${side}-gateway`];

  if (inputPath !== undefined) {
    if (projectRootOption !== undefined || gatewayOption !== undefined) {
      throw new Error(
        `Do not mix --${side}-input with --${side}-project-root or --${side}-gateway; compare either contract files or live build targets.`,
      );
    }

    return readBehaviorContract(resolve(inputPath));
  }

  if (projectRootOption === undefined && gatewayOption === undefined) {
    return undefined;
  }

  const { gateway } = await loadGatewayTarget(
    Object.freeze({
      ...(projectRootOption === undefined ? {} : { "project-root": projectRootOption }),
      ...(gatewayOption === undefined ? {} : { gateway: gatewayOption }),
    }),
  );

  return buildBehaviorContract(gateway);
}

export function behaviorDiffMode(options: FlowCliBehaviorDiffOptions): FlowCliBehaviorDiffMode {
  const usingInputs = options["left-input"] !== undefined || options["right-input"] !== undefined;
  const usingTargets =
    options["left-project-root"] !== undefined ||
    options["left-gateway"] !== undefined ||
    options["right-project-root"] !== undefined ||
    options["right-gateway"] !== undefined;

  if (usingInputs && usingTargets) {
    throw new Error(
      "Do not mix contract-file inputs with live build-target flags in one diff command.",
    );
  }

  if (usingInputs) {
    return "input";
  }

  if (usingTargets) {
    return "target";
  }

  throw new Error(
    "Expected either --left-input/--right-input or left/right project-root or gateway flags for live build targets.",
  );
}
