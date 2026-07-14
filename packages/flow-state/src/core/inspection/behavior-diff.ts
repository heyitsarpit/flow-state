import type {
  FlowBehaviorApp,
  FlowBehaviorContract,
  FlowBehaviorMachine,
  FlowBehaviorModule,
  FlowBehaviorResource,
  FlowBehaviorState,
  FlowBehaviorStory,
  FlowBehaviorStream,
  FlowBehaviorTransaction,
  FlowBehaviorTransition,
  FlowBehaviorView,
} from "./behavior-contract.js";

import { sliceBehaviorContract } from "./behavior-contract.js";
import { formatStableValue, stableKey } from "./stable-value.js";

export type FlowBehaviorDiffOptions = Readonly<{
  moduleId?: string;
}>;

export type FlowBehaviorDiffSectionName =
  | "app-summary"
  | "modules"
  | "machines"
  | "resources"
  | "transactions"
  | "streams"
  | "views"
  | "stories"
  | "coverage-obligations";

export type FlowBehaviorDiffItemChange<Item> = Readonly<{
  id: string;
  left: Item;
  right: Item;
}>;

export type FlowBehaviorDiffSection<
  Item extends Readonly<{ id: string }>,
  Change = FlowBehaviorDiffItemChange<Item>,
> = Readonly<{
  matches: boolean;
  added: ReadonlyArray<Item>;
  removed: ReadonlyArray<Item>;
  changed: ReadonlyArray<Change>;
}>;

export type FlowBehaviorMachineChange = Readonly<{
  id: string;
  left: FlowBehaviorMachine;
  right: FlowBehaviorMachine;
  initialStateChanged: boolean;
  stateChanges: FlowBehaviorDiffSection<FlowBehaviorState>;
  transitionChanges: FlowBehaviorDiffSection<FlowBehaviorTransition>;
}>;

export type FlowBehaviorAppSummary = Readonly<{
  left: FlowBehaviorApp;
  right: FlowBehaviorApp;
  matches: boolean;
  changedFields: ReadonlyArray<string>;
}>;

export type FlowBehaviorCoverageObligationKind =
  | "machine-state"
  | "machine-transition"
  | "machine-timed-transition"
  | "machine-eventless-transition"
  | "machine-child"
  | "transaction-outcome"
  | "resource-schema"
  | "resource-placeholder"
  | "resource-freshness"
  | "stream-pressure"
  | "stream-route"
  | "view-source";

export type FlowBehaviorCoverageObligation = Readonly<{
  id: string;
  kind: FlowBehaviorCoverageObligationKind;
  storyBackedBy: ReadonlyArray<string>;
  proofStatus: "story-backed" | "needs-proof";
}>;

export type FlowBehaviorCoverageObligationDiff =
  FlowBehaviorDiffSection<FlowBehaviorCoverageObligation>;

export type FlowBehaviorDiffDescriptor<
  Left extends FlowBehaviorContract = FlowBehaviorContract,
  Right extends FlowBehaviorContract = FlowBehaviorContract,
> = Readonly<{
  kind: "behavior-diff";
  left: Left;
  right: Right;
  options: FlowBehaviorDiffOptions;
  summary: Readonly<{
    matches: boolean;
    changedSections: ReadonlyArray<FlowBehaviorDiffSectionName>;
  }>;
  appSummary: FlowBehaviorAppSummary;
  modules: FlowBehaviorDiffSection<FlowBehaviorModule>;
  machines: FlowBehaviorDiffSection<FlowBehaviorMachine, FlowBehaviorMachineChange>;
  resources: FlowBehaviorDiffSection<FlowBehaviorResource>;
  transactions: FlowBehaviorDiffSection<FlowBehaviorTransaction>;
  streams: FlowBehaviorDiffSection<FlowBehaviorStream>;
  views: FlowBehaviorDiffSection<FlowBehaviorView>;
  stories: FlowBehaviorDiffSection<FlowBehaviorStory>;
  coverageObligations: FlowBehaviorCoverageObligationDiff;
}>;

type WithId = Readonly<{ id: string }>;

