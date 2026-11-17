import { describe, expect, it } from "vite-plus/test";
import { Step, type Story } from "../../src/host/testing/index.ts";
import { RuntimeDefaults } from "../../src/index.ts";
import { checked } from "./rules.ts";

/**
 * Declares the tests that run each of the given Stories under another world: another seed, and
 * an ending reload after which every actor that wrote attaches.
 */
// Every Story of a slice runs in one test; under `nub run faults` the machine is shared with
// seven planted copies.
const WORLD_MS = 230_000;

export const underAnotherWorld = (which: string, stories: ReadonlyArray<Story<string>>) =>
  describe(`${which} under another world`, () => {
    it(
      "under another seed, so other session ids and a shuffled load order, every Story keeps every rule (WriteLanes I6)",
      async () => {
        for (const story of stories) {
          // oxlint-disable-next-line no-await-in-loop -- one run at a time: each Story is its own world
          const first = await story.run();
          // oxlint-disable-next-line no-await-in-loop -- one run at a time: each Story is its own world
          const other = checked(await story.run({ steps: story.steps, seed: 2 }));

          const mints = (run: typeof first) =>
            run.evidence.flatMap((e) => (e._tag === "Minted" ? [e.attempt] : []));

          expect(mints(other).filter((id) => mints(first).includes(id))).toEqual([]);
        }
      },
      WORLD_MS,
    );

    it(
      "ended by a reload, then every actor that wrote attached, every Story keeps every rule (Restore I1)",
      async () => {
        for (const story of stories) {
          // oxlint-disable-next-line no-await-in-loop -- one run at a time: each Story is its own world
          const first = await story.run();

          const writers = new Map(
            first.evidence.flatMap((e) =>
              e._tag === "Minted" ? [[`${e.actor.machine}/${e.actor.name}`, e.actor] as const] : [],
            ),
          );

          const steps = [
            ...story.steps,
            Step.reload({ reattach: true, heldWrites: "abort" }),
            // The cut right after the reload lets Restore I1 judge it.
            Step.checkpoint({ name: "~reloaded" }),
            // Each writer is ensured with the context its Story's ref gave it, as an app does.
            ...[...writers].map(([key, actor]) =>
              Step.ensure({
                actor,
                context:
                  story.steps.flatMap((s) =>
                    s._tag === "ensure" && `${s.actor.machine}/${s.actor.name}` === key
                      ? [s.context]
                      : [],
                  )[0] ?? new Map(),
              }),
            ),
            Step.advance({ duration: RuntimeDefaults.disposalBound }),
          ];

          // oxlint-disable-next-line no-await-in-loop -- one run at a time: each Story is its own world
          const run = checked(await story.run({ steps }));

          expect(Object.keys(run.checkpoints)).toContain("~reloaded");
        }
      },
      WORLD_MS,
    );
  });
