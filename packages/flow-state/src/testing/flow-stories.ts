import type {
  AnyFlowMachine,
  FlowActorSnapshotTree,
  FlowAppDefinition,
  FlowAppFixtureName,
  FlowEvent,
  FlowIssue,
  FlowMachine,
  FlowSnapshot,
  FlowStory,
  FlowStorySeed,
  FlowStoryRunBlocked,
  FlowStoryRunOutcome,
} from "../core/api/types.js";
import type { FlowTestPendingWork } from "../core/api/testing-types.js";

import { createTraceDescriptor } from "../core/inspection/trace-descriptor.js";
import { test } from "./test.js";

type StoryHarness<Context, Event extends FlowEvent, State extends string> = Readonly<{
  readonly snapshot: () => FlowSnapshot<Context, State, Event>;
  readonly sendAll: (events: ReadonlyArray<Event>) => StoryHarness<Context, Event, State>;
  readonly issues: () => ReadonlyArray<FlowIssue>;
  readonly pendingWork?: () => FlowTestPendingWork;
  readonly flush: () => Promise<void>;
}>;

export type FlowStoryRunExecution<Machine extends AnyFlowMachine = AnyFlowMachine> = Readonly<{
  readonly outcome: FlowStoryRunOutcome<Machine>;
  readonly pendingWork?: FlowTestPendingWork;
}>;

function hasSeedEntries<Value>(
  values: ReadonlyArray<Value> | undefined,
): values is ReadonlyArray<Value> {
  return values !== undefined && values.length > 0;
}

function isAppTarget(value: unknown): value is FlowAppDefinition {
  return (value as FlowAppDefinition | undefined)?.kind === "app";
}

function isMachineTarget<Context, Event extends FlowEvent, State extends string>(
  value: FlowMachine<Context, Event, State> | StoryHarness<Context, Event, State>,
): value is FlowMachine<Context, Event, State> {
  return (value as FlowMachine<Context, Event, State>).kind === "machine";
}

function hasRunnableSeed<FixtureName extends string>(
  seed: FlowStorySeed<FixtureName> | undefined,
): seed is FlowStorySeed<FixtureName> {
  return (
    hasSeedEntries(seed?.resources) || hasSeedEntries(seed?.fixtures) || seed?.boot !== undefined
  );
}

function hasFixtureSeed<FixtureName extends string>(
  seed: FlowStorySeed<FixtureName> | undefined,
): boolean {
  return hasSeedEntries(seed?.fixtures);
}

function isBlockedStoryRun<Machine extends AnyFlowMachine>(
  value: unknown,
): value is FlowStoryRunBlocked<Machine> {
  return (value as FlowStoryRunBlocked<Machine> | undefined)?.kind === "story-run-blocked";
}

function blockedStoryRun<Machine extends AnyFlowMachine>(
  story: FlowStory<Machine>,
  reason: FlowStoryRunBlocked<Machine>["reason"],
): FlowStoryRunBlocked<Machine> {
  return Object.freeze({
    kind: "story-run-blocked" as const,
    story,
    reason,
  });
}

async function runHarnessStory<Context, Event extends FlowEvent, State extends string>(
  harness: StoryHarness<Context, Event, State>,
  story: FlowStory<FlowMachine<Context, Event, State>>,
): Promise<FlowStoryRunExecution<FlowMachine<Context, Event, State>>> {
  const activeHarness = story.events.length === 0 ? harness : harness.sendAll(story.events);
  await activeHarness.flush();

  const finalSnapshot = activeHarness.snapshot();
  const trace = createTraceDescriptor(finalSnapshot, { storyId: story.id } as const);

  return Object.freeze({
    outcome: Object.freeze({
      kind: "story-run" as const,
      story,
      finalSnapshot,
      receipts: finalSnapshot.receipts,
      issues: activeHarness.issues(),
      trace,
    }),
    ...(activeHarness.pendingWork === undefined
      ? {}
      : { pendingWork: activeHarness.pendingWork() }),
  });
}

function resolveBootSnapshot<Context, Event extends FlowEvent, State extends string>(
  machine: FlowMachine<Context, Event, State>,
  story: FlowStory<FlowMachine<Context, Event, State>>,
):
  | FlowSnapshot<Context, State, Event>
  | FlowActorSnapshotTree
  | FlowStoryRunBlocked<FlowMachine<Context, Event, State>> {
  if (story.start?.kind === "snapshot") {
    return story.start.snapshot as FlowSnapshot<Context, State, Event>;
  }

  const seed = story.seed;
  if (seed?.boot === undefined) {
    return machine.getInitialSnapshot();
  }

  if (seed.actorId !== undefined) {
    const actor = seed.boot.actors.find((entry) => entry.id === seed.actorId);
    return actor?.snapshot ?? blockedStoryRun(story, "boot-actor-not-found");
  }

  if (seed.boot.actors.length === 0) {
    return machine.getInitialSnapshot();
  }

  if (seed.boot.actors.length === 1) {
    return seed.boot.actors[0]!.snapshot;
  }

  return blockedStoryRun(story, "boot-actor-selection-required");
}

