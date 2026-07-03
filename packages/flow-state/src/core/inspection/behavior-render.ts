import type { FlowBehaviorContract } from "./behavior-contract.js";

import { sliceBehaviorContract } from "./behavior-contract.js";

export type FlowBehaviorRenderOptions = Readonly<{
  moduleId?: string;
}>;

function uniqueOrdered(values: ReadonlyArray<string>): ReadonlyArray<string> {
  const seen = new Set<string>();
  const ordered: Array<string> = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    ordered.push(value);
  }

  return Object.freeze(ordered);
}

function commaList(values: ReadonlyArray<string>, empty = "none"): string {
  return values.length === 0 ? empty : values.join(", ");
}

function resourceSummary(contract: FlowBehaviorContract): string {
  if (contract.resources.length === 0) {
    return "none";
  }

  return contract.resources
    .map((resource) => {
      const facts = [
        resource.hasSchema ? "schema" : "no schema",
        resource.hasPlaceholder ? "placeholder" : "no placeholder",
        resource.freshness === null
          ? "no freshness policy"
          : `freshness ${String(resource.freshness.staleAfter)}; invalidate ${resource.freshness.onInvalidate ?? "default"}`,
      ];

      return `${resource.id} (${facts.join("; ")})`;
    })
    .join(", ");
}

function transactionSummary(contract: FlowBehaviorContract): string {
  if (contract.transactions.length === 0) {
    return "none";
  }

  return contract.transactions
    .map((transaction) => {
      const facts = [
        transaction.hasPreview ? "preview" : "no preview",
        transaction.hasQueueWhen ? "queue when" : "no queue when",
        transaction.hasQueueReplay ? "queue replay" : "no queue replay",
        transaction.hasQueueUndo ? "queue undo" : "no queue undo",
        transaction.concurrency === null
          ? "default concurrency"
          : `concurrency ${transaction.concurrency}`,
      ];

      return `${transaction.id} (${facts.join("; ")})`;
    })
    .join(", ");
}

function streamSummary(contract: FlowBehaviorContract): string {
  if (contract.streams.length === 0) {
    return "none";
  }

  return contract.streams
    .map((stream) => {
      const pressure =
        stream.pressure === null
          ? "no pressure policy"
          : stream.pressure.strategy === "queue"
            ? `pressure ${stream.pressure.strategy}${stream.pressure.limit === null ? "" : ` limit=${stream.pressure.limit}`}`
            : `pressure ${stream.pressure.strategy}`;

      return `${stream.id} (${pressure}; routes ${commaList(stream.routeKinds)})`;
    })
    .join(", ");
}

function proofSurfaceSummary(contract: FlowBehaviorContract): Readonly<{
  stories: number;
  coverage: string;
  blockedOrMismatch: string;
}> {
  const setupStories = contract.stories.filter((story) => story.start === "setup").length;

  return Object.freeze({
    stories: contract.stories.length,
    coverage:
      "derived coverage view arrives in `behavior render --section coverage`; the canonical contract does not store story paths as a second format.",
    blockedOrMismatch:
      setupStories === 0
        ? "setup-described stories: none; mismatch lanes are not stored in the canonical contract."
        : `setup-described stories: ${setupStories}; mismatch lanes are not stored in the canonical contract.`,
  });
}

function renderMachineSections(contract: FlowBehaviorContract): Array<string> {
  if (contract.machines.length === 0) {
    return ["(no machines)"];
  }

  return contract.machines.flatMap((machine) => {
    const keyTransitions =
      machine.transitions.length === 0
        ? ["- Key transitions: none"]
        : [
            "- Key transitions:",
            ...machine.transitions.map(
              (transition) =>
                `  - ${transition.source} --${transition.eventType}--> ${transition.target}`,
            ),
          ];

    return [
      `### ${machine.id}`,
      "",
      `- Initial state: ${machine.initialStateId}`,
      `- States: ${commaList(machine.states.map((state) => state.id))}`,
      ...keyTransitions,
      "",
    ];
  });
}

function renderRuntimeWorkSections(contract: FlowBehaviorContract): Array<string> {
  if (contract.machines.length === 0) {
    return ["(no runtime work)"];
  }

  return contract.machines.flatMap((machine) =>
    machine.states.flatMap((state) => [
      `### ${machine.id}/${state.id}`,
      "",
      `- Children: ${commaList(state.childIds)}`,
      `- Timed transitions: ${commaList(state.timedTransitions.map((transition) => transition.id))}`,
      `- Eventless transitions: ${commaList(
        state.eventlessTransitions.map((transition) => transition.target),
      )}`,
      "",
    ]),
  );
}

export function renderBehaviorContract(
  contract: FlowBehaviorContract,
  options: FlowBehaviorRenderOptions = {},
): string {
  const selected =
    options.moduleId === undefined ? contract : sliceBehaviorContract(contract, options.moduleId);
  const appScreens = uniqueOrdered(selected.modules.flatMap((module) => module.screenIds));
  const fixtureIds = uniqueOrdered(selected.modules.flatMap((module) => module.fixtureIds));
  const proofSurface = proofSurfaceSummary(selected);
  const title =
    options.moduleId === undefined
      ? `# ${selected.app.id}`
      : `# ${contract.app.id} (module slice: ${options.moduleId})`;

  return [
    title,
    "",
    "## App",
    "",
    `- Modules: ${commaList(selected.app.moduleIds)}`,
    `- Screens: ${commaList(appScreens)}`,
    `- Fixtures: ${commaList(fixtureIds)}`,
    `- Resources: ${resourceSummary(selected)}`,
    "",
    "## Main Machines",
    "",
    ...renderMachineSections(selected),
    "## Runtime Work",
    "",
    ...renderRuntimeWorkSections(selected),
    "## Writes And Streams",
    "",
    `- Transactions: ${transactionSummary(selected)}`,
    `- Streams: ${streamSummary(selected)}`,
    "",
    "## Views",
    "",
    ...(selected.views.length === 0
      ? ["(no views)"]
      : selected.views.map((view) => `- ${view.id}: ${commaList(view.sources)}`)),
    "",
    "## Current Proof Surface",
    "",
    `- Stories: ${proofSurface.stories}`,
    `- Covered states/transitions: ${proofSurface.coverage}`,
    `- Blocked or mismatch stories: ${proofSurface.blockedOrMismatch}`,
  ].join("\n");
}
