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
          : `pressure ${stream.pressure.strategy} limit=${stream.pressure.limit}`;

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
    return [
      `  ${machine.id} initial=${machine.initialStateId} states=${machine.states.length} transitions=${machine.transitions.length}`,
    ];
  });
}

function renderRuntimeWorkSections(contract: FlowBehaviorContract): Array<string> {
  if (contract.machines.length === 0) {
    return ["(no runtime work)"];
  }

  return contract.machines.flatMap((machine) => {
    const facts = machine.states.flatMap((state) => [
      ...(state.childIds.length === 0 ? [] : [`${state.id} children=${state.childIds.join(",")}`]),
      ...(state.timedTransitions.length === 0
        ? []
        : [
            `${state.id} timers=${state.timedTransitions.map((transition) => transition.id).join(",")}`,
          ]),
      ...(state.eventlessTransitions.length === 0
        ? []
        : [
            `${state.id} eventless=${state.eventlessTransitions.map((transition) => transition.target).join(",")}`,
          ]),
    ]);
    return facts.length === 0 ? [] : [`  ${machine.id}: ${facts.join("; ")}`];
  });
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
  const runtimeWork = renderRuntimeWorkSections(selected);
  return [
    `behavior.contract ${selected.app.id}${options.moduleId === undefined ? "" : ` module=${options.moduleId}`}`,
    `modules: ${commaList(selected.app.moduleIds)}`,
    ...(appScreens.length === 0 ? [] : [`screens: ${commaList(appScreens)}`]),
    ...(fixtureIds.length === 0 ? [] : [`fixtures: ${commaList(fixtureIds)}`]),
    `resources: ${resourceSummary(selected)}`,
    `stories: ${proofSurface.stories}`,
    "machines:",
    ...renderMachineSections(selected),
    ...(runtimeWork.length === 0 ? [] : ["runtime:", ...runtimeWork]),
    ...(selected.transactions.length === 0
      ? []
      : [`transactions: ${transactionSummary(selected)}`]),
    ...(selected.streams.length === 0 ? [] : [`streams: ${streamSummary(selected)}`]),
    ...(selected.views.length === 0
      ? []
      : [`views: ${selected.views.map((view) => view.id).join(", ")}`]),
  ].join("\n");
}
