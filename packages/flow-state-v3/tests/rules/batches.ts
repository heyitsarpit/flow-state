import { Option, Predicate } from "effect";
import type { Batch } from "../../src/host/testing/index.ts";
import type { Rule } from "./rules.ts";

const openOf = (b: Batch) => `${b.tab.name}:${b.tab.open}`;

// Whether batch b had landed by step s of tab open `open`: in an earlier open, or in the same
// open at or before s.
const landedBy = (b: Batch, open: number, s: number) =>
  b.status === "landed" &&
  (b.tab.open < open || Option.exists(b.answered, (answered) => answered <= s));

/**
 * WriteAhead I15, over what the fake servers and the fake store received: a request that names a
 * persisted identity's Attempt in any field (its idempotency key) arrives only after a batch that
 * acknowledges that Attempt has landed, in this open or an earlier one. A machine persists when the
 * store ever received an actor record of it (`actor/<machine>/<name>`, WriteAhead R3, R5).
 */
export const acknowledgedBeforeSent: Rule = {
  rule: "WriteAhead I15",
  breaches: (run) => {
    const batches = run.end.records.batches;
    const keys = batches.flatMap((b) => b.keys);
    const persists = (machine: string) => keys.some((k) => k.startsWith(`actor/${machine}/`));

    const owners = new Map(
      run.evidence.flatMap((e) => (e._tag === "Minted" ? [[e.attempt, e.actor] as const] : [])),
    );

    return run.end.calls.flatMap((c) =>
      Object.values(c.input).flatMap((value) => {
        const owner = Predicate.isString(value) ? owners.get(value) : undefined;

        if (owner === undefined || !Predicate.isString(value) || !persists(owner.machine))
          return [];

        return batches.some(
          (b) => b.acknowledges.includes(value) && landedBy(b, c.tab.open, c.step),
        )
          ? []
          : [
              `WriteAhead I15: ${c.server}.${c.endpoint} received ${owner.machine}/${owner.name}'s Attempt ${value} at step ${c.step} before a landed batch acknowledged it`,
            ];
      }),
    );
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
