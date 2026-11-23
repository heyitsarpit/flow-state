import { describe, expect, it } from "vite-plus/test";
import { generate, Step } from "../../src/host/testing/index.ts";
import { checked } from "../rules/rules.ts";

// Operations T1 and T2 on the real runtime: generated sequences of the read cues a shopper can
// cause (searches, page turns, refreshes, clears, closes and saves on two pages and a saved list),
// with the catalog's reads held, dropped and answered in any order, judged after every run by the
// run rules and by the fake server's own call log, never by the entry table: no step starts two
// requests for one read key (R3, I6: an Ask joins a request that is current or wants one trailing
// request), except a step that clears it (Clear on a Running entry releases the call and starts
// another). The results page's read members are not built, so its samples load inside the test.

const SEEDS = Array.from({ length: 40 }, (_, n) => n + 1);

describe("the entry table over generated read sequences (Operations T1, T2; R3, I6)", () => {
  it.fails("Operations R3, I6, T2: across 40 generated runs, no step starts two requests for one read key unless it clears that key", async () => {
    const { resultsSamples } = await import("../../fixtures/search/pending/stories.ts");

    const breaches = SEEDS.flatMap((seed) => {
      const run = checked(generate(resultsSamples, { drawing: "usual", seed }).run);

      const clears = new Set(
        run.steps.flatMap((step, n) =>
          Step.$is("send")(step) && step.event._tag === "ClearResults" ? [n] : [],
        ),
      );

      const started = new Map<string, { readonly step: number; readonly count: number }>();

      for (const call of run.end.calls)
        if (call.endpoint === "results" || call.endpoint === "saved") {
          const fields = Object.entries(call.input).map(([k, v]) => `${k}=${String(v)}`);
          const key = `${call.endpoint} ${fields.join(",")} @${String(call.step)}`;
          started.set(key, { step: call.step, count: (started.get(key)?.count ?? 0) + 1 });
        }

      return [...started]
        .filter(([, { step, count }]) => count > 1 && !clears.has(step))
        .map(
          ([key, { count }]) => `seed ${String(seed)}: ${key} started ${String(count)} requests`,
        );
    });

    expect(breaches).toEqual([]);
  });
});
