import { describe, expect, it } from "vite-plus/test";
import { manifests } from "../../fixtures/index.ts";
import { Step, type StoryRun } from "../../src/host/testing/index.ts";
import { checked } from "./rules.ts";
import { slices } from "./sweep.ts";

const RELOADS_MS = 120_000;

// Every onContext reaction's event, by machine: the events only a context wave enqueues.
const reactionEvents = new Set(
  manifests.flatMap((m) =>
    Object.values(m.app.machines).flatMap((entry) => {
      const { compiled } = "machine" in entry ? entry.machine : entry;

      return compiled.reactions.map((r) => `${compiled.id} ${r.event.event}`);
    }),
  ),
);

const reactionTurns = (run: StoryRun) =>
  run.evidence.filter(
    (e) => e._tag === "Turn" && reactionEvents.has(`${e.actor.machine} ${e.event}`),
  ).length;

const reload = Step.reload({ reattach: true, heldWrites: "abort" });

describe("reloads repeated over a consistent saved world (Actors R9, R19)", () => {
  it(
    "Actors R9, R19: every fixture Story but the stress ones, reloaded three times, hears no more onContext events than reloaded once",
    async () => {
      const made: Array<string> = [];

      for (const story of slices.rest) {
        // oxlint-disable-next-line no-await-in-loop -- one run at a time: each Story is its own world
        const once = checked(await story.run({ steps: [...story.steps, reload] }));

        // oxlint-disable-next-line no-await-in-loop -- one run at a time: each Story is its own world
        const thrice = checked(
          await story.run({ steps: [...story.steps, reload, reload, reload] }),
        );

        if (reactionTurns(thrice) !== reactionTurns(once))
          made.push(`${story.id}: ${reactionTurns(once)} then ${reactionTurns(thrice)}`);
      }

      expect(made).toEqual([]);
    },
    RELOADS_MS,
  );
});
