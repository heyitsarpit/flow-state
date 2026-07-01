import type {
  FlowMachine,
  FlowStory,
  FlowStoryDocDescriptor,
  FlowStoryDocEvent,
  FlowStoryDocExpectation,
  FlowStoryDocSeed,
  FlowStoryDocStart,
} from "../api/types.js";

function createStart<Machine extends FlowMachine>(
  story: FlowStory<Machine>,
): FlowStoryDocStart<Machine> {
  if (story.start === undefined) {
    return Object.freeze({
      kind: "default" as const,
      label: "Start from the machine's initial snapshot.",
    });
  }

  if (story.start.kind === "snapshot") {
    return Object.freeze({
      kind: "snapshot" as const,
      label: `Start from snapshot state '${story.start.snapshot.value}'.`,
      state: story.start.snapshot.value,
      snapshot: story.start.snapshot,
    });
  }

  return Object.freeze({
    kind: "setup" as const,
    label: story.start.description,
    description: story.start.description,
  });
}

function createEvent<Machine extends FlowMachine>(
  event: FlowStory<Machine>["events"][number],
  index: number,
): FlowStoryDocEvent<Machine> {
  return Object.freeze({
    index: index + 1,
    event,
    label: `Send ${event.type}`,
  });
}

function createValuesLabel(prefix: string, values: ReadonlyArray<string>): string {
  return `${prefix}: ${values.join(", ")}`;
}

function createSeed<Machine extends FlowMachine, FixtureName extends string>(
  story: FlowStory<Machine, FixtureName>,
): FlowStoryDocSeed<FixtureName> | undefined {
  if (story.seed === undefined) {
    return undefined;
  }

  const parts: Array<string> = [];
  const resourceCount = story.seed.resources?.length ?? 0;
  const fixtures = Object.freeze([...(story.seed.fixtures ?? [])]);
  const hasBoot = story.seed.boot !== undefined;

  if (resourceCount > 0) {
    parts.push(`${resourceCount} seeded resource${resourceCount === 1 ? "" : "s"}`);
  }

  if (fixtures.length > 0) {
    parts.push(`fixtures: ${fixtures.join(", ")}`);
  }

  if (hasBoot) {
    parts.push("runtime boot payload");
  }

  if (story.seed.actorId !== undefined) {
    parts.push(`actor: ${story.seed.actorId}`);
  }

  return Object.freeze({
    label: parts.join("; "),
    resourceCount,
    fixtures,
    hasBoot,
    ...(story.seed.actorId === undefined ? {} : { actorId: story.seed.actorId }),
  });
}

function createExpectations<Machine extends FlowMachine>(
  story: FlowStory<Machine>,
): ReadonlyArray<FlowStoryDocExpectation<Machine>> {
  const expectations: Array<FlowStoryDocExpectation<Machine>> = [];

  if (story.expectedState !== undefined) {
    expectations.push(
      Object.freeze({
        kind: "state" as const,
        label: `Expect final state '${story.expectedState}'.`,
        state: story.expectedState,
      }),
    );
  }

  const expectedFacts = story.expectedFacts;

  if (expectedFacts?.receiptTypes !== undefined) {
    expectations.push(
      Object.freeze({
        kind: "receipt-types" as const,
        label: createValuesLabel("Expect receipt types", expectedFacts.receiptTypes),
        receiptTypes: expectedFacts.receiptTypes,
      }),
    );
  }

  if (expectedFacts?.relatedIds !== undefined) {
    expectations.push(
      Object.freeze({
        kind: "related-ids" as const,
        label: createValuesLabel("Expect related ids", expectedFacts.relatedIds),
        relatedIds: expectedFacts.relatedIds,
      }),
    );
  }

  if (expectedFacts?.issueKinds !== undefined) {
    expectations.push(
      Object.freeze({
        kind: "issue-kinds" as const,
        label: createValuesLabel("Expect issue kinds", expectedFacts.issueKinds),
        issueKinds: expectedFacts.issueKinds,
      }),
    );
  }

  if (expectedFacts?.issueSources !== undefined) {
    expectations.push(
      Object.freeze({
        kind: "issue-sources" as const,
        label: createValuesLabel("Expect issue sources", expectedFacts.issueSources),
        issueSources: expectedFacts.issueSources,
      }),
    );
  }

  if (expectedFacts?.outcomeKinds !== undefined) {
    expectations.push(
      Object.freeze({
        kind: "outcome-kinds" as const,
        label: createValuesLabel("Expect outcome kinds", expectedFacts.outcomeKinds),
        outcomeKinds: expectedFacts.outcomeKinds,
      }),
    );
  }

  if (expectedFacts?.outcomeSources !== undefined) {
    expectations.push(
      Object.freeze({
        kind: "outcome-sources" as const,
        label: createValuesLabel("Expect outcome sources", expectedFacts.outcomeSources),
        outcomeSources: expectedFacts.outcomeSources,
      }),
    );
  }

  return Object.freeze(expectations);
}

export function createStoryDoc<Machine extends FlowMachine, FixtureName extends string>(
  story: FlowStory<Machine, FixtureName>,
): FlowStoryDocDescriptor<Machine, FixtureName> {
  const seed = createSeed(story);

  return Object.freeze({
    kind: "story-doc" as const,
    story,
    headline: story.title,
    ...(seed === undefined ? {} : { seed }),
    start: createStart(story),
    events: Object.freeze(story.events.map(createEvent)),
    expectations: createExpectations(story),
    tags: Object.freeze([...(story.tags ?? [])]),
  });
}
