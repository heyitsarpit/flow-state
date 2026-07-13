import type {
  AnyFlowMachine,
  FlowAppDefinition,
  FlowResourceDefinition,
  FlowStoriesDescriptor,
  FlowStreamDefinition,
  FlowTransactionDefinition,
  FlowViewDefinition,
} from "../api/types.js";

import { graphOf, storyToDoc } from "./inspect.js";

const behaviorContractVersion = "flow-state/behavior-contract.v1" as const;
const transactionRouteOrder = ["success", "failure", "defect", "interrupt"] as const;
const streamRouteOrder = ["value", "done", "failure", "defect", "interrupt"] as const;

type FlowBehaviorTransactionRouteKind = (typeof transactionRouteOrder)[number];
type FlowBehaviorStreamRouteKind = (typeof streamRouteOrder)[number];

export type FlowBehaviorBuildTarget = Readonly<{
  app: FlowAppDefinition;
  stories?: ReadonlyArray<FlowStoriesDescriptor>;
}>;

export type FlowBehaviorGateway = FlowBehaviorBuildTarget;

export type FlowBehaviorContract = Readonly<{
  version: typeof behaviorContractVersion;
  app: FlowBehaviorApp;
  modules: ReadonlyArray<FlowBehaviorModule>;
  resources: ReadonlyArray<FlowBehaviorResource>;
  transactions: ReadonlyArray<FlowBehaviorTransaction>;
  machines: ReadonlyArray<FlowBehaviorMachine>;
  streams: ReadonlyArray<FlowBehaviorStream>;
  views: ReadonlyArray<FlowBehaviorView>;
  stories: ReadonlyArray<FlowBehaviorStory>;
}>;

export type FlowBehaviorApp = Readonly<{
  id: string;
  moduleIds: ReadonlyArray<string>;
}>;

export type FlowBehaviorModule = Readonly<{
  id: string;
  dependencies: ReadonlyArray<string>;
  screenIds: ReadonlyArray<string>;
  tagIds: ReadonlyArray<string>;
  fixtureIds: ReadonlyArray<string>;
}>;

export type FlowBehaviorResource = Readonly<{
  id: string;
  moduleId: string | null;
  hasSchema: boolean;
  hasPlaceholder: boolean;
  freshness: null | Readonly<{
    staleAfter: string | number;
    onInvalidate: "active" | "lazy" | "never" | null;
  }>;
}>;

export type FlowBehaviorTransaction = Readonly<{
  id: string;
  moduleId: string | null;
  hasParams: boolean;
  hasPreview: boolean;
  hasInvalidates: boolean;
  hasQueueWhen: boolean;
  hasQueueReplay: boolean;
  hasQueueUndo: boolean;
  concurrency: string | null;
  routeKinds: ReadonlyArray<FlowBehaviorTransactionRouteKind>;
}>;

export type FlowBehaviorMachine = Readonly<{
  id: string;
  moduleId: string | null;
  initialStateId: string;
  states: ReadonlyArray<FlowBehaviorState>;
  transitions: ReadonlyArray<FlowBehaviorTransition>;
}>;

export type FlowBehaviorState = Readonly<{
  id: string;
  terminal: boolean;
  childIds: ReadonlyArray<string>;
  timedTransitions: ReadonlyArray<
    Readonly<{
      id: string;
      delay: unknown;
      target: string;
    }>
  >;
  eventlessTransitions: ReadonlyArray<
    Readonly<{
      id: string;
      target: string;
    }>
  >;
}>;

export type FlowBehaviorTransition = Readonly<{
  id: string;
  source: string;
  target: string;
  eventType: string;
}>;

export type FlowBehaviorStream = Readonly<{
  id: string;
  moduleId: string | null;
  hasParams: boolean;
  pressure:
    | null
    | Readonly<{
        strategy: "queue";
        limit: number;
      }>
    | Readonly<{
        strategy: "coalesce-latest";
      }>;
  routeKinds: ReadonlyArray<FlowBehaviorStreamRouteKind>;
}>;