function formatValue(value: unknown): string {
  return formatStableValue(value);
}

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
}

function commaList(values: ReadonlyArray<string>, empty = "none"): string {
  return values.length === 0 ? empty : values.join(", ");
}

function uniqueSortedStrings(values: ReadonlyArray<string>): ReadonlyArray<string> {
  return Object.freeze(Array.from(new Set(values)).sort(compareStrings));
}

function byId<Item extends WithId>(items: ReadonlyArray<Item>): ReadonlyMap<string, Item> {
  return new Map(items.map((item) => [item.id, item] as const));
}

function createDiffSection<Item extends WithId, Change = FlowBehaviorDiffItemChange<Item>>(
  left: ReadonlyArray<Item>,
  right: ReadonlyArray<Item>,
  createChanged: (leftItem: Item, rightItem: Item) => Change = (leftItem, rightItem) =>
    Object.freeze({
      id: leftItem.id,
      left: leftItem,
      right: rightItem,
    }) as Change,
): FlowBehaviorDiffSection<Item, Change> {
  const leftById = byId(left);
  const rightById = byId(right);
  const added = right.filter((item) => !leftById.has(item.id));
  const removed = left.filter((item) => !rightById.has(item.id));
  const changed = left.flatMap((item) => {
    const rightItem = rightById.get(item.id);

    if (rightItem === undefined || stableKey(item) === stableKey(rightItem)) {
      return [] as ReadonlyArray<Change>;
    }

    return [createChanged(item, rightItem)];
  });

  return Object.freeze({
    matches: added.length === 0 && removed.length === 0 && changed.length === 0,
    added: Object.freeze(added),
    removed: Object.freeze(removed),
    changed: Object.freeze(changed),
  });
}

function createMachineChange(
  left: FlowBehaviorMachine,
  right: FlowBehaviorMachine,
): FlowBehaviorMachineChange {
  return Object.freeze({
    id: left.id,
    left,
    right,
    initialStateChanged: left.initialStateId !== right.initialStateId,
    stateChanges: createDiffSection(left.states, right.states),
    transitionChanges: createDiffSection(left.transitions, right.transitions),
  });
}

function appSummary(
  left: FlowBehaviorContract,
  right: FlowBehaviorContract,
): FlowBehaviorAppSummary {
  const changedFields = [
    left.app.id === right.app.id ? undefined : "id",
    stableKey(left.app.moduleIds) === stableKey(right.app.moduleIds) ? undefined : "moduleIds",
  ].filter((field): field is string => field !== undefined);

  return Object.freeze({
    left: left.app,
    right: right.app,
    matches: changedFields.length === 0,
    changedFields: Object.freeze(changedFields),
  });
}

function pushStoryEvidence(
  evidence: Map<string, Array<string>>,
  key: string,
  storyId: string,
): void {
  const current = evidence.get(key);

  if (current === undefined) {
    evidence.set(key, [storyId]);
    return;
  }

  current.push(storyId);
}

function machineStateEvidenceKey(machineId: string, stateId: string): string {
  return `${machineId}::state::${stateId}`;
}

function transactionOutcomeEvidenceKey(transactionId: string, outcomeKind: string): string {
  return `${transactionId}::outcome::${outcomeKind}`;
}

function buildStateStoryEvidence(
  contract: FlowBehaviorContract,
): ReadonlyMap<string, ReadonlyArray<string>> {
  const evidence = new Map<string, Array<string>>();

  for (const story of contract.stories) {
    if (story.expectedState === null) {
      continue;
    }

    pushStoryEvidence(
      evidence,
      machineStateEvidenceKey(story.machineId, story.expectedState),
      story.id,
    );
  }

  return new Map(
    Array.from(evidence.entries(), ([key, storyIds]) => [key, uniqueSortedStrings(storyIds)]),
  );
}