function startStoryScenario<Context, Event extends FlowEvent, State extends string>(
  machine: FlowMachine<Context, Event, State>,
  story: FlowStory<FlowMachine<Context, Event, State>>,
): StoryHarness<Context, Event, State> {
  const builder = hasSeedEntries(story.seed?.resources)
    ? test(machine).with({ resources: story.seed.resources })
    : test(machine);

  return builder.run();
}

function startAppStoryScenario<
  App extends FlowAppDefinition,
  Context,
  Event extends FlowEvent,
  State extends string,
>(
  app: App,
  machine: FlowMachine<Context, Event, State>,
  story: FlowStory<FlowMachine<Context, Event, State>, FlowAppFixtureName<App>>,
): StoryHarness<Context, Event, State> {
  const config =
    story.seed === undefined
      ? undefined
      : {
          ...(hasSeedEntries(story.seed.resources) ? { resources: story.seed.resources } : {}),
          ...(hasSeedEntries(story.seed.fixtures) ? { fixtures: story.seed.fixtures } : {}),
        };
  const builder = test.app(app).scenario(machine);

  return (config === undefined ? builder : builder.with(config)).run();
}

function startStoryRehydration<Context, Event extends FlowEvent, State extends string>(
  machine: FlowMachine<Context, Event, State>,
  story: FlowStory<FlowMachine<Context, Event, State>>,
): StoryHarness<Context, Event, State> | FlowStoryRunBlocked<FlowMachine<Context, Event, State>> {
  const snapshot = resolveBootSnapshot(machine, story);
  if (isBlockedStoryRun(snapshot)) {
    return snapshot;
  }

  return test.rehydrate(machine, {
    snapshot,
    ...(story.seed?.actorId === undefined ? {} : { id: story.seed.actorId }),
    ...(story.seed?.boot === undefined ? {} : { boot: story.seed.boot }),
    ...(hasSeedEntries(story.seed?.resources) ? { resources: story.seed.resources } : {}),
  });
}

function startAppStoryRehydration<
  App extends FlowAppDefinition,
  Context,
  Event extends FlowEvent,
  State extends string,
>(
  app: App,
  machine: FlowMachine<Context, Event, State>,
  story: FlowStory<FlowMachine<Context, Event, State>, FlowAppFixtureName<App>>,
): StoryHarness<Context, Event, State> | FlowStoryRunBlocked<FlowMachine<Context, Event, State>> {
  const snapshot = resolveBootSnapshot(
    machine,
    story as FlowStory<FlowMachine<Context, Event, State>>,
  );
  if (isBlockedStoryRun(snapshot)) {
    return snapshot;
  }

  return test.app(app).rehydrate(machine, {
    snapshot,
    ...(story.seed?.actorId === undefined ? {} : { id: story.seed.actorId }),
    ...(story.seed?.boot === undefined ? {} : { boot: story.seed.boot }),
    ...(hasSeedEntries(story.seed?.resources) ? { resources: story.seed.resources } : {}),
    ...(hasSeedEntries(story.seed?.fixtures) ? { fixtures: story.seed.fixtures } : {}),
  });
}