export type FlowBehaviorView = Readonly<{
  id: string;
  moduleId: string | null;
  sources: ReadonlyArray<
    | "context"
    | "resources"
    | "transactions"
    | "streams"
    | "timers"
    | "children"
    | "issues"
    | "receipts"
  >;
}>;

export type FlowBehaviorStory = Readonly<{
  id: string;
  machineId: string;
  title: string;
  tags: ReadonlyArray<string>;
  start: "default" | "snapshot" | "setup";
  expectedState: string | null;
  seed: null | Readonly<{
    resourceCount: number;
    fixtureIds: ReadonlyArray<string>;
    hasBoot: boolean;
    actorId: string | null;
  }>;
  expectedFacts: Readonly<{
    receiptTypes: ReadonlyArray<string>;
    relatedIds: ReadonlyArray<string>;
    issueKinds: ReadonlyArray<string>;
    issueSources: ReadonlyArray<string>;
    outcomeKinds: ReadonlyArray<string>;
    outcomeSources: ReadonlyArray<string>;
  }>;
}>;

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
}

function sorted<Value extends Readonly<{ id: string }>>(
  values: ReadonlyArray<Value>,
): ReadonlyArray<Value> {
  return Object.freeze([...values].sort((left, right) => compareStrings(left.id, right.id)));
}

function routeKinds<RouteKind extends string>(
  routes: Readonly<Record<string, unknown>> | undefined,
  order: ReadonlyArray<RouteKind>,
): ReadonlyArray<RouteKind> {
  if (routes === undefined) {
    return Object.freeze([]);
  }

  return Object.freeze(order.filter((kind) => routes[kind] !== undefined));
}

function recordValues<Value extends Readonly<{ id: string }>>(
  value: unknown,
): ReadonlyArray<Value> {
  if (value === undefined || value === null || typeof value !== "object" || Array.isArray(value)) {
    return Object.freeze([]);
  }

  return Object.freeze(
    Object.values(value as Record<string, Value>).sort((left, right) =>
      compareStrings(left.id, right.id),
    ),
  );
}

function moduleOrder(app: FlowBehaviorContract["app"]): Map<string, number> {
  return new Map(app.moduleIds.map((moduleId, index) => [moduleId, index]));
}

function byModuleIdAndId<Value extends Readonly<{ id: string; moduleId: string | null }>>(
  values: ReadonlyArray<Value>,
  app: FlowBehaviorContract["app"],
): ReadonlyArray<Value> {
  const order = moduleOrder(app);
  return Object.freeze(
    [...values].sort((left, right) => {
      const leftOrder =
        left.moduleId === null
          ? Number.MAX_SAFE_INTEGER
          : (order.get(left.moduleId) ?? Number.MAX_SAFE_INTEGER);
      const rightOrder =
        right.moduleId === null
          ? Number.MAX_SAFE_INTEGER
          : (order.get(right.moduleId) ?? Number.MAX_SAFE_INTEGER);
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return compareStrings(left.id, right.id);
    }),
  );
}

function buildModules(target: FlowBehaviorBuildTarget): ReadonlyArray<FlowBehaviorModule> {
  const appInventory = target.app.inventory();
  return Object.freeze(
    appInventory.modules.map((module) =>
      Object.freeze({
        id: module.name,
        dependencies: Object.freeze([...(module.dependencies ?? [])]),
        screenIds: Object.freeze([...(module.screens ?? [])]),
        tagIds: Object.freeze([...(module.tags ?? [])]),
        fixtureIds: Object.freeze([...(module.fixtures ?? [])]),
      }),
    ),
  );
}

function buildResources(target: FlowBehaviorBuildTarget): ReadonlyArray<FlowBehaviorResource> {
  return Object.freeze(
    target.app.modules.flatMap((module) =>
      recordValues<FlowResourceDefinition>(
        (module as Readonly<Record<string, unknown>>).resources,
      ).map((resource) =>
        Object.freeze({
          id: resource.id,
          moduleId: module.id,
          hasSchema: resource.config.schema !== undefined,
          hasPlaceholder: resource.config.placeholder !== undefined,
          freshness:
            resource.config.freshness === undefined
              ? null
              : Object.freeze({
                  staleAfter: resource.config.freshness.staleAfter,
                  onInvalidate: resource.config.freshness.onInvalidate ?? null,
                }),
        }),
      ),
    ),
  );
}