function buildTransactionOutcomeStoryEvidence(
  contract: FlowBehaviorContract,
): ReadonlyMap<string, ReadonlyArray<string>> {
  const evidence = new Map<string, Array<string>>();

  for (const story of contract.stories) {
    for (const relatedId of story.expectedFacts.relatedIds) {
      for (const outcomeKind of story.expectedFacts.outcomeKinds) {
        pushStoryEvidence(
          evidence,
          transactionOutcomeEvidenceKey(relatedId, outcomeKind),
          story.id,
        );
      }
    }
  }

  return new Map(
    Array.from(evidence.entries(), ([key, storyIds]) => [key, uniqueSortedStrings(storyIds)]),
  );
}

function createCoverageObligation(
  id: string,
  kind: FlowBehaviorCoverageObligationKind,
  storyBackedBy: ReadonlyArray<string> = [],
): FlowBehaviorCoverageObligation {
  const orderedStoryIds = uniqueSortedStrings(storyBackedBy);

  return Object.freeze({
    id,
    kind,
    storyBackedBy: orderedStoryIds,
    proofStatus: orderedStoryIds.length === 0 ? "needs-proof" : "story-backed",
  });
}

function describeStreamPressure(pressure: FlowBehaviorStream["pressure"]): string {
  if (pressure === null) {
    return "none";
  }

  if (pressure.strategy === "queue") {
    return `queue limit=${pressure.limit}`;
  }

  return `coalesce-latest limit=${pressure.limit}`;
}

function deriveCoverageObligations(
  contract: FlowBehaviorContract,
): ReadonlyArray<FlowBehaviorCoverageObligation> {
  const stateEvidence = buildStateStoryEvidence(contract);
  const transactionOutcomeEvidence = buildTransactionOutcomeStoryEvidence(contract);
  const obligations = [
    ...contract.machines.flatMap((machine) => [
      ...machine.states.map((state) =>
        createCoverageObligation(
          `${machine.id} state ${state.id}`,
          "machine-state",
          stateEvidence.get(machineStateEvidenceKey(machine.id, state.id)) ?? [],
        ),
      ),
      ...machine.transitions.map((transition) =>
        createCoverageObligation(`${machine.id} transition ${transition.id}`, "machine-transition"),
      ),
      ...machine.states.flatMap((state) => [
        ...state.timedTransitions.map((transition) =>
          createCoverageObligation(
            `${machine.id} timed transition ${transition.id}`,
            "machine-timed-transition",
          ),
        ),
        ...state.eventlessTransitions.map((transition) =>
          createCoverageObligation(
            `${machine.id} eventless transition ${transition.id}`,
            "machine-eventless-transition",
          ),
        ),
        ...state.childIds.map((childId) =>
          createCoverageObligation(
            `${machine.id} child ${state.id} -> ${childId}`,
            "machine-child",
          ),
        ),
      ]),
    ]),
    ...contract.transactions.flatMap((transaction) =>
      transaction.routeKinds.map((outcomeKind) =>
        createCoverageObligation(
          `${transaction.id} outcome ${outcomeKind}`,
          "transaction-outcome",
          transactionOutcomeEvidence.get(
            transactionOutcomeEvidenceKey(transaction.id, outcomeKind),
          ) ?? [],
        ),
      ),
    ),
    ...contract.resources.flatMap((resource) => [
      ...(resource.hasSchema
        ? [createCoverageObligation(`${resource.id} resource schema`, "resource-schema")]
        : []),
      ...(resource.hasPlaceholder
        ? [createCoverageObligation(`${resource.id} resource placeholder`, "resource-placeholder")]
        : []),
      ...(resource.freshness === null
        ? []
        : [
            createCoverageObligation(
              `${resource.id} resource freshness ${formatValue(resource.freshness)}`,
              "resource-freshness",
            ),
          ]),
    ]),
    ...contract.streams.flatMap((stream) => [
      createCoverageObligation(
        `${stream.id} stream pressure ${describeStreamPressure(stream.pressure)}`,
        "stream-pressure",
      ),
      ...stream.routeKinds.map((routeKind) =>
        createCoverageObligation(`${stream.id} stream route ${routeKind}`, "stream-route"),
      ),
    ]),
    ...contract.views.flatMap((view) =>
      view.sources.map((sourceKind) =>
        createCoverageObligation(`${view.id} source ${sourceKind}`, "view-source"),
      ),
    ),
  ];

  return Object.freeze([...obligations].sort((left, right) => compareStrings(left.id, right.id)));
}

