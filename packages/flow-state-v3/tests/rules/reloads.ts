import { expect, it } from "vite-plus/test";
import { manifests } from "../../fixtures/index.ts";
import { cartFirst, conflictingCart } from "../../fixtures/shop/stories/structure.ts";
import { parentUnderChildren } from "../../fixtures/session/stories/usual.ts";
import { conflictingBadge, missingTeam } from "../../fixtures/session/stories/structure.ts";
import { nestedConflictingTeam } from "../../fixtures/session/stories/values.ts";
import { sessionFirst } from "../../fixtures/sign-in/stories/structure.ts";
import { syncFirst } from "../../fixtures/sync/stories/structure.ts";
import { customerFirst } from "../../fixtures/transfers/stories/structure.ts";
import { Step, type Story, StoryFailed, type StoryRun } from "../../src/host/testing/index.ts";
import { checked } from "./rules.ts";
import { switchedOn } from "../switches.ts";
import { inHoldWindow, shardOf, skippable, slices } from "./sweep.ts";

export const RELOADS_MS = 240_000;

const entries = manifests.flatMap((m) =>
  Object.values(m.app.machines).map((entry) => ("machine" in entry ? entry.machine : entry)),
);

// Every onContext reaction's event, by machine: the events only a context wave enqueues.
const reactionEvents = new Set(
  entries.flatMap(({ compiled }) =>
    compiled.reactions.map((r) => `${compiled.id} ${r.event.event}`),
  ),
);

// The machines that read context: a reload must restore what each of them has seen.
const consumers = new Set(
  entries.flatMap(({ compiled }) => (compiled.context.size > 0 ? [compiled.id] : [])),
);

const reactionTurns = (run: StoryRun) =>
  run.evidence.filter(
    (e) => e._tag === "Turn" && reactionEvents.has(`${e.actor.machine} ${e.event}`),
  ).length;

export const reload = Step.reload({ reattach: true, heldWrites: "abort" });

// Every Story whose app runs a context consumer, the stress ones aside, and the steps each
// refused-shape builder runs before the Runtime refuses its last.
export const contextStories: ReadonlyArray<{
  readonly story: Story<string>;
  readonly steps: number;
}> = [
  ...manifests.flatMap((m) =>
    Object.values(m.app.machines).some((entry) =>
      consumers.has(("machine" in entry ? entry.machine : entry).compiled.id),
    )
      ? Object.values(m.stories)
          .filter((s) => slices.rest.includes(s))
          .map((story) => ({ story, steps: story.steps.length }))
      : [],
  ),
  ...[
    cartFirst,
    conflictingCart,
    customerFirst,
    sessionFirst,
    syncFirst,
    parentUnderChildren,
    conflictingBadge,
    missingTeam,
    nestedConflictingTeam,
  ].map((build) => {
    const story = build();

    return { story, steps: story.steps.length - 1 };
  }),
];

// The run's onContext turns, or why it could not run: a script fault a reload can cause skips it.
export const turnsOf = async (story: Story<string>, steps: ReadonlyArray<Step>) =>
  story.run({ steps }).then(
    (run) => reactionTurns(checked(run)),
    // FLOW_STATE_ALLOW_UNKNOWN: a rejected run's reason is untyped until it is matched.
    (fault: unknown) =>
      fault instanceof StoryFailed && skippable(fault) ? "skipped" : `faulted: ${String(fault)}`,
  );

// The double reload at every position of every context Story. Most of what it catches breaks at
// every position, so the usual run reloads twice only inside hold windows, where a reload aborts
// what is held, and at the end; FLOW_EVERY_RELOAD=true runs it at every position again.
const everyPosition = switchedOn("FLOW_EVERY_RELOAD");

// The positions a context Story's first `steps` steps are reloaded twice at.
const positionsOf = (story: Story<string>, steps: number) => {
  const held = inHoldWindow(story);

  return Array.from({ length: steps + 1 }, (_, at) => at).filter(
    (at) => everyPosition || held(at) || at === steps,
  );
};

// A double reload at one position: skipped, why its second reload heard more, or "" when it did not.
const doubledAt = async (story: Story<string>, ran: ReadonlyArray<Step>, at: number) => {
  const once = await turnsOf(story, ran.toSpliced(at, 0, reload));
  const twice = await turnsOf(story, ran.toSpliced(at, 0, reload, reload));

  if (once === "skipped") return "skipped";

  return `${once}${twice}`.includes("faulted") || once !== twice
    ? `${story.id} at ${at}: ${once} then ${twice}`
    : "";
};

/**
 * One shard of the test that reloads twice: the context Stories `shardOf` gives shard `shard` of
 * `of`, each inside its hold windows and at its end (every position under FLOW_EVERY_RELOAD).
 */
export const onceShard = (shard: number, of: number) => {
  it(
    everyPosition
      ? "Actors R9, R19: at every position of every context Story, a second reload right after a reload hears no onContext event the first did not"
      : "Actors R9, R19: inside every hold window and at the end of every context Story, a second reload right after a reload hears no onContext event the first did not",
    async () => {
      const verdicts: Array<string> = [];

      for (const { story, steps } of shardOf(contextStories, (c) => (c.steps + 1) ** 2, shard, of))
        for (const at of positionsOf(story, steps))
          // oxlint-disable-next-line no-await-in-loop -- one run at a time: each variant is its own world
          verdicts.push(await doubledAt(story, story.steps.slice(0, steps), at));

      const skipped = verdicts.filter((v) => v === "skipped").length;

      expect(verdicts.filter((v) => v !== "" && v !== "skipped")).toEqual([]);
      expect(skipped * 10 < verdicts.length).toBe(true);
    },
    RELOADS_MS,
  );
};