function buildTransactions(
  target: FlowBehaviorBuildTarget,
): ReadonlyArray<FlowBehaviorTransaction> {
  return Object.freeze(
    target.app.modules.flatMap((module) =>
      recordValues<FlowTransactionDefinition>(
        (module as Readonly<Record<string, unknown>>).transactions,
      ).map((transaction) =>
        Object.freeze({
          id: transaction.id,
          moduleId: module.id,
          hasParams: transaction.config.params !== undefined,
          hasPreview: transaction.config.preview !== undefined,
          hasInvalidates: transaction.config.invalidates !== undefined,
          hasQueueWhen: transaction.config.queue?.when !== undefined,
          hasQueueReplay: transaction.config.queue?.replay !== undefined,
          hasQueueUndo: transaction.config.queue?.undo !== undefined,
          concurrency: transaction.config.concurrency ?? null,
          routeKinds: routeKinds(transaction.config.routes, transactionRouteOrder),
        }),
      ),
    ),
  );
}

function buildMachines(target: FlowBehaviorBuildTarget): ReadonlyArray<FlowBehaviorMachine> {
  return Object.freeze(
    target.app.modules.flatMap((module) =>
      recordValues<AnyFlowMachine>((module as Readonly<Record<string, unknown>>).machines).map(
        (machine) => {
          const graph = graphOf(machine);
          return Object.freeze({
            id: machine.id,
            moduleId: module.id,
            initialStateId: graph.initial,
            states: sorted(
              graph.nodes.map((state) =>
                Object.freeze({
                  id: state.id,
                  terminal: state.terminal,
                  childIds: Object.freeze(
                    state.childSpecs.map((child) => child.id).sort(compareStrings),
                  ),
                  timedTransitions: sorted(
                    state.timedTransitions.map((transition) =>
                      Object.freeze({
                        id: transition.id,
                        delay: transition.delay,
                        target: transition.target,
                      }),
                    ),
                  ),
                  eventlessTransitions: sorted(
                    state.eventlessTransitions.map((transition) =>
                      Object.freeze({
                        id: transition.id,
                        target: transition.target,
                      }),
                    ),
                  ),
                }),
              ),
            ),
            transitions: sorted(
              graph.edges.map((transition) =>
                Object.freeze({
                  id: transition.id,
                  source: transition.source,
                  target: transition.target,
                  eventType: transition.eventType,
                }),
              ),
            ),
          });
        },
      ),
    ),
  );
}

function buildStreams(target: FlowBehaviorBuildTarget): ReadonlyArray<FlowBehaviorStream> {
  return Object.freeze(
    target.app.modules.flatMap((module) =>
      recordValues<FlowStreamDefinition>((module as Readonly<Record<string, unknown>>).streams).map(
        (stream) =>
          Object.freeze({
            id: stream.id,
            moduleId: module.id,
            hasParams: stream.config.params !== undefined,
            pressure:
              stream.config.pressure === undefined
                ? null
                : stream.config.pressure.strategy === "queue"
                  ? Object.freeze({
                      strategy: "queue" as const,
                      limit: stream.config.pressure.limit,
                    })
                  : Object.freeze({
                      strategy: "coalesce-latest" as const,
                    }),
            routeKinds: routeKinds(stream.config.routes, streamRouteOrder),
          }),
      ),
    ),
  );
}

function buildViews(target: FlowBehaviorBuildTarget): ReadonlyArray<FlowBehaviorView> {
  return Object.freeze(
    target.app.modules.flatMap((module) =>
      recordValues<FlowViewDefinition>((module as Readonly<Record<string, unknown>>).views).map(
        (view) =>
          Object.freeze({
            id: view.id,
            moduleId: module.id,
            sources: Object.freeze([...view.config.sources]),
          }),
      ),
    ),
  );
}

