import { expect } from "vite-plus/test";
import { stories as cells } from "../../fixtures/cells/stories.ts";
import { stories as palette } from "../../fixtures/command-palette/stories.ts";
import { stories as numberInput } from "../../fixtures/number-input/stories.ts";
import { stories as pay } from "../../fixtures/pay/stories.ts";
import { stories as signIn } from "../../fixtures/sign-in/stories.ts";
import { stories as sync } from "../../fixtures/sync/stories.ts";
import { stories as transfers } from "../../fixtures/transfers/stories.ts";
import {
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
export const fixtureStories: ReadonlyArray<Story<string>> = [
  ...Object.values(pay),
  ...Object.values(cells),
  ...Object.values(sync),
  ...Object.values(signIn),
  ...Object.values(transfers),
  ...Object.values(palette),
  ...Object.values(numberInput),
];

// Script faults a reload can cause: a word that finds nothing held, or a hold no call uses.
const SKIPPED = [/^nothing held at /u, / never used$/u];

const skippable = (fault: StoryFailed) =>
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

// Each hold paired with the release that answers it, oldest first per endpoint or the store.
const windowsOf = (story: Story<string>) => {
  const open = new Map<string, Array<number>>();

  return wordsOf(story).flatMap(({ word, n }) => {
    const slot = slotOf(word);

    if (opens(word)) open.set(slot, [...(open.get(slot) ?? []), n]);
    const held = closes(word) ? open.get(slot)?.shift() : undefined;

    return held === undefined ? [] : [[held, n] as const];
  });
};

/**
 * The reload positions of a Story a reload may make it skip: those inside a window from a hold to
 * the release that answers it (a wire hold to its endpoint's release or lose, oldest first; a
 * storage hold to a storage release), where the reload aborts what the release then finds missing.
 * A reload that attaches nothing may also come before any hold, drop or refuse, which the app,
 * never woken, may then not use. A reload anywhere else must run.
 */
export const skipBound = (story: Story<string>, reattach: boolean) => {
  const windows = windowsOf(story);

  const lastWord = Math.max(
    -1,
    ...wordsOf(story).flatMap(({ word, n }) => (awaits(word) ? [n] : [])),
  );

  return Array.from({ length: story.steps.length + 1 }, (_, at) => at).filter(
    (at) => windows.some(([from, to]) => from < at && at <= to) || (!reattach && at <= lastWord),
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
    const bound = skipBound(story, reattach);

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
