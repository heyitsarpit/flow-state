import { expect } from "vite-plus/test";
import { Step, type Story, type StoryRun } from "../../src/host/testing/index.ts";
import { render, TraceRecord } from "../../src/host/trace.ts";
import { checked } from "./rules.ts";

const disposals = (run: StoryRun, open: number) =>
  run.trace.events.filter(
    (e) =>
      e.tab.open === open &&
      TraceRecord.$is("Runtime")(e.record) &&
      e.record.evidence._tag === "RuntimeDisposed",
  ).length;

/**
 * Runs a Story as a hand case does and returns the run: every run rule holds; a second run prints
 * the same trace (Turn I17, Stories I21); and the same steps, then the Runtime's disposal and its
 * 5-second bound, end the disposal once in the last open (Actors R22, R23).
 */
export const played = async <Names extends string>(story: Story<Names>) => {
  const run = checked(await story.run());
  const again = await story.run();

  expect(render(again.trace, "text")).toBe(render(run.trace, "text"));

  const reloads = story.steps.filter((s) => s._tag === "reload").length;
  const last = story.steps.findLastIndex((s) => s._tag === "reload");
  const disposed = story.steps.slice(last + 1).some((s) => s._tag === "disposeRuntime");

  const bound = Step.advance({ duration: "5 seconds" });

  const steps = disposed ? [...story.steps, bound] : [...story.steps, Step.disposeRuntime(), bound];

  const ended = checked(await story.run({ steps }));

  expect(disposals(ended, reloads + 1)).toBe(1);

  return run;
};