function fieldChanges<Item extends object>(
  left: Item,
  right: Item,
  fields: ReadonlyArray<readonly [keyof Item, string]>,
): ReadonlyArray<string> {
  return Object.freeze(
    fields.flatMap(([field, label]) =>
      stableKey(left[field]) === stableKey(right[field])
        ? ([] as ReadonlyArray<string>)
        : [`${label} ${formatValue(left[field])} -> ${formatValue(right[field])}`],
    ),
  );
}

function renderSectionHeader(title: string): Array<string> {
  return [title, ""];
}

function renderRecordSection<Item extends WithId>(
  title: string,
  itemLabel: string,
  diff: FlowBehaviorDiffSection<Item>,
  describeChange: (change: FlowBehaviorDiffItemChange<Item>) => ReadonlyArray<string>,
): Array<string> {
  return [
    ...renderSectionHeader(title),
    `- Added ${itemLabel}: ${commaList(diff.added.map((item) => item.id))}`,
    `- Removed ${itemLabel}: ${commaList(diff.removed.map((item) => item.id))}`,
    `- Changed ${itemLabel}: ${commaList(diff.changed.map((change) => change.id))}`,
    ...diff.changed.flatMap((change) => describeChange(change as FlowBehaviorDiffItemChange<Item>)),
    "",
  ];
}

function describeModuleChange(
  change: FlowBehaviorDiffItemChange<FlowBehaviorModule>,
): ReadonlyArray<string> {
  return fieldChanges(change.left, change.right, [
    ["dependencies", "dependencies"],
    ["screenIds", "screenIds"],
    ["tagIds", "tagIds"],
    ["fixtureIds", "fixtureIds"],
  ]).map((summary) => `- ${change.id}: ${summary}`);
}

function describeMachineChange(change: FlowBehaviorMachineChange): ReadonlyArray<string> {
  const lines = [
    `- ${change.id}: added states ${commaList(change.stateChanges.added.map((state) => state.id))}; removed states ${commaList(change.stateChanges.removed.map((state) => state.id))}; changed states ${commaList(change.stateChanges.changed.map((state) => state.id))}; added transitions ${commaList(change.transitionChanges.added.map((transition) => transition.id))}; removed transitions ${commaList(change.transitionChanges.removed.map((transition) => transition.id))}; changed transitions ${commaList(change.transitionChanges.changed.map((transition) => transition.id))}`,
  ];

  if (change.initialStateChanged) {
    lines.push(
      `- ${change.id}: initialStateId ${formatValue(change.left.initialStateId)} -> ${formatValue(change.right.initialStateId)}`,
    );
  }

  lines.push(
    ...change.stateChanges.changed.flatMap((stateChange) =>
      fieldChanges(stateChange.left, stateChange.right, [
        ["terminal", "terminal"],
        ["childIds", "childIds"],
        ["timedTransitions", "timedTransitions"],
        ["eventlessTransitions", "eventlessTransitions"],
      ]).map((summary) => `- ${change.id}/${stateChange.id}: ${summary}`),
    ),
  );
  lines.push(
    ...change.transitionChanges.changed.flatMap((transitionChange) =>
      fieldChanges(transitionChange.left, transitionChange.right, [
        ["source", "source"],
        ["target", "target"],
        ["eventType", "eventType"],
      ]).map((summary) => `- ${change.id}/${transitionChange.id}: ${summary}`),
    ),
  );

  return Object.freeze(lines);
}

function describeResourceChange(
  change: FlowBehaviorDiffItemChange<FlowBehaviorResource>,
): ReadonlyArray<string> {
  return fieldChanges(change.left, change.right, [
    ["moduleId", "moduleId"],
    ["hasSchema", "hasSchema"],
    ["hasPlaceholder", "hasPlaceholder"],
    ["freshness", "freshness"],
  ]).map((summary) => `- ${change.id}: ${summary}`);
}

