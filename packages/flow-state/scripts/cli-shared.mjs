import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { importTraceArtifact, storyToDoc, summarizeTrace } from "../dist/inspect.mjs";

function isMachine(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    "kind" in value &&
    value.kind === "machine" &&
    "id" in value &&
    typeof value.id === "string"
  );
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function resolveProjectRoot(projectRootOption) {
  return resolve(projectRootOption ?? process.cwd());
}

export function resolveGatewayPath(projectRoot, gatewayOption) {
  return gatewayOption === undefined
    ? resolve(projectRoot, "src/app/behavior.ts")
    : resolve(projectRoot, gatewayOption);
}

export async function loadBehaviorGateway(gatewayPath, projectRoot) {
  const tempRoot = await mkdtemp(join(projectRoot, ".flow-state-cli-"));
  const bundledPath = join(tempRoot, "behavior-gateway.mjs");

  try {
    execFileSync(
      "pnpm",
      [
        "exec",
        "esbuild",
        gatewayPath,
        "--bundle",
        "--format=esm",
        "--platform=node",
        "--target=node22",
        `--outfile=${bundledPath}`,
        "--external:effect",
        "--external:flow-state",
        "--external:flow-state/*",
        "--external:next",
        "--external:react",
        "--external:react-dom",
      ],
      {
        cwd: projectRoot,
        encoding: "utf8",
        stdio: "pipe",
      },
    );

    const module = await import(pathToFileURL(bundledPath).href);
    const gateway = module.BehaviorGateway;

    if (
      typeof gateway !== "object" ||
      gateway === null ||
      !("app" in gateway) ||
      typeof gateway.app !== "object" ||
      gateway.app === null ||
      gateway.app.kind !== "app"
    ) {
      throw new Error(`Expected named export BehaviorGateway from ${gatewayPath}.`);
    }

    return gateway;
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

export async function loadGatewayTarget(options = {}) {
  const projectRoot = resolveProjectRoot(options["project-root"]);
  const gatewayPath = resolveGatewayPath(projectRoot, options.gateway);
  const gateway = await loadBehaviorGateway(gatewayPath, projectRoot);

  return {
    projectRoot,
    gatewayPath,
    gateway,
  };
}

export function createMachineRegistry(app) {
  const machines = new Map();

  for (const module of app.modules) {
    const registry = module.machines;
    if (registry === undefined || registry === null || typeof registry !== "object") {
      continue;
    }

    for (const machine of Object.values(registry)) {
      if (!isMachine(machine)) {
        continue;
      }

      const existing = machines.get(machine.id);
      if (existing !== undefined && existing !== machine) {
        throw new Error(
          `Duplicate machine id '${machine.id}' in the assembled app. Rename one machine before using the shared story registry.`,
        );
      }

      machines.set(machine.id, machine);
    }
  }

  return machines;
}

export function createStoryRegistry(gateway) {
  const machinesById = createMachineRegistry(gateway.app);
  const entries = [];
  const seenIds = new Set();

  for (const descriptor of gateway.stories ?? []) {
    const ownedMachine = machinesById.get(descriptor.machine.id);
    if (ownedMachine !== descriptor.machine) {
      throw new Error(
        `BehaviorGateway stories reference machine '${descriptor.machine.id}', but the assembled app does not own it.`,
      );
    }

    for (const story of descriptor.stories) {
      if (seenIds.has(story.id)) {
        throw new Error(
          `Duplicate story id '${story.id}' in BehaviorGateway.stories. Rename the story so agents can resolve it unambiguously.`,
        );
      }

      seenIds.add(story.id);
      entries.push(
        Object.freeze({
          machine: descriptor.machine,
          machineId: descriptor.machine.id,
          story,
          doc: storyToDoc(story),
        }),
      );
    }
  }

  return Object.freeze({
    app: gateway.app,
    machinesById,
    stories: Object.freeze(entries),
    storiesById: new Map(entries.map((entry) => [entry.story.id, entry])),
  });
}

export function formatStoryListText(entries) {
  const lines = ["# Stories"];

  if (entries.length === 0) {
    lines.push("", "- No stories matched the current filters.");
    return lines.join("\n");
  }

  for (const entry of entries) {
    const detailParts = [`start=${entry.doc.start.kind}`];

    if (entry.story.expectedState !== undefined) {
      detailParts.push(`expectedState=${entry.story.expectedState}`);
    }

    if (entry.doc.tags.length > 0) {
      detailParts.push(`tags=${entry.doc.tags.join(",")}`);
    }

    if (entry.doc.seed !== undefined) {
      detailParts.push(`seed=${entry.doc.seed.label}`);
    }

    lines.push(
      "",
      `- ${entry.story.id} [${entry.machineId}] ${entry.story.title}`,
      `  ${detailParts.join(" | ")}`,
    );
  }

  return lines.join("\n");
}

function formatList(values) {
  return values.length === 0 ? "none" : values.join(", ");
}

export function formatStoryDescribeText(entry) {
  const lines = [
    `# Story: ${entry.story.id}`,
    `Machine: ${entry.machineId}`,
    `Title: ${entry.story.title}`,
  ];

  if (entry.story.description !== undefined) {
    lines.push(`Description: ${entry.story.description}`);
  }

  lines.push(`Start: ${entry.doc.start.label}`);

  if (entry.doc.seed !== undefined) {
    lines.push(`Seed: ${entry.doc.seed.label}`);
  }

  lines.push(`Tags: ${formatList(entry.doc.tags)}`);
  lines.push("Events:");

  if (entry.doc.events.length === 0) {
    lines.push("- none");
  } else {
    for (const event of entry.doc.events) {
      lines.push(`- ${event.label}`);
    }
  }

  lines.push("Expectations:");
  if (entry.doc.expectations.length === 0) {
    lines.push("- none");
  } else {
    for (const expectation of entry.doc.expectations) {
      lines.push(`- ${expectation.label}`);
    }
  }

  return lines.join("\n");
}

export function storyListJson(entries) {
  return Object.freeze({
    kind: "story-list",
    stories: Object.freeze(
      entries.map((entry) =>
        Object.freeze({
          id: entry.story.id,
          machineId: entry.machineId,
          title: entry.story.title,
          description: entry.story.description,
          start: entry.doc.start.kind,
          expectedState: entry.story.expectedState,
          tags: entry.doc.tags,
          ...(entry.doc.seed === undefined
            ? {}
            : {
                seed: Object.freeze({
                  label: entry.doc.seed.label,
                  fixtures: entry.doc.seed.fixtures,
                  resourceCount: entry.doc.seed.resourceCount,
                  hasBoot: entry.doc.seed.hasBoot,
                  ...(entry.doc.seed.actorId === undefined
                    ? {}
                    : { actorId: entry.doc.seed.actorId }),
                }),
              }),
        }),
      ),
    ),
  });
}

export function storyDescribeJson(entry) {
  return Object.freeze({
    kind: "story-describe",
    machineId: entry.machineId,
    story: entry.doc,
  });
}

function uniqueValues(values) {
  return Object.freeze([...new Set(values)]);
}

function summarizeIssueField(issues, field) {
  return uniqueValues(issues.map((issue) => issue[field]));
}

function summarizeOutcomeField(outcomes, field) {
  return uniqueValues(outcomes.map((outcome) => outcome[field]));
}

export function createStoryRunEnvelope(entry, outcome, check) {
  const story = Object.freeze({
    id: entry.story.id,
    machineId: entry.machineId,
    title: entry.story.title,
    ...(entry.story.description === undefined ? {} : { description: entry.story.description }),
    start: entry.doc.start.kind,
    tags: entry.doc.tags,
    ...(entry.story.expectedState === undefined
      ? {}
      : { expectedState: entry.story.expectedState }),
    ...(entry.doc.seed === undefined
      ? {}
      : {
          seed: Object.freeze({
            label: entry.doc.seed.label,
            fixtures: entry.doc.seed.fixtures,
            resourceCount: entry.doc.seed.resourceCount,
            hasBoot: entry.doc.seed.hasBoot,
            ...(entry.doc.seed.actorId === undefined ? {} : { actorId: entry.doc.seed.actorId }),
          }),
        }),
  });

  const envelope = {
    kind: "story-run",
    story,
    outcome:
      outcome.kind === "story-run-blocked"
        ? Object.freeze({
            kind: outcome.kind,
            reason: outcome.reason,
          })
        : Object.freeze({
            kind: outcome.kind,
            finalState: outcome.finalSnapshot.value,
            receiptCount: outcome.receipts.length,
            issueCount: outcome.issues.length,
            receiptSummary: outcome.trace.report.summary,
            issueSummary: Object.freeze({
              count: outcome.trace.report.issues.length,
              kinds: summarizeIssueField(outcome.trace.report.issues, "kind"),
              sources: summarizeIssueField(outcome.trace.report.issues, "source"),
            }),
            outcomeSummary: Object.freeze({
              count: outcome.trace.report.outcomes.length,
              kinds: summarizeOutcomeField(outcome.trace.report.outcomes, "kind"),
              sources: summarizeOutcomeField(outcome.trace.report.outcomes, "source"),
            }),
          }),
    ...(check === undefined
      ? {}
      : {
          check: Object.freeze({
            kind: check.kind,
            ok: check.ok,
            checkCount: check.checks.length,
            failureCount: check.failures.length,
            checks: check.checks,
            failures: check.failures,
          }),
        }),
  };

  return Object.freeze(envelope);
}

export function formatStoryRunPretty(envelope) {
  const lines = [
    `# Story Run: ${envelope.story.id}`,
    `Machine: ${envelope.story.machineId}`,
    `Title: ${envelope.story.title}`,
  ];

  if (envelope.outcome.kind === "story-run-blocked") {
    lines.push("Execution: blocked", `Blocked reason: ${envelope.outcome.reason}`);
  } else {
    lines.push(
      "Execution: story-run",
      `Final state: ${envelope.outcome.finalState}`,
      `Receipt count: ${envelope.outcome.receiptCount}`,
      `Issue count: ${envelope.outcome.issueCount}`,
      `Receipt types: ${formatList(envelope.outcome.receiptSummary.receiptTypes)}`,
      `Related ids: ${formatList(envelope.outcome.receiptSummary.relatedIds)}`,
      `Issue kinds: ${formatList(envelope.outcome.issueSummary.kinds)}`,
      `Issue sources: ${formatList(envelope.outcome.issueSummary.sources)}`,
      `Outcome kinds: ${formatList(envelope.outcome.outcomeSummary.kinds)}`,
      `Outcome sources: ${formatList(envelope.outcome.outcomeSummary.sources)}`,
    );
  }

  if (envelope.check !== undefined) {
    lines.push(
      `Check: ${envelope.check.ok ? "pass" : "fail"} (${envelope.check.checkCount} checks, ${envelope.check.failureCount} failures)`,
    );

    if (envelope.check.failureCount > 0) {
      lines.push("Failures:");

      for (const failure of envelope.check.failures) {
        lines.push(`- ${failure.label}`);
      }
    }
  }

  return lines.join("\n");
}

export function formatStoryRunCompact(envelope) {
  const head = `story ${envelope.story.id} [${envelope.story.machineId}]`;

  if (envelope.outcome.kind === "story-run-blocked") {
    return `${head} blocked reason=${envelope.outcome.reason}${
      envelope.check === undefined ? "" : ` check=${envelope.check.ok ? "pass" : "fail"}`
    }`;
  }

  return [
    head,
    `finalState=${envelope.outcome.finalState}`,
    `receipts=${envelope.outcome.receiptCount}`,
    `issues=${envelope.outcome.issueCount}`,
    `receiptTypes=${formatList(envelope.outcome.receiptSummary.receiptTypes)}`,
    `relatedIds=${formatList(envelope.outcome.receiptSummary.relatedIds)}`,
    `issueKinds=${formatList(envelope.outcome.issueSummary.kinds)}`,
    `outcomeKinds=${formatList(envelope.outcome.outcomeSummary.kinds)}`,
    ...(envelope.check === undefined
      ? []
      : [`check=${envelope.check.ok ? "pass" : "fail"}`, `failures=${envelope.check.failureCount}`]),
  ].join(" ");
}

function stateIdsForMachine(machine) {
  return Object.freeze(Object.keys(machine.config.states).sort());
}

function snapshotForState(machine, stateId) {
  return Object.freeze({
    ...machine.getInitialSnapshot(),
    value: stateId,
  });
}

function pathSummary(path) {
  return Object.freeze({
    finalState: path.state.value,
    stepCount: path.steps.length,
    weight: path.weight,
    description: path.description,
    events: Object.freeze(path.steps.map((step) => step.event)),
  });
}

export function normalizeStoryPathRequest(registry, options) {
  const machine = registry.machinesById.get(options.machine);

  if (machine === undefined) {
    throw new Error(
      `Unknown machine '${options.machine}'. Available machine ids: ${[...registry.machinesById.keys()]
        .sort()
        .join(", ")}.`,
    );
  }

  const availableStateIds = stateIdsForMachine(machine);
  const fromState = options["from-state"];
  const toState = options["to-state"];
  const events = options.events;

  if (options.check && events.length === 0) {
    throw new Error("`story paths --check` requires at least one `--event <json>` input.");
  }

  if (fromState !== undefined && !availableStateIds.includes(fromState)) {
    throw new Error(
      `Unknown start state '${fromState}' for machine '${machine.id}'. Available states: ${availableStateIds.join(", ")}.`,
    );
  }

  if (toState !== undefined && !availableStateIds.includes(toState)) {
    throw new Error(
      `Unknown target state '${toState}' for machine '${machine.id}'. Available states: ${availableStateIds.join(", ")}.`,
    );
  }

  const fromSnapshot = fromState === undefined ? undefined : snapshotForState(machine, fromState);
  const toStatePredicate =
    toState === undefined ? undefined : (snapshot) => snapshot.value === toState;

  return Object.freeze({
    machine,
    strategy: options.strategy,
    check: options.check,
    events,
    fromState,
    toState,
    modelOptions: Object.freeze({
      ...(events.length === 0 ? {} : { events }),
      ...(fromSnapshot === undefined ? {} : { fromState: fromSnapshot }),
      ...(toStatePredicate === undefined ? {} : { toState: toStatePredicate }),
      ...(options.limit === undefined ? {} : { limit: options.limit }),
    }),
    graphOptions: Object.freeze({
      ...(fromSnapshot === undefined ? {} : { fromState: fromSnapshot }),
      ...(toStatePredicate === undefined ? {} : { toState: toStatePredicate }),
    }),
  });
}

export function createStoryPathListEnvelope(request, paths) {
  return Object.freeze({
    kind: "story-path-list",
    machineId: request.machine.id,
    strategy: request.strategy,
    pathCount: paths.length,
    ...(request.fromState === undefined ? {} : { fromState: request.fromState }),
    ...(request.toState === undefined ? {} : { toState: request.toState }),
    ...(request.events.length === 0 ? {} : { events: request.events }),
    paths: Object.freeze(paths.map((path) => pathSummary(path))),
  });
}

export function createStoryPathCheckEnvelope(request, path) {
  return Object.freeze({
    kind: "story-path-check",
    machineId: request.machine.id,
    ok: path !== undefined,
    ...(request.fromState === undefined ? {} : { fromState: request.fromState }),
    ...(request.toState === undefined ? {} : { toState: request.toState }),
    events: request.events,
    ...(path === undefined
      ? { reason: "No legal path matched the supplied event sequence." }
      : { path: pathSummary(path) }),
  });
}

export function formatStoryPathListText(envelope) {
  const lines = [
    `# Story Paths: ${envelope.machineId}`,
    `Strategy: ${envelope.strategy}`,
    `Path count: ${envelope.pathCount}`,
  ];

  if (envelope.fromState !== undefined) {
    lines.push(`From state: ${envelope.fromState}`);
  }

  if (envelope.toState !== undefined) {
    lines.push(`To state: ${envelope.toState}`);
  }

  if (envelope.events !== undefined) {
    lines.push(`Event candidates: ${envelope.events.map((event) => event.type).join(", ")}`);
  }

  if (envelope.paths.length === 0) {
    lines.push("Paths: none");
    return lines.join("\n");
  }

  lines.push("Paths:");
  for (const path of envelope.paths) {
    lines.push(`- ${path.description}`);
  }

  return lines.join("\n");
}

export function formatStoryPathCheckText(envelope) {
  const lines = [
    `# Story Path Check: ${envelope.machineId}`,
    `Status: ${envelope.ok ? "valid" : "invalid"}`,
    `Events: ${envelope.events.map((event) => event.type).join(", ")}`,
  ];

  if (envelope.fromState !== undefined) {
    lines.push(`From state: ${envelope.fromState}`);
  }

  if (envelope.toState !== undefined) {
    lines.push(`To state: ${envelope.toState}`);
  }

  if (!envelope.ok) {
    lines.push(envelope.reason);
    return lines.join("\n");
  }

  lines.push(`Final state: ${envelope.path.finalState}`, `Description: ${envelope.path.description}`);
  return lines.join("\n");
}

function traceSourceOf(artifact) {
  return artifact.options?.storyId === undefined ? "trace-artifact" : "story-run-trace";
}

function normalizeTraceValue(value) {
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
        source: "local-inspection-proof",
        trace: importedProofArtifact,
      });
    }
  }

  if (value.kind === "story-run" && "traceArtifact" in value) {
    const importedStoryArtifact = importTraceArtifact(value.traceArtifact);

    if (importedStoryArtifact !== undefined) {
      return Object.freeze({
        source: "story-run-trace",
        trace: importedStoryArtifact,
      });
    }
  }

  return undefined;
}

export async function normalizeTraceInput(traceOrProofPath) {
  let parsed;

  try {
    parsed = JSON.parse(await readFile(traceOrProofPath, "utf8"));
  } catch (error) {
    throw new Error(
      `Expected JSON at ${traceOrProofPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

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

export function createTraceSummaryEnvelope(normalized) {
  const summary = summarizeTrace(normalized.trace);

  return Object.freeze({
    kind: "trace-summary",
    source: normalized.source,
    machineId: summary.machineId,
    summary,
  });
}

export function formatTraceSummaryText(envelope) {
  return [
    "# Trace Summary",
    `Machine: ${envelope.machineId}`,
    `Source: ${envelope.source}`,
    `Final state: ${envelope.summary.finalState}`,
    `Headline: ${envelope.summary.headline}`,
    `Receipt count: ${envelope.summary.receiptCount}`,
    `Correlation count: ${envelope.summary.correlationCount}`,
    `Issue count: ${envelope.summary.issueCount}`,
    `Receipt types: ${formatList(envelope.summary.receiptTypes)}`,
    `Related ids: ${formatList(envelope.summary.relatedIds)}`,
  ].join("\n");
}
