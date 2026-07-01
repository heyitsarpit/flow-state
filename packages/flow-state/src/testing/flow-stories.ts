import type {
  FlowEvent,
  FlowIssue,
  FlowMachine,
  FlowSnapshot,
  FlowStory,
  FlowStoryRunBlocked,
  FlowStoryRunOutcome,
} from "../public/types.js";

import { createTraceDescriptor } from "../trace-descriptor.js";
import { test } from "./test.js";

type StoryHarness<Context, Event extends FlowEvent, State extends string> = Readonly<{
  readonly snapshot: () => FlowSnapshot<Context, State, Event>;
  readonly sendAll: (events: ReadonlyArray<Event>) => StoryHarness<Context, Event, State>;
  readonly issues: () => ReadonlyArray<FlowIssue>;
  readonly flush: () => Promise<void>;
}>;

function isMachineTarget<Context, Event extends FlowEvent, State extends string>(
  value: FlowMachine<Context, Event, State> | StoryHarness<Context, Event, State>,
): value is FlowMachine<Context, Event, State> {
  return (value as FlowMachine<Context, Event, State>).kind === "machine";
}

function blockedStoryRun<Machine extends FlowMachine>(
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
): Promise<FlowStoryRunOutcome<FlowMachine<Context, Event, State>>> {
  const activeHarness = story.events.length === 0 ? harness : harness.sendAll(story.events);
  await activeHarness.flush();

  const finalSnapshot = activeHarness.snapshot();
  const trace = createTraceDescriptor(finalSnapshot, { storyId: story.id } as const);

  return Object.freeze({
    kind: "story-run" as const,
    story,
    finalSnapshot,
    receipts: finalSnapshot.receipts,
    issues: activeHarness.issues(),
    trace,
  });
}

export async function runFlowStory<Context, Event extends FlowEvent, State extends string>(
  machine: FlowMachine<Context, Event, State>,
  story: FlowStory<FlowMachine<Context, Event, State>>,
): Promise<FlowStoryRunOutcome<FlowMachine<Context, Event, State>>>;
export async function runFlowStory<Context, Event extends FlowEvent, State extends string>(
  harness: StoryHarness<Context, Event, State>,
  story: FlowStory<FlowMachine<Context, Event, State>>,
): Promise<FlowStoryRunOutcome<FlowMachine<Context, Event, State>>>;
export async function runFlowStory<Context, Event extends FlowEvent, State extends string>(
  target: FlowMachine<Context, Event, State> | StoryHarness<Context, Event, State>,
  story: FlowStory<FlowMachine<Context, Event, State>>,
): Promise<FlowStoryRunOutcome<FlowMachine<Context, Event, State>>> {
  if (isMachineTarget(target)) {
    if (story.start?.kind === "setup") {
      return blockedStoryRun(story, "setup-description");
    }

    const harness =
      story.start?.kind === "snapshot"
        ? test.rehydrate(target, {
            snapshot: story.start.snapshot,
          })
        : test(target).run();

    return runHarnessStory(harness, story);
  }

  if (story.start !== undefined) {
    return blockedStoryRun(story, "explicit-start-requires-machine");
  }

  return runHarnessStory(target, story);
}
