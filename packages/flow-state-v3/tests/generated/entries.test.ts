import { Predicate } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { samples } from "../../fixtures/chat/stories/samples.ts";
import { TraceRecord } from "../../src/host/trace.ts";
import { generate, Step } from "../../src/host/testing/index.ts";
import { checked } from "../rules/rules.ts";

// Operations T1 and T2 on the real runtime: generated sequences of the read cues a chat user can
// cause (joins, opens, refreshes, posts heard, leaves, sends and their echoes, sign-outs and closes
// over two threads and the sidebar), with the history read held, dropped and answered in any
// order, judged after every run by the run rules and by the chat server's own call log, never by
// the entry table: no step starts two history requests for one thread (R3, I6: an Ask joins a
// request that is current or wants one trailing request), except a step that leaves the thread
// (Clear on a Running entry releases the call and starts another).

const SEEDS = Array.from({ length: 40 }, (_, n) => n + 1);

const runs = SEEDS.map((seed) => ({
  seed,
  run: checked(generate(samples, { drawing: "usual", seed }).run),
}));

const leaves = (run: (typeof runs)[number]["run"]) =>
  new Set(
    run.steps.flatMap((step, n) =>
      Step.$is("send")(step) && step.event._tag === "Leave" ? [n] : [],
    ),
  );

const historyCalls = (run: (typeof runs)[number]["run"]) =>
  run.end.calls.filter((call) => call.endpoint === "history");

describe("the entry table over generated read sequences (Operations T1, T2; R3, I6)", () => {
  it("Operations R3, I6, T2: across 40 generated runs, no step starts two history requests for one thread unless it leaves that thread", () => {
    const breaches = runs.flatMap(({ seed, run }) => {
      const started = new Map<string, { readonly step: number; readonly count: number }>();

      for (const call of historyCalls(run)) {
        const key = `${String(call.input["thread"])} @${String(call.step)}`;
        started.set(key, { step: call.step, count: (started.get(key)?.count ?? 0) + 1 });
      }

      return [...started]
        .filter(([, { step, count }]) => count > 1 && !leaves(run).has(step))
        .map(
          ([key, { count }]) => `seed ${String(seed)}: ${key} started ${String(count)} requests`,
        );
    });

    expect(breaches).toEqual([]);
  });

  it("Operations T2 (the build-time choice on `again`): no request is started and then released in the step that leaves its thread", () => {
    const wasted = runs.flatMap(({ seed, run }) =>
      historyCalls(run)
        .filter((call) => call.status === "handled" && leaves(run).has(call.step))
        .map(
          (call) => `seed ${String(seed)}: ${String(call.input["thread"])} @${String(call.step)}`,
        ),
    );

    expect(wasted).toEqual([]);
  });

  it("Operations T2 (the build-time choice's case is reached): some runs leave a thread while its read runs and a read is still wanted, so the leave starts one", () => {
    // Clear on a Running entry starts a request only when one is wanted then (a trailing read or
    // a waiter): a history call started in a Leave step is that case, the one the check above
    // judges.
    const reached = runs.filter(({ run }) =>
      historyCalls(run).some((call) => leaves(run).has(call.step)),
    );

    expect(reached.length).toBeGreaterThan(0);
  });

  it("Operations T1 (Settled, Running behind): the generated runs reach a history answer that went behind and lands nothing", () => {
    // A history read is superseded either by a slot's newer lookup (a join or an open) or by its
    // own answer settling behind; only the second happens in a step that looks nothing up.
    const LOOKUPS = new Set(["Join", "Open"]);

    const behind = runs.filter(({ run }) => {
      let looksUp = false;

      return run.trace.events.some(({ record }) => {
        if (TraceRecord.$is("Step")(record))
          looksUp = Step.$is("send")(record.step) && LOOKUPS.has(record.step.event._tag);

        return (
          TraceRecord.$is("Runtime")(record) &&
          Predicate.isTagged(record.evidence, "Lane") &&
          record.evidence.kind === "Superseded" &&
          record.evidence.operation === "history" &&
          !looksUp
        );
      });
    });

    expect(behind.length).toBeGreaterThan(0);
  });
});
