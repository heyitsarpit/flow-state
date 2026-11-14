import { Equal } from "effect";
import type { InvariantId } from "./facts.ts";
import { due } from "./lifecycle.ts";
import { apply } from "./lifecycle-fold.ts";
import type { Model } from "./lifecycle-model.ts";
import { type Rules, rules } from "./lifecycle-rules.ts";
import { Check, type Trace } from "./lifecycle-trace.ts";

/**
 * A lifecycle trace's steps folded from its start under `given`: the model it ends at and each
 * step's refusals by Invariant.
 */
export const runTrace = (trace: Trace, given: Rules = rules) =>
  trace.steps.reduce<{ model: Model; refusals: ReadonlyArray<ReadonlyArray<InvariantId>> }>(
    ({ model, refusals }, step) => {
      const [next, found] = "due" in step ? due(model, step.due, given) : apply(model, step, given);

      return { model: next, refusals: [...refusals, found.map((r) => r.invariant)] };
    },
    { model: trace.start, refusals: [] },
  );

/**
 * Whether a trace holds under `given`: its refusals, final phases, obligation count, marked lanes
 * and every check it states, exactly.
 */
export const holds = (trace: Trace, given: Rules = rules) => {
  const { model, refusals } = runTrace(trace, given);
  const phases = Object.fromEntries(model.attempts.map((a) => [a.id, a.phase]));

  const same = <A>(got: ReadonlyArray<A>, want: ReadonlyArray<A>) =>
    got.length === want.length && got.every((value, i) => Equal.equals(value, want[i]));

  const marked = trace.checks.find(Check.$is("Marked"))?.count ?? trace.start.releasing.length;

  return (
    Equal.equals(refusals, trace.refusals) &&
    Object.keys(phases).length === Object.keys(trace.phases).length &&
    Object.entries(trace.phases).every(([id, phase]) => Equal.equals(phases[id], phase)) &&
    model.obligations.length === trace.owed &&
    model.releasing.length === marked &&
    trace.checks.every((check) =>
      Check.$match(check, {
        Owing: ({ obligations }) => same(model.obligations, obligations),
        Lives: ({ lives }) =>
          same(
            model.endings.map((e) => e.life),
            lives,
          ),
        Marked: () => true,
      }),
    )
  );
};
