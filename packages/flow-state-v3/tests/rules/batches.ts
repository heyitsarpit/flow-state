import { Option } from "effect";
import type { Batch } from "../../src/host/testing/index.ts";
import { TraceRecord } from "../../src/host/trace.ts";
import type { Rule } from "./rules.ts";

const openOf = (b: Batch) => `${b.tab.name}:${b.tab.open}`;

// Whether batch b had landed by step s of tab open `open`: in an earlier open, or in the same
// open at or before s.
const landedBy = (b: Batch, open: number, s: number) =>
  b.status === "landed" &&
  (b.tab.open < open || Option.exists(b.answered, (answered) => answered <= s));

/**
 * WriteAhead I15, over what the fake store received: a persisted identity's Attempt is sent only
 * after a batch that acknowledges it has landed, in this open or an earlier one. A machine persists
 * when the store ever received an actor record of it (`actor/<machine>/<name>`, WriteAhead R3, R5).
 */
export const acknowledgedBeforeSent: Rule = {
  rule: "WriteAhead I15",
  breaches: (run) => {
    const batches = run.end.records.batches;
    const keys = batches.flatMap((b) => b.keys);
    const persists = (machine: string) => keys.some((k) => k.startsWith(`actor/${machine}/`));
    const owners = new Map<string, { readonly machine: string; readonly name: string }>();
    let step = 0;

    return run.trace.events.flatMap((e) => {
      const { record } = e;

      if (TraceRecord.$is("Step")(record)) step = record.index;

      if (!TraceRecord.$is("Runtime")(record)) return [];
      const { evidence } = record;

      if (evidence._tag === "Minted") owners.set(evidence.attempt, evidence.actor);

      if (evidence._tag !== "Sent") return [];
      const owner = owners.get(evidence.attempt);

      if (owner === undefined || !persists(owner.machine)) return [];

      return batches.some(
        (b) => b.acknowledges.includes(evidence.attempt) && landedBy(b, e.tab.open, step),
      )
        ? []
        : [
            `WriteAhead I15: ${owner.machine}/${owner.name}'s ${evidence.operation} ${evidence.attempt} was sent at step ${step} before a landed batch acknowledged it`,
          ];
    });
  },
};

/**
 * WriteAhead I23, over what the fake store received: one batch is out at a time, so in each tab
 * open a batch is issued only once the one before it has answered.
 */
export const oneBatchOut: Rule = {
  rule: "WriteAhead I23",
  breaches: (run) => {
    const last = new Map<string, Batch>();

    return run.end.records.batches.flatMap((b, n) => {
      const before = last.get(openOf(b));
      last.set(openOf(b), b);

      return before === undefined || Option.exists(before.answered, (at) => at <= b.step)
        ? []
        : [
            `WriteAhead I23: batch ${n} of tab ${openOf(b)} was issued at step ${b.step} while the batch before it was still out`,
          ];
    });
  },
};
