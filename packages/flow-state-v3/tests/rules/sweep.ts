import { expect, it } from "vite-plus/test";
import { manifests } from "../../fixtures/index.ts";
import {
  type Batch,
  Step,
  StoryFailed,
  type Story,
  type StoryRun,
  type WorldWord,
} from "../../src/host/testing/index.ts";
import { breachesOf } from "./rules.ts";

/**
 * Every Story of every fixture, the stress Stories included.
 */
export const fixtureStories: ReadonlyArray<Story<string>> = manifests.flatMap((m) =>
  Object.values(m.stories),
);

const SKIPPED = [/^nothing held at /u, / never used$/u];

/**
 * Whether a run's script fault is one a reload can cause: a word that finds nothing held, or a
 * hold no call uses.
 */
export const skippable = (fault: StoryFailed) =>
  fault.problem.split("; ").every((p) => SKIPPED.some((s) => s.test(p)));

const slotOf = (word: WorldWord) =>
  word._tag === "wire" ? `${word.server.name}.${word.endpoint}` : "storage";

const opens = (word: WorldWord) =>
  (word._tag === "wire" || word._tag === "storage") && word.word === "hold";

const closes = (word: WorldWord) =>
  (word._tag === "wire" && (word.word === "release" || word.word === "lose")) ||
  (word._tag === "storage" && word.word === "release");

// A put changes the store at once and waits for nothing.
const awaits = (word: WorldWord) =>
  word._tag !== "control" && word._tag !== "stored" && !closes(word);

const wordsOf = (story: Story<string>) =>
  story.steps.flatMap((step, n) =>
    step._tag === "world" ? step.words.map((word) => ({ word, n })) : [],
  );

// The step each storage arming word (hold or refuse) is used at: the store arms its next write
// with the oldest word given before it, so the n-th write after a word takes it. A word no write
// took is absent.
const usedAt = (story: Story<string>, batches: ReadonlyArray<Batch>) => {
  const armed = wordsOf(story).filter(
    ({ word }) => word._tag === "storage" && (word.word === "hold" || word.word === "refuse"),
  );

  const used = new Map<number, number>();
  let next = 0;

  for (const batch of batches) {
    const word = armed[next];

    if (word !== undefined && word.n <= batch.step) {
      used.set(word.n, batch.step);
      next += 1;
    }
  }

  return used;
};

// Each hold paired with the release that answers it, oldest first per endpoint or the store. A
// reload also ends a storage hold whose write was issued before it, landing or aborting that
// write; a hold no write has taken yet stays armed across the reload.
const windowsOf = (story: Story<string>, batches: ReadonlyArray<Batch>) => {
  const open = new Map<string, Array<number>>();
  const used = usedAt(story, batches);

  const answered = (word: WorldWord, n: number) => {
    const slot = slotOf(word);

    if (opens(word)) open.set(slot, [...(open.get(slot) ?? []), n]);
    const held = closes(word) ? open.get(slot)?.shift() : undefined;

    return held === undefined ? [] : [[held, n] as const];
  };

  return story.steps.flatMap((step, n) => {
    if (step._tag === "world") return step.words.flatMap((word) => answered(word, n));

    if (step._tag !== "reload") return [];
    const holds = open.get("storage") ?? [];
    const ended = holds.filter((from) => (used.get(from) ?? n) < n);
    open.set(
      "storage",
      holds.filter((from) => !ended.includes(from)),
    );

    return ended.map((from) => [from, n] as const);
  });
};

/**
 * Whether a reload at position `at` of a Story falls inside a hold window: after a hold and no
 * later than the release that answers it (a wire hold to its endpoint's release or lose, oldest
 * first; a storage hold to a storage release, or to the reload that ends the write it held). The
 * Story's own run's batches tell when each storage hold was taken.
 */
export const inHoldWindow = (story: Story<string>, batches: ReadonlyArray<Batch>) => {
  const windows = windowsOf(story, batches);

  return (at: number) => windows.some(([from, to]) => from < at && at <= to);
};

/**
 * The reload positions of a Story a reload may make it skip: those inside a window from a hold to
 * the release that answers it (a wire hold to its endpoint's release or lose, oldest first; a
 * storage hold to a storage release or the reload that ends the held write), where the reload aborts
 * what the release then finds missing.
 * A reload that attaches nothing may also come before any hold, drop or refuse, which the app,
 * never woken, may then not use. A reload anywhere else must run.
 */
export const skipBound = (
  story: Story<string>,
  batches: ReadonlyArray<Batch>,
  reattach: boolean,
) => {
  const held = inHoldWindow(story, batches);

  const lastWord = Math.max(
    -1,
    ...wordsOf(story).flatMap(({ word, n }) => (awaits(word) ? [n] : [])),
  );

  return Array.from({ length: story.steps.length + 1 }, (_, at) => at).filter(
    (at) => held(at) || (!reattach && at <= lastWord),
  ).length;
};

type Variant =
  | { readonly kind: "ran"; readonly run: StoryRun }
  | { readonly kind: "skipped" }
  | { readonly kind: "faulted"; readonly fault: string };

// FLOW_STATE_ALLOW_UNKNOWN: a rejected run's reason is untyped until it is matched.
const faultOf = (fault: unknown) =>
  fault instanceof StoryFailed && skippable(fault)
    ? ({ kind: "skipped" } satisfies Variant)
    : ({ kind: "faulted", fault: String(fault) } satisfies Variant);

