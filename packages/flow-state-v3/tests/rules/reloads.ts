import { Predicate } from "effect";
import { expect, it } from "vite-plus/test";
import { LIMITS } from "../limits.ts";
import { manifests } from "../../fixtures/index.ts";
import { cartFirst, conflictingCart } from "../../fixtures/shop/stories/structure.ts";
import { parentUnderChildren } from "../../fixtures/session/stories/usual.ts";
import { conflictingBadge, missingTeam } from "../../fixtures/session/stories/structure.ts";
import { nestedConflictingTeam } from "../../fixtures/session/stories/values.ts";
import { sessionFirst } from "../../fixtures/sign-in/stories/structure.ts";
import { syncFirst } from "../../fixtures/sync/stories/structure.ts";
import { customerFirst } from "../../fixtures/transfers/stories/structure.ts";
import { InternalsId } from "../../src/host/inspect.ts";
import { Step, type Story, StoryFailed, type StoryRun } from "../../src/host/testing/index.ts";
import { checked } from "./rules.ts";
import { switchedOn } from "../switches.ts";
import { heldSlotsAt, shardOf, skippable, slices } from "./sweep.ts";
import { compiledOf } from "../../src/host/inspect.ts";

const entries = manifests.flatMap((m) =>
  Object.values(m.app.machines).map((entry) => ("machine" in entry ? entry.machine : entry)),
);

// Every onContext reaction's event, by machine: the events only a context wave enqueues.
const reactionEvents = new Set(
  entries
    .map(compiledOf)
    .flatMap((compiled) =>
      compiled[InternalsId].reactions.map((r) => `${compiled.id} ${r.event.event}`),
    ),
);

// The machines that read context: a reload must restore what each of them has seen.
const consumers = new Set(
  entries.map(compiledOf).flatMap((compiled) => (compiled.context.size > 0 ? [compiled.id] : [])),
);

const reactionTurns = (run: StoryRun) =>
  run.evidence.filter(
    (e) =>
      e._tag === "Turn" &&
      // oxlint-disable-next-line flow-state/no-event-name-filter -- a rule over every app's machines: the names come from their compiled reactions, so no token exists to name
      reactionEvents.has(`${e.actor.machine} ${e.event}`),
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
      consumers.has(compiledOf("machine" in entry ? entry.machine : entry).id),
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
export const reactionTurnsOf = async (story: Story<string>, steps: ReadonlyArray<Step>) =>
  story.run({ steps }).then(
    (run) => reactionTurns(checked(run)),
    // FLOW_STATE_ALLOW_UNKNOWN: a rejected run's reason is untyped until it is matched.
    (fault: unknown) =>
      fault instanceof StoryFailed && skippable(fault)
        ? `skipped: ${fault.problem}`
        : `faulted: ${String(fault)}`,
  );

// Whether a run's skip is one the reload's hold windows allow: each word that found nothing held
// acted on a slot whose hold the reload fell inside, so the reload aborted what it needed.
const allowedSkip = (verdict: number | string, slots: ReadonlySet<string>) =>
  Predicate.isString(verdict) &&
  verdict.startsWith("skipped: ") &&
  verdict
    .slice("skipped: ".length)
    .split("; ")
    .every((p) => p.endsWith(" never used") || slots.has(p.replace(/^nothing held at /u, "")));

// The double reload at every position of every context Story. Most of what it catches breaks at
// every position, so the usual run reloads twice only inside hold windows, where a reload aborts
// what is held, and at the end; FLOW_EVERY_RELOAD=true runs it at every position again.
const everyPosition = switchedOn("FLOW_EVERY_RELOAD");

// The positions a context Story's first `steps` steps are reloaded twice at, each with the held
// slots of the hold windows it is inside, the only place a reload may make a run skip.
const positionsOf = async (story: Story<string>, steps: number) => {
  const own = await story.run({ steps: story.steps.slice(0, steps) });
  const slotsAt = heldSlotsAt(story, own.end.records.batches);

  return Array.from({ length: steps + 1 }, (_, at) => ({ at, slots: slotsAt(at) })).filter(
    (p) => everyPosition || p.slots.size > 0 || p.at === steps,
  );
};

// A double reload at one position: "skipped" when a reload inside a hold window aborted what a
// later word needed, else why it failed: a run faulted, the second reload heard more, a run skipped
// for a slot no window at that position holds, or the Story's end skipped. "" when it held.
const doubledAt = async (
  story: Story<string>,
  ran: ReadonlyArray<Step>,
  {
    at,
    slots,
    end,
  }: { readonly at: number; readonly slots: ReadonlySet<string>; readonly end: boolean },
) => {
  const once = await reactionTurnsOf(story, ran.toSpliced(at, 0, reload));
  const twice = await reactionTurnsOf(story, ran.toSpliced(at, 0, reload, reload));
  const both = [once, twice];

  if (both.some((v) => Predicate.isString(v) && v.startsWith("faulted")))
    return `${story.id} at ${at}: ${once} then ${twice}`;

  const skips = both.filter(Predicate.isString);

  if (skips.length === 0)
    return once === twice ? "" : `${story.id} at ${at}: ${once} then ${twice}`;

  if (end) return `${story.id} at ${at}: ${skips.join(", ")} at the Story's end`;

  return skips.every((v) => allowedSkip(v, slots))
    ? "skipped"
    : `${story.id} at ${at}: ${skips.join(", ")} outside its hold windows`;
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
      const skipped: Array<string> = [];
      let windows = 0;

      for (const { story, steps } of shardOf(contextStories, (c) => (c.steps + 1) ** 2, shard, of))
        // oxlint-disable-next-line no-await-in-loop -- one run at a time: the Story's own run, for its holds
        for (const position of await positionsOf(story, steps)) {
          windows += position.slots.size > 0 ? 1 : 0;

          // oxlint-disable-next-line no-await-in-loop -- one run at a time: each variant is its own world
          const verdict = await doubledAt(story, story.steps.slice(0, steps), {
            ...position,
            end: position.at === steps,
          });

          if (verdict === "skipped") skipped.push(`${story.id} at ${String(position.at)}`);
          else if (verdict !== "") verdicts.push(verdict);
        }

      expect(verdicts).toEqual([]);
      // Each skip is bounded by its position's own hold windows above, and at most one per
      // hold-window position; the list names them.
      expect({ skipped, within: skipped.length <= windows }).toEqual({ skipped, within: true });
    },
    LIMITS.reloadSweep,
  );
};
