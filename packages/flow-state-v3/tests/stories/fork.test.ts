import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";
import {
  type Cut,
  forkReloads,
  type Reload,
  Step,
  type Story,
  type StoryRun,
  type WorldWord,
} from "../../src/host/testing/index.ts";
import { slices } from "../rules/sweep.ts";

// What a cut shows, read once it is taken.
const seen = (cut: Cut) => ({
  now: cut.now,
  inspection: cut.inspection,
  records: cut.records,
  calls: cut.calls,
});

// What a run shows, the parts a fork could get wrong: everything it recorded and every cut.
const shown = (run: StoryRun) => ({
  evidence: run.evidence,
  trace: run.trace,
  checkpoints: Object.entries(run.checkpoints).map(([name, cut]) => [name, seen(cut)]),
  end: seen(run.end),
});

// FLOW_STATE_ALLOW_UNKNOWN: a rejected run's reason is untyped until it is printed.
const failed = (fault: unknown) => ({ failed: String(fault) });

const words = (story: Story<string>) =>
  story.steps.flatMap((step) => (step._tag === "world" ? step.words : []));

// The median-length Story with each kind of world a reload must carry over: a held call, a held write,
// the network down, and a reload of its own.
const kinds: ReadonlyArray<(story: Story<string>) => boolean> = [
  (s) => words(s).some((w: WorldWord) => w._tag === "wire" && w.word === "hold"),
  (s) => words(s).some((w: WorldWord) => w._tag === "storage" && w.word === "hold"),
  (s) => words(s).some((w: WorldWord) => w._tag === "network" && w.word === "offline"),
  (s) => s.steps.some((step) => step._tag === "reload"),
];

const chosen = [
  ...new Set(
    kinds.flatMap((kind) => {
      const sorted = slices.rest.filter(kind).toSorted((a, b) => a.steps.length - b.steps.length);

      return sorted.slice(sorted.length >> 1, (sorted.length >> 1) + 1);
    }),
  ),
];

const reloads: ReadonlyArray<Reload> = [
  Step.reload({ reattach: true, heldWrites: "abort" }),
  Step.reload({ reattach: true, heldWrites: "land" }),
  Step.reload({ reattach: false, heldWrites: "abort" }),
];

const marked = Step.checkpoint({ name: "~reloaded" });

describe("A reload forked from a saved world", () => {
  it("covers a held call, a held write, the network down and a reload", () => {
    expect(kinds.every((kind) => chosen.some(kind))).toBe(true);
  });

  for (const story of chosen)
    it(`${story.id}: at every position and in each reload mode, gives the run a replay from boot gives (Stories R18, I23)`, async () => {
      const forks: Array<unknown> = [];
      const replays: Array<unknown> = [];

      const own = await Effect.runPromise(
        forkReloads(story, (at, fork) =>
          Effect.forEach(
            reloads,
            (reload) =>
              fork(reload, [marked, ...story.steps.slice(at)]).pipe(
                Effect.match({ onSuccess: shown, onFailure: failed }),
                Effect.map(
                  (seen) =>
                    void forks.push({
                      at,
                      reload: `${reload.reattach} ${reload.heldWrites}`,
                      seen,
                    }),
                ),
              ),
            { concurrency: 1, discard: true },
          ),
        ),
      );

      for (let at = 0; at <= story.steps.length; at += 1)
        for (const reload of reloads) {
          const steps = story.steps.toSpliced(at, 0, reload, marked);

          // oxlint-disable-next-line no-await-in-loop -- one run at a time: each replay is its own world
          const seen = await story.run({ steps }).then(shown, failed);

          replays.push({ at, reload: `${reload.reattach} ${reload.heldWrites}`, seen });
        }

      expect(forks).toEqual(replays);
      expect(shown(own)).toEqual(shown(await story.run()));
    });
});