const variantOf = (story: Story<string>, steps: ReadonlyArray<Step>) =>
  story.run({ steps }).then((run) => ({ kind: "ran", run }) satisfies Variant, faultOf);

// What one variant adds to the sweep: a skip, or the breaches and faults it shows.
const judgedVariant = (name: string, variant: Variant) => {
  if (variant.kind === "skipped") return { skipped: true, failed: [] };

  if (variant.kind === "faulted") return { skipped: false, failed: [`${name}: ${variant.fault}`] };
  const silent = variant.run.evidence.length === 0 ? [`${name}: no evidence`] : [];

  return {
    skipped: false,
    failed: [...breachesOf(variant.run).map((b) => `${name}: ${b}`), ...silent],
  };
};

/**
 * Runs every fixture Story with a reload inserted at every step, under the run rules, and returns
 * the breaches and, per Story, the variants skipped beyond its bound.
 */
export const sweep = async (
  stories: ReadonlyArray<Story<string>>,
  reattach: boolean,
  heldWrites: "abort" | "land" = "abort",
) => {
  const failed: Array<string> = [];
  const overBound: Array<string> = [];
  let variants = 0;
  let skipped = 0;

  for (const story of stories) {
    let skips = 0;

    for (let at = 0; at <= story.steps.length; at += 1) {
      // The cut right after the reload lets Restore I1 judge every position.
      const steps = story.steps.toSpliced(
        at,
        0,
        Step.reload({ reattach, heldWrites }),
        Step.checkpoint({ name: "~reloaded" }),
      );

      const name = `${story.id} with a reload at ${at}`;
      variants += 1;
      // oxlint-disable-next-line no-await-in-loop -- one run at a time: each variant is its own world
      const judged = judgedVariant(name, await variantOf(story, steps));

      skips += judged.skipped ? 1 : 0;
      failed.push(...judged.failed);
    }

    skipped += skips;
    // oxlint-disable-next-line no-await-in-loop -- one run at a time: the Story's own run, for its holds
    const own = await story.run();
    const bound = skipBound(story, own.end.records.batches, reattach);

    if (skips > bound) overBound.push(`${story.id}: ${skips} variants skipped, bound ${bound}`);
  }

  return { variants, skipped, failed, overBound };
};

/**
 * The sweep's assertions: no breach, no Story skipping past its bound, and most variants run.
 */
export const swept = (result: Awaited<ReturnType<typeof sweep>>) => {
  expect(result.failed).toEqual([]);
  expect(result.overBound).toEqual([]);
  expect(result.variants).toBeGreaterThan(result.skipped);
};

/**
 * The stress Stories, which are long enough to need a sweep of their own, and the rest.
 */
export const slices = {
  stress: fixtureStories.filter((s) => s.id.includes("stress")),
  rest: fixtureStories.filter((s) => !s.id.includes("stress")),
};

/**
 * The items shard `shard` of `of` covers, so the shards take about the same work: the costliest
 * item first, each given to the shard with the least cost so far. Every item lands in exactly one
 * shard, and the choice is deterministic.
 */
export const shardOf = <T>(
  items: ReadonlyArray<T>,
  cost: (item: T) => number,
  shard: number,
  of: number,
) => {
  const load = Array.from({ length: of }, () => 0);
  const sized = items.map((item) => ({ item, cost: cost(item), owner: 0 }));

  for (const entry of sized.toSorted((a, b) => b.cost - a.cost)) {
    const least = load.indexOf(Math.min(...load));

    entry.owner = least;
    load[least] = (load[least] ?? 0) + entry.cost;
  }

  return sized.filter((entry) => entry.owner === shard).map((entry) => entry.item);
};

/** A Story's sweep cost: a run's work grows with its steps, and a sweep runs one at every position. */
export const sweepCost = (story: Story<string>) => (story.steps.length + 1) ** 2;

/** The three reload sweeps: a reload that restores held writes, lands them, or attaches nothing. */
export type SweepMode = "abort" | "land" | "unattached";

/**
 * One shard of the reload sweeps: the Stories the shard covers, each swept under all three reload
 * modes. Across the shards every Story runs at every position once per mode.
 */
export const sweepShard = (
  scope: "rest" | "stress",
  shard: number,
  of: number,
  ms: number,
  modes: ReadonlyArray<SweepMode> = ["abort", "land", "unattached"],
) => {
  const mine = shardOf(scope === "rest" ? slices.rest : slices.stress, sweepCost, shard, of);

  const stories =
    scope === "rest" ? "every fixture Story but the stress ones" : "every stress Story";

  const titles: Record<SweepMode, string> = {
    abort: `a reload at every step of ${stories} breaks no rule`,
    land: `a reload that lands every held write unheard, at every step of ${stories}, breaks no rule`,
    unattached: `a reload that attaches nothing, at every step of ${stories}, breaks no rule`,
  };

  const runs: Record<SweepMode, () => ReturnType<typeof sweep>> = {
    abort: () => sweep(mine, true),
    land: () => sweep(mine, true, "land"),
    unattached: () => sweep(mine, false),
  };

  for (const mode of modes)
    it(
      titles[mode],
      async () => {
        swept(await runs[mode]());
      },
      ms,
    );
};