function describeTransactionChange(
  change: FlowBehaviorDiffItemChange<FlowBehaviorTransaction>,
): ReadonlyArray<string> {
  return fieldChanges(change.left, change.right, [
    ["moduleId", "moduleId"],
    ["hasParams", "hasParams"],
    ["hasPreview", "hasPreview"],
    ["hasInvalidates", "hasInvalidates"],
    ["hasQueueWhen", "hasQueueWhen"],
    ["hasQueueReplay", "hasQueueReplay"],
    ["hasQueueUndo", "hasQueueUndo"],
    ["concurrency", "concurrency"],
    ["routeKinds", "routeKinds"],
  ]).map((summary) => `- ${change.id}: ${summary}`);
}

function describeStreamChange(
  change: FlowBehaviorDiffItemChange<FlowBehaviorStream>,
): ReadonlyArray<string> {
  return fieldChanges(change.left, change.right, [
    ["moduleId", "moduleId"],
    ["hasParams", "hasParams"],
    ["pressure", "pressure"],
    ["routeKinds", "routeKinds"],
  ]).map((summary) => `- ${change.id}: ${summary}`);
}

function describeViewChange(
  change: FlowBehaviorDiffItemChange<FlowBehaviorView>,
): ReadonlyArray<string> {
  return fieldChanges(change.left, change.right, [
    ["moduleId", "moduleId"],
    ["sources", "sources"],
  ]).map((summary) => `- ${change.id}: ${summary}`);
}

function describeStoryChange(
  change: FlowBehaviorDiffItemChange<FlowBehaviorStory>,
): ReadonlyArray<string> {
  return fieldChanges(change.left, change.right, [
    ["machineId", "machineId"],
    ["title", "title"],
    ["tags", "tags"],
    ["start", "start"],
    ["expectedState", "expectedState"],
    ["seed", "seed"],
    ["expectedFacts", "expectedFacts"],
  ]).map((summary) => `- ${change.id}: ${summary}`);
}

function describeProofStatus(obligation: FlowBehaviorCoverageObligation): string {
  return obligation.storyBackedBy.length === 0
    ? "needs proof"
    : `story-backed via ${commaList(obligation.storyBackedBy)}`;
}

export function diffBehaviorContracts<
  Left extends FlowBehaviorContract,
  Right extends FlowBehaviorContract,
>(
  left: Left,
  right: Right,
  options: FlowBehaviorDiffOptions = {},
): FlowBehaviorDiffDescriptor<Left, Right> {
  const selectedLeft =
    options.moduleId === undefined ? left : sliceBehaviorContract(left, options.moduleId);
  const selectedRight =
    options.moduleId === undefined ? right : sliceBehaviorContract(right, options.moduleId);
  const appDiff = appSummary(selectedLeft, selectedRight);
  const modules = createDiffSection(selectedLeft.modules, selectedRight.modules);
  const machines = createDiffSection(
    selectedLeft.machines,
    selectedRight.machines,
    createMachineChange,
  );
  const resources = createDiffSection(selectedLeft.resources, selectedRight.resources);
  const transactions = createDiffSection(selectedLeft.transactions, selectedRight.transactions);
  const streams = createDiffSection(selectedLeft.streams, selectedRight.streams);
  const views = createDiffSection(selectedLeft.views, selectedRight.views);
  const stories = createDiffSection(selectedLeft.stories, selectedRight.stories);
  const coverageObligations = createDiffSection(
    deriveCoverageObligations(selectedLeft),
    deriveCoverageObligations(selectedRight),
  );
  const changedSections: Array<FlowBehaviorDiffSectionName> = [];

  if (!appDiff.matches) {
    changedSections.push("app-summary");
  }
  if (!modules.matches) {
    changedSections.push("modules");
  }
  if (!machines.matches) {
    changedSections.push("machines");
  }
  if (!resources.matches) {
    changedSections.push("resources");
  }
  if (!transactions.matches) {
    changedSections.push("transactions");
  }
  if (!streams.matches) {
    changedSections.push("streams");
  }
  if (!views.matches) {
    changedSections.push("views");
  }
  if (!stories.matches) {
    changedSections.push("stories");
  }
  if (!coverageObligations.matches) {
    changedSections.push("coverage-obligations");
  }

  return Object.freeze({
    kind: "behavior-diff" as const,
    left,
    right,
    options,
    summary: Object.freeze({
      matches: changedSections.length === 0,
      changedSections: Object.freeze(changedSections),
    }),
    appSummary: appDiff,
    modules,
    machines,
    resources,
    transactions,
    streams,
    views,
    stories,
    coverageObligations,
  });
}

