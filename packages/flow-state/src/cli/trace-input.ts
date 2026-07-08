import { readFile } from "node:fs/promises";

import {
  createLocalInspectionProof as createLocalInspectionProofRuntime,
  importTraceArtifact as importTraceArtifactRuntime,
} from "../inspect.js";

import type { FlowLocalInspectionProof, FlowTraceDescriptor } from "../inspect.js";

export type FlowCliTraceInputSource =
  | "trace-artifact"
  | "story-run-trace"
  | "local-inspection-proof";

export type FlowCliNormalizedTraceInput = Readonly<{
  path: string;
  source: FlowCliTraceInputSource;
  trace: FlowTraceDescriptor;
}>;

export type FlowCliNormalizedTraceProofInput = FlowCliNormalizedTraceInput &
  Readonly<{
    proof: FlowLocalInspectionProof;
  }>;

const importTraceArtifact = importTraceArtifactRuntime as (
  value: unknown,
) => FlowTraceDescriptor | undefined;

const createLocalInspectionProof = createLocalInspectionProofRuntime as (
  trace: FlowTraceDescriptor,
  selectors: ReadonlyArray<never>,
) => FlowLocalInspectionProof;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function traceSourceOf(artifact: unknown): FlowCliTraceInputSource {
  if (!isRecord(artifact)) {
    return "trace-artifact";
  }

  const options =
    "options" in artifact && isRecord(artifact.options) ? artifact.options : undefined;

  return options?.storyId === undefined ? "trace-artifact" : "story-run-trace";
}

function normalizeTraceValue(
  value: unknown,
): Readonly<{ source: FlowCliTraceInputSource; trace: FlowTraceDescriptor }> | undefined {
  const importedArtifact = importTraceArtifact(value);

  if (importedArtifact !== undefined) {
    return Object.freeze({
      source: traceSourceOf(value),
      trace: importedArtifact,
    });
  }

  if (!isRecord(value)) {
    return undefined;
  }

  if (value.kind === "local-inspection-proof" && "traceArtifact" in value) {
    const importedProofArtifact = importTraceArtifact(value.traceArtifact);

    if (importedProofArtifact !== undefined) {
      return Object.freeze({
        source: "local-inspection-proof" as const,
        trace: importedProofArtifact,
      });
    }
  }

  if (value.kind === "story-run" && "traceArtifact" in value) {
    const importedStoryArtifact = importTraceArtifact(value.traceArtifact);

    if (importedStoryArtifact !== undefined) {
      return Object.freeze({
        source: "story-run-trace" as const,
        trace: importedStoryArtifact,
      });
    }
  }

  return undefined;
}

function isLocalInspectionProofValue(value: unknown): value is FlowLocalInspectionProof {
  return (
    isRecord(value) &&
    value.kind === "local-inspection-proof" &&
    typeof value.machineId === "string" &&
    "actorTree" in value &&
    isRecord(value.actorTree) &&
    "eventTimeline" in value &&
    Array.isArray(value.eventTimeline) &&
    "correlations" in value &&
    Array.isArray(value.correlations) &&
    "formatted" in value &&
    isRecord(value.formatted) &&
    typeof value.formatted.eventTimeline === "string"
  );
}

async function readJsonFile(inputPath: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(inputPath, "utf8"));
  } catch (error) {
    throw new Error(
      `Expected JSON at ${inputPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function normalizeTraceInput(
  traceOrProofPath: string,
): Promise<FlowCliNormalizedTraceInput> {
  const parsed = await readJsonFile(traceOrProofPath);

  const normalized = normalizeTraceValue(parsed);

  if (normalized === undefined) {
    throw new Error(
      `Expected a trace artifact, local inspection proof, or story-run trace JSON at ${traceOrProofPath}.`,
    );
  }

  return Object.freeze({
    path: traceOrProofPath,
    source: normalized.source,
    trace: normalized.trace,
  });
}

export async function normalizeTraceProofInput(
  traceOrProofPath: string,
): Promise<FlowCliNormalizedTraceProofInput> {
  const parsed = await readJsonFile(traceOrProofPath);
  const normalizedTrace = normalizeTraceValue(parsed);

  if (normalizedTrace === undefined) {
    throw new Error(
      `Expected a trace artifact, local inspection proof, or story-run trace JSON at ${traceOrProofPath}.`,
    );
  }

  return Object.freeze({
    path: traceOrProofPath,
    source: normalizedTrace.source,
    trace: normalizedTrace.trace,
    proof: isLocalInspectionProofValue(parsed)
      ? parsed
      : createLocalInspectionProof(normalizedTrace.trace, []),
  });
}
