import { readFile } from "node:fs/promises";

function usage() {
  return [
    "Usage:",
    "  inspect-cli.mjs buffer <local-proof.json>",
    "  inspect-cli.mjs trace <local-proof.json> [actorId]",
    "  inspect-cli.mjs failures <local-proof.json>",
  ].join("\n");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLocalInspectionProof(value) {
  return isRecord(value) && value.kind === "local-inspection-proof";
}

async function readLocalInspectionProof(path) {
  let parsed;

  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  if (!isLocalInspectionProof(parsed)) {
    fail(`Expected a local inspection proof JSON file at ${path}.`);
  }

  return parsed;
}

function findActorNode(node, actorId) {
  if (!isRecord(node)) {
    return undefined;
  }

  if (node.id === actorId || node.actorId === actorId) {
    return node;
  }

  const children = isRecord(node.children) ? Object.values(node.children) : [];
  for (const child of children) {
    const match = findActorNode(child, actorId);
    if (match !== undefined) {
      return match;
    }
  }

  return undefined;
}

function correlationTouchesActor(correlation, actorId) {
  if (!isRecord(correlation)) {
    return false;
  }

  if (correlation.sourceActorId === actorId || correlation.targetActorId === actorId) {
    return true;
  }

  const relatedIds = Array.isArray(correlation.summary?.relatedIds)
    ? correlation.summary.relatedIds
    : [];
  if (relatedIds.includes(actorId)) {
    return true;
  }

  const children = Array.isArray(correlation.details?.children) ? correlation.details.children : [];
  return children.some((child) => isRecord(child) && child.actorId === actorId);
}

function renderFailureSummaryLine(correlation, index) {
  const eventType =
    isRecord(correlation.summary) && typeof correlation.summary.eventType === "string"
      ? correlation.summary.eventType
      : "unknown";
  const relatedIds =
    isRecord(correlation.summary) && Array.isArray(correlation.summary.relatedIds)
      ? correlation.summary.relatedIds
      : [];
  const issues = Array.isArray(correlation.issues) ? correlation.issues : [];
  const outcomes = Array.isArray(correlation.outcomes) ? correlation.outcomes : [];
  const outcomeKinds = outcomes
    .map((outcome) => (isRecord(outcome) && typeof outcome.kind === "string" ? outcome.kind : undefined))
    .filter((kind) => kind !== undefined);

  return `  ${index + 1}. ${correlation.correlationId} event=${eventType} issues=${issues.length} outcomes=${outcomeKinds.length === 0 ? "(none)" : outcomeKinds.join(",")} relatedIds=${relatedIds.length === 0 ? "(none)" : relatedIds.join(",")}`;
}

const [command, proofPath, actorId] = process.argv.slice(2);

if (command === undefined || proofPath === undefined) {
  fail(usage());
}

const proof = await readLocalInspectionProof(proofPath);

switch (command) {
  case "buffer": {
    const timeline =
      isRecord(proof.formatted) && typeof proof.formatted.eventTimeline === "string"
        ? proof.formatted.eventTimeline
        : "(no inspection events)";
    console.log(timeline);
    break;
  }

  case "trace": {
    if (actorId === undefined) {
      const trace =
        isRecord(proof.formatted) && typeof proof.formatted.trace === "string"
          ? proof.formatted.trace
          : JSON.stringify(proof.traceArtifact, null, 2);
      console.log(trace);
      break;
    }

    const actor = findActorNode(proof.actorTree, actorId);
    if (actor === undefined) {
      fail(`Could not find actor '${actorId}' in ${proofPath}.`);
    }

    const correlations = Array.isArray(proof.correlations)
      ? proof.correlations.filter((correlation) => correlationTouchesActor(correlation, actorId))
      : [];

    console.log(
      JSON.stringify(
        {
          machineId: proof.machineId,
          actorId,
          actor,
          correlations,
          traceArtifact: proof.traceArtifact,
        },
        null,
        2,
      ),
    );
    break;
  }

  case "failures": {
    const correlations = Array.isArray(proof.correlations) ? proof.correlations : [];
    const failures = correlations.filter((correlation) => {
      const issues = Array.isArray(correlation.issues) ? correlation.issues : [];
      const outcomes = Array.isArray(correlation.outcomes) ? correlation.outcomes : [];

      return issues.length > 0 || outcomes.some((outcome) => outcome?.kind !== "success");
    });

    if (failures.length === 0) {
      console.log("(no failure correlations)");
      break;
    }

    console.log(
      ["Failure correlations", ...failures.map(renderFailureSummaryLine)].join("\n"),
    );
    break;
  }

  default:
    fail(usage());
}