async function executeFlowStory<Context, Event extends FlowEvent, State extends string>(
  first:
    | FlowAppDefinition
    | FlowMachine<Context, Event, State>
    | StoryHarness<Context, Event, State>,
  second: FlowMachine<Context, Event, State> | FlowStory<FlowMachine<Context, Event, State>>,
  third?: FlowStory<FlowMachine<Context, Event, State>>,
): Promise<FlowStoryRunExecution<FlowMachine<Context, Event, State>>> {
  if (isAppTarget(first)) {
    const machine = second as FlowMachine<Context, Event, State>;
    const story = third as FlowStory<
      FlowMachine<Context, Event, State>,
      FlowAppFixtureName<typeof first>
    >;

    if (story.start?.kind === "setup" && !hasRunnableSeed(story.seed)) {
      return Object.freeze({
        outcome: blockedStoryRun(story, "setup-description"),
      });
    }

    const harness =
      story.start?.kind === "snapshot" || story.seed?.boot !== undefined
        ? startAppStoryRehydration(first, machine, story)
        : startAppStoryScenario(first, machine, story);

    if (isBlockedStoryRun(harness)) {
      return Object.freeze({
        outcome: harness,
      });
    }

    return runHarnessStory(harness, story);
  }

  const target = first;
  const story = second as FlowStory<FlowMachine<Context, Event, State>>;

  if (isMachineTarget(target)) {
    if (hasFixtureSeed(story.seed)) {
      return Object.freeze({
        outcome: blockedStoryRun(story, "fixtures-require-app"),
      });
    }

    if (story.start?.kind === "setup" && !hasRunnableSeed(story.seed)) {
      return Object.freeze({
        outcome: blockedStoryRun(story, "setup-description"),
      });
    }

    const harness =
      story.start?.kind === "snapshot" || story.seed?.boot !== undefined
        ? startStoryRehydration(target, story)
        : startStoryScenario(target, story);

    if (isBlockedStoryRun(harness)) {
      return Object.freeze({
        outcome: harness,
      });
    }

    return runHarnessStory(harness, story);
  }

  if (story.start !== undefined || story.seed !== undefined) {
    return Object.freeze({
      outcome: blockedStoryRun(story, "explicit-start-requires-machine"),
    });
  }

  return runHarnessStory(target, story);
}

export async function runFlowStoryWithDiagnostics<
  Context,
  Event extends FlowEvent,
  State extends string,
>(
  machine: FlowMachine<Context, Event, State>,
  story: FlowStory<FlowMachine<Context, Event, State>>,
): Promise<FlowStoryRunExecution<FlowMachine<Context, Event, State>>>;
export async function runFlowStoryWithDiagnostics<
  App extends FlowAppDefinition,
  Context,
  Event extends FlowEvent,
  State extends string,
>(
  app: App,
  machine: FlowMachine<Context, Event, State>,
  story: FlowStory<FlowMachine<Context, Event, State>, FlowAppFixtureName<App>>,
): Promise<FlowStoryRunExecution<FlowMachine<Context, Event, State>>>;
export async function runFlowStoryWithDiagnostics<
  Context,
  Event extends FlowEvent,
  State extends string,
>(
  harness: StoryHarness<Context, Event, State>,
  story: FlowStory<FlowMachine<Context, Event, State>>,
): Promise<FlowStoryRunExecution<FlowMachine<Context, Event, State>>>;
export async function runFlowStoryWithDiagnostics<
  Context,
  Event extends FlowEvent,
  State extends string,
>(
  first:
    | FlowAppDefinition
    | FlowMachine<Context, Event, State>
    | StoryHarness<Context, Event, State>,
  second: FlowMachine<Context, Event, State> | FlowStory<FlowMachine<Context, Event, State>>,
  third?: FlowStory<FlowMachine<Context, Event, State>>,
): Promise<FlowStoryRunExecution<FlowMachine<Context, Event, State>>> {
  return executeFlowStory(first, second, third);
}

export async function runFlowStory<Context, Event extends FlowEvent, State extends string>(
  machine: FlowMachine<Context, Event, State>,
  story: FlowStory<FlowMachine<Context, Event, State>>,
): Promise<FlowStoryRunOutcome<FlowMachine<Context, Event, State>>>;
export async function runFlowStory<
  App extends FlowAppDefinition,
  Context,
  Event extends FlowEvent,
  State extends string,
>(
  app: App,
  machine: FlowMachine<Context, Event, State>,
  story: FlowStory<FlowMachine<Context, Event, State>, FlowAppFixtureName<App>>,
): Promise<FlowStoryRunOutcome<FlowMachine<Context, Event, State>>>;
export async function runFlowStory<Context, Event extends FlowEvent, State extends string>(
  harness: StoryHarness<Context, Event, State>,
  story: FlowStory<FlowMachine<Context, Event, State>>,
): Promise<FlowStoryRunOutcome<FlowMachine<Context, Event, State>>>;
export async function runFlowStory<Context, Event extends FlowEvent, State extends string>(
  first:
    | FlowAppDefinition
    | FlowMachine<Context, Event, State>
    | StoryHarness<Context, Event, State>,
  second: FlowMachine<Context, Event, State> | FlowStory<FlowMachine<Context, Event, State>>,
  third?: FlowStory<FlowMachine<Context, Event, State>>,
): Promise<FlowStoryRunOutcome<FlowMachine<Context, Event, State>>> {
  const execution = await executeFlowStory(first, second, third);
  return execution.outcome;
}