export function renderBehaviorDiff(diff: FlowBehaviorDiffDescriptor): string {
  const title =
    diff.options.moduleId === undefined
      ? "# Behavior Diff"
      : `# Behavior Diff (module slice: ${diff.options.moduleId})`;
  const storyBackedAdditions = diff.coverageObligations.added
    .filter((obligation) => obligation.proofStatus === "story-backed")
    .map((obligation) => `${obligation.id} via ${commaList(obligation.storyBackedBy)}`);
  const unprovedAdditions = diff.coverageObligations.added
    .filter((obligation) => obligation.proofStatus === "needs-proof")
    .map((obligation) => obligation.id);
  const appFieldChanges =
    diff.appSummary.changedFields.length === 0
      ? ["- App fields changed: none"]
      : fieldChanges(diff.appSummary.left, diff.appSummary.right, [
          ["id", "id"],
          ["moduleIds", "moduleIds"],
        ]).map((summary) => `- ${summary}`);

  if (diff.summary.matches) {
    return [
      "behavior.diff — NO CHANGES",
      `app: ${diff.appSummary.left.id}`,
      ...(diff.options.moduleId === undefined ? [] : [`module: ${diff.options.moduleId}`]),
    ].join("\n");
  }

  return [
    title,
    "",
    "## App Summary",
    "",
    `- Left app: ${diff.appSummary.left.id}`,
    `- Right app: ${diff.appSummary.right.id}`,
    `- Scope: ${diff.options.moduleId === undefined ? "app-wide" : `module slice: ${diff.options.moduleId}`}.`,
    `- Changed sections: ${commaList(diff.summary.changedSections)}`,
    ...appFieldChanges,
    "",
    ...renderRecordSection("## Module Changes", "modules", diff.modules, describeModuleChange),
    [
      "## Machine/State/Transition Changes",
      "",
      `- Added machines: ${commaList(diff.machines.added.map((machine) => machine.id))}`,
      `- Removed machines: ${commaList(diff.machines.removed.map((machine) => machine.id))}`,
      `- Changed machines: ${commaList(diff.machines.changed.map((machine) => machine.id))}`,
      ...diff.machines.changed.flatMap(describeMachineChange),
      "",
    ].join("\n"),
    ...renderRecordSection(
      "## Resource Changes",
      "resources",
      diff.resources,
      describeResourceChange,
    ),
    ...renderRecordSection(
      "## Transaction Changes",
      "transactions",
      diff.transactions,
      describeTransactionChange,
    ),
    ...renderRecordSection("## Stream Changes", "streams", diff.streams, describeStreamChange),
    ...renderRecordSection("## View Changes", "views", diff.views, describeViewChange),
    ...renderRecordSection("## Story Changes", "stories", diff.stories, describeStoryChange),
    "## Coverage Obligation Changes",
    "",
    `- Added obligations: ${commaList(diff.coverageObligations.added.map((obligation) => obligation.id))}`,
    `- Removed obligations: ${commaList(diff.coverageObligations.removed.map((obligation) => obligation.id))}`,
    `- Changed obligations: ${commaList(diff.coverageObligations.changed.map((change) => change.id))}`,
    `- Story-backed additions: ${commaList(storyBackedAdditions)}`,
    `- Still unproved additions: ${commaList(unprovedAdditions)}`,
    ...diff.coverageObligations.changed.map(
      (change) =>
        `- ${change.id}: ${describeProofStatus(change.left)} -> ${describeProofStatus(change.right)}`,
    ),
  ].join("\n");
}
