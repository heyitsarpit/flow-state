import { Effect, Formatter } from "effect";
import { expect, it } from "vite-plus/test";
import { manifests } from "../../fixtures/index.ts";
import {
  type Batch,
  forkReloads,
  type Reload,
  Step,
  StoryFailed,
  type Story,
  type StoryRun,
  type WorldWord,
} from "../../src/host/testing/index.ts";
import { switchedOn } from "../switches.ts";
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
  word._tag === "wire" || word._tag === "cleanup"
    ? `${word.server.name}.${word.endpoint}`
    : "storage";

const opens = (word: WorldWord) =>
  (word._tag === "wire" || word._tag === "storage") && word.word === "hold";

const closes = (word: WorldWord) =>
  (word._tag === "wire" && (word.word === "release" || word.word === "lose")) ||
  (word._tag === "storage" && (word.word === "release" || word.word === "refuseHeld"));

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

    return held === undefined ? [] : [[held, n, slot] as const];
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

    return ended.map((from) => [from, n, "storage"] as const);
  });
};

/**
 * Whether a reload at position `at` of a Story falls inside a hold window: after a hold and no
 * later than the release that answers it (a wire hold to its endpoint's release or lose, oldest
 * first; a storage hold to a storage release or refuseHeld, or to the reload that ends the write it held). The
 * Story's own run's batches tell when each storage hold was taken.
 */
export const inHoldWindow = (story: Story<string>, batches: ReadonlyArray<Batch>) => {
  const windows = windowsOf(story, batches);

  return (at: number) => windows.some(([from, to]) => from < at && at <= to);
};

// How a word that finds nothing held names a slot.
const nameOfSlot = (slot: string) => (slot === "storage" ? "the store" : slot);

/**
 * What a reload at position `at` of a Story may find gone: the held slots of the hold windows it
 * falls in, each as a word acting on it names it when nothing is held there (`the store`, or a
 * server's endpoint).
 */
export const heldSlotsAt = (story: Story<string>, batches: ReadonlyArray<Batch>) => {
  const windows = windowsOf(story, batches);

  return (at: number) =>
    new Set(
      windows.flatMap(([from, to, slot]) => (from < at && at <= to ? [nameOfSlot(slot)] : [])),
    );
};

/** Which reload positions of a Story a sweep covers, by index. */
export type Positions = (at: number) => boolean;