function buildStories(
  target: FlowBehaviorBuildTarget,
  machines: ReadonlyArray<FlowBehaviorMachine>,
): ReadonlyArray<FlowBehaviorStory> {
  if (target.stories === undefined) {
    return Object.freeze([]);
  }

  const machineIds = new Set(machines.map((machine) => machine.id));
  const stories: Array<FlowBehaviorStory> = [];

  for (const descriptor of target.stories) {
    if (!machineIds.has(descriptor.machine.id)) {
      throw new Error(
        `Behavior stories reference machine '${descriptor.machine.id}', but the assembled app does not own it.`,
      );
    }

    for (const story of descriptor.stories) {
      const doc = storyToDoc(story);
      stories.push(
        Object.freeze({
          id: story.id,
          machineId: descriptor.machine.id,
          title: story.title,
          tags: Object.freeze([...(story.tags ?? [])]),
          start: doc.start.kind,
          expectedState: story.expectedState ?? null,
          seed:
            doc.seed === undefined
              ? null
              : Object.freeze({
                  resourceCount: doc.seed.resourceCount,
                  fixtureIds: Object.freeze([...doc.seed.fixtures]),
                  hasBoot: doc.seed.hasBoot,
                  actorId: doc.seed.actorId ?? null,
                }),
          expectedFacts: Object.freeze({
            receiptTypes: Object.freeze([...(story.expectedFacts?.receiptTypes ?? [])]),
            relatedIds: Object.freeze([...(story.expectedFacts?.relatedIds ?? [])]),
            issueKinds: Object.freeze([...(story.expectedFacts?.issueKinds ?? [])]),
            issueSources: Object.freeze([...(story.expectedFacts?.issueSources ?? [])]),
            outcomeKinds: Object.freeze([...(story.expectedFacts?.outcomeKinds ?? [])]),
            outcomeSources: Object.freeze([...(story.expectedFacts?.outcomeSources ?? [])]),
          }),
        }),
      );
    }
  }

  return Object.freeze(stories);
}

export function buildBehaviorContract(target: FlowBehaviorBuildTarget): FlowBehaviorContract {
  const appInventory = target.app.inventory();
  const app = Object.freeze({
    id: target.app.id,
    moduleIds: Object.freeze(appInventory.modules.map((module) => module.name)),
  });
  const modules = buildModules(target);
  const machines = buildMachines(target);

  return Object.freeze({
    version: behaviorContractVersion,
    app,
    modules,
    resources: byModuleIdAndId(buildResources(target), app),
    transactions: byModuleIdAndId(buildTransactions(target), app),
    machines: byModuleIdAndId(machines, app),
    streams: byModuleIdAndId(buildStreams(target), app),
    views: byModuleIdAndId(buildViews(target), app),
    stories: buildStories(target, machines),
  });
}

export function sliceBehaviorContract(
  contract: FlowBehaviorContract,
  moduleId: string,
): FlowBehaviorContract {
  if (!contract.modules.some((module) => module.id === moduleId)) {
    throw new Error(`Unknown behavior module '${moduleId}'.`);
  }

  const selectedMachineIds = new Set(
    contract.machines
      .filter((machine) => machine.moduleId === moduleId || machine.moduleId === null)
      .map((machine) => machine.id),
  );

  return Object.freeze({
    version: contract.version,
    app: Object.freeze({
      id: contract.app.id,
      moduleIds: Object.freeze(
        contract.app.moduleIds.filter((candidate) => candidate === moduleId),
      ),
    }),
    modules: Object.freeze(contract.modules.filter((module) => module.id === moduleId)),
    resources: Object.freeze(
      contract.resources.filter(
        (resource) => resource.moduleId === moduleId || resource.moduleId === null,
      ),
    ),
    transactions: Object.freeze(
      contract.transactions.filter(
        (transaction) => transaction.moduleId === moduleId || transaction.moduleId === null,
      ),
    ),
    machines: Object.freeze(
      contract.machines.filter(
        (machine) => machine.moduleId === moduleId || machine.moduleId === null,
      ),
    ),
    streams: Object.freeze(
      contract.streams.filter((stream) => stream.moduleId === moduleId || stream.moduleId === null),
    ),
    views: Object.freeze(
      contract.views.filter((view) => view.moduleId === moduleId || view.moduleId === null),
    ),
    stories: Object.freeze(
      contract.stories.filter((story) => selectedMachineIds.has(story.machineId)),
    ),
  });
}