const every: Positions = () => true;

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
  positions: Positions = every,
) => {
  const held = inHoldWindow(story, batches);

  const lastWord = Math.max(
    -1,
    ...wordsOf(story).flatMap(({ word, n }) => (awaits(word) ? [n] : [])),
  );

  return Array.from({ length: story.steps.length + 1 }, (_, at) => at).filter(
    (at) => positions(at) && (held(at) || (!reattach && at <= lastWord)),
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

const nameAt = (story: Story<string>, at: number) => `${story.id} with a reload at ${at}`;

// What the variant at position `at` adds to the sweep: a skip, or the breaches and faults it shows.
const judgedVariant = (story: Story<string>, at: number, variant: Variant) => {
  const name = nameAt(story, at);

  if (variant.kind === "skipped") return { at, skipped: true, failed: [] };

  if (variant.kind === "faulted")
    return { at, skipped: false, failed: [`${name}: ${variant.fault}`] };
  const silent = variant.run.evidence.length === 0 ? [`${name}: no evidence`] : [];

  return {
    at,
    skipped: false,
    failed: [...breachesOf(variant.run).map((b) => `${name}: ${b}`), ...silent],
  };
};

type Judged = ReturnType<typeof judgedVariant>;

/**
 * A Story's reload sweep in one mode: each position's verdict in order, and the Story's own run,
 * or why it failed.
 */
export type Swept = {
  readonly verdicts: ReadonlyArray<Judged>;
  readonly own:
    | { readonly kind: "ran"; readonly run: StoryRun }
    | { readonly kind: "failed"; readonly fault: string };
};

// The cut right after the reload lets Restore I1 judge every position.
const reloaded = Step.checkpoint({ name: "~reloaded" });

/**
 * The replay form: each position runs the Story from boot with the reload inserted, so a sweep
 * replays every step before it again.
 */
// RETURN_TYPE: the Swept contract both forms give, so their verdicts compare position by position.
export const replayed = async (
  story: Story<string>,
  reload: Reload,
  positions: Positions = every,
): Promise<Swept> => {
  const verdicts: Array<Judged> = [];

  for (let at = 0; at <= story.steps.length; at += 1) {
    if (!positions(at)) continue;
    const steps = story.steps.toSpliced(at, 0, reload, reloaded);

    // oxlint-disable-next-line no-await-in-loop -- one run at a time: each variant is its own world
    const variant = await story
      .run({ steps })
      .then((run) => ({ kind: "ran", run }) satisfies Variant, faultOf);

    verdicts.push(judgedVariant(story, at, variant));
  }

  return story.run().then(
    (run) => ({ verdicts, own: { kind: "ran", run } }),
    // FLOW_STATE_ALLOW_UNKNOWN: a rejected run's reason is untyped until it is matched.
    (fault: unknown) => ({ verdicts, own: { kind: "failed", fault: String(fault) } }),
  );
};

/**
 * The forked form: the Story runs once, and each position's reload forks from the world saved
 * there, the same run the replay form gives.
 */
// RETURN_TYPE: the Swept contract both forms give, so their verdicts compare position by position.
export const forked = (
  story: Story<string>,
  reload: Reload,
  positions: Positions = every,
): Promise<Swept> => {
  const verdicts: Array<Judged> = [];

  // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- a sweep runs its forks at the test's edge, one Story at a time
  return Effect.runPromise(
    forkReloads(story, (at, fork) =>
      positions(at)
        ? fork(reload, [reloaded, ...story.steps.slice(at)]).pipe(
            Effect.match({
              onSuccess: (run) => ({ kind: "ran", run }) satisfies Variant,
              onFailure: faultOf,
            }),
            Effect.map((variant) => void verdicts.push(judgedVariant(story, at, variant))),
          )
        : Effect.void,
    ).pipe(
      Effect.match({
        onSuccess: (run) => ({ verdicts, own: { kind: "ran", run } }) satisfies Swept,
        onFailure: (fault) =>
          ({ verdicts, own: { kind: "failed", fault: String(fault) } }) satisfies Swept,
      }),
    ),
  );
};

/**
 * Where two sweeps of one Story differ: each position whose verdict differs, the number of
 * positions, and the own run's outcome. A Story whose own run failed is swept only up to the step
 * that failed, so then only the positions both reached are compared.
 */
export const differences = (story: Story<string>, a: Swept, b: Swept) => {
  const same = (x: Judged, y: Judged) =>
    x.skipped === y.skipped && x.failed.join("\n") === y.failed.join("\n");

  const ownOf = (s: Swept) => (s.own.kind === "ran" ? "ran" : s.own.fault);

  const positions = a.verdicts.flatMap((x, n) => {
    const y = b.verdicts[n];

    return y === undefined || same(x, y)
      ? []
      : [`${story.id} at ${x.at}: ${Formatter.format(x)} against ${Formatter.format(y)}`];
  });

  const counts =
    a.own.kind === "ran" && b.own.kind === "ran" && a.verdicts.length !== b.verdicts.length
      ? [`${story.id}: ${a.verdicts.length} positions against ${b.verdicts.length}`]
      : [];

  const own =
    ownOf(a) === ownOf(b) ? [] : [`${story.id}'s own run: ${ownOf(a)} against ${ownOf(b)}`];

  return [...positions, ...counts, ...own];
};

// The sweep forks each position from the world saved there. FLOW_REPLAY_SWEEP=true turns the
// replay form back on: each position is replayed from boot and judged, and the sweep
// fails wherever the forked form's verdict differs from it.
const replay = switchedOn("FLOW_REPLAY_SWEEP");

/**
 * Runs every fixture Story with a reload inserted at every step, under the run rules, and returns
 * the breaches, per Story the variants skipped beyond its bound, and under FLOW_REPLAY_SWEEP where
 * the forked and replayed forms differ.
 */
export const sweep = async (
  stories: ReadonlyArray<Story<string>>,
  reattach: boolean,
  heldWrites: "abort" | "land" = "abort",
  positions: Positions = every,
) => {
  const reload = Step.reload({ reattach, heldWrites });
  const failed: Array<string> = [];
  const overBound: Array<string> = [];
  const differ: Array<string> = [];
  let variants = 0;
  let skipped = 0;

  for (const story of stories) {
    // oxlint-disable-next-line no-await-in-loop -- one Story at a time: each sweep is its own world
    const fork = await forked(story, reload, positions);
    // oxlint-disable-next-line no-await-in-loop -- one Story at a time: each sweep is its own world
    const counted = replay ? await replayed(story, reload, positions) : fork;

    if (replay) differ.push(...differences(story, fork, counted));
    const skips = counted.verdicts.filter((v) => v.skipped).length;
    variants += counted.verdicts.length;
    skipped += skips;
    failed.push(...counted.verdicts.flatMap((v) => v.failed));

    if (counted.own.kind === "failed") failed.push(`${story.id}'s own run: ${counted.own.fault}`);
    else {
      const bound = skipBound(story, counted.own.run.end.records.batches, reattach, positions);

      if (skips > bound) overBound.push(`${story.id}: ${skips} variants skipped, bound ${bound}`);
    }
  }

  return { variants, skipped, failed, overBound, differ };
};

/**
 * The sweep's assertions: no breach, no Story skipping past its bound, and most variants run.
 */
export const swept = (result: Awaited<ReturnType<typeof sweep>>) => {
  expect(result.differ).toEqual([]);
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
 * One shard of the reload sweeps under the modes given, all three by default. The rest's shards
 * split its Stories by `sweepCost`. The stress shards each sweep every stress Story at every
 * `of`-th position, since one stress Story's sweep can outlast a shard's whole limit and its cost
 * by steps alone underrates it. Across the shards every Story runs at every position once per
 * mode.
 */
export const sweepShard = (
  scope: "rest" | "stress",
  shard: number,
  of: number,
  ms: number,
  modes: ReadonlyArray<SweepMode> = ["abort", "land", "unattached"],
) => {
  const mine = scope === "rest" ? shardOf(slices.rest, sweepCost, shard, of) : slices.stress;
  const positions: Positions = scope === "rest" ? every : (at) => at % of === shard;

  const stories =
    scope === "rest" ? "every fixture Story but the stress ones" : "every stress Story";

  const titles: Record<SweepMode, string> = {
    abort: `a reload at every step of ${stories} breaks no rule`,
    land: `a reload that lands every held write unheard, at every step of ${stories}, breaks no rule`,
    unattached: `a reload that attaches nothing, at every step of ${stories}, breaks no rule`,
  };

  const runs: Record<SweepMode, () => ReturnType<typeof sweep>> = {
    abort: () => sweep(mine, true, "abort", positions),
    land: () => sweep(mine, true, "land", positions),
    unattached: () => sweep(mine, false, "abort", positions),
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
