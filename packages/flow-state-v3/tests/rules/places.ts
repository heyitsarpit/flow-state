import { Option } from "effect";
import type { StoryRun } from "../../src/host/testing/index.ts";
import { nameOf } from "./deliveries.ts";

/**
 * Where an evidence record sits in a run's trace: its tab's open and its sequence.
 */
export type Place = { readonly open: number; readonly sequence: number };

/**
 * Each evidence record's place, in evidence order.
 */
export const placesOf = (run: StoryRun) =>
  run.trace.events.flatMap((e) =>
    e.record._tag === "Runtime" ? [{ open: e.tab.open, sequence: e.sequence }] : [],
  );

// Whether what the record at `at` changed for an actor was saved before its open ended: a batch of
// the same open, issued after it and carrying one of that actor's records, landed.
const savedAfter = (run: StoryRun, places: ReadonlyArray<Place>, at: number, actor: string) =>
  Option.exists(Option.fromUndefinedOr(places[at]), (place) =>
    run.trace.events.some(
      (e) =>
        e.sequence > place.sequence &&
        e.tab.open === place.open &&
        e.record._tag === "Write" &&
        e.record.status === "landed" &&
        e.record.keys.some((k) => k.split("/").slice(1).join("/").startsWith(actor)),
    ),
  );

/**
 * Whether the record at `later` still knows what the record at `at` did for an actor: it comes from
 * the same open of the tab, or from a later open after that was saved. A crash forgets only what
 * was never saved (WriteAhead R14).
 */
export const knownAt = (
  run: StoryRun,
  places: ReadonlyArray<Place>,
  at: number,
  later: number,
  actor: string,
) => places[at]?.open === places[later]?.open || savedAfter(run, places, at, actor);

const stepOfEvidence = (run: StoryRun) => {
  const steps: Array<number> = [];
  let step = -1;

  for (const e of run.trace.events) {
    if (e.record._tag === "Step") step = e.record.index;

    if (e.record._tag === "Runtime") steps.push(step);
  }

  return steps;
};

/**
 * The Ended records made at their actor's start (a boot, a return or an adoption): after that
 * actor's Incarnated record within the same step.
 */
export const atStart = (run: StoryRun) => {
  const steps = stepOfEvidence(run);
  const found = new Set<number>();
  const started = new Map<string, number>();

  for (const [at, e] of run.evidence.entries()) {
    const step = steps[at] ?? -1;

    if (e._tag === "Incarnated") started.set(nameOf(e.actor), step);

    if (e._tag === "Ended" && started.get(nameOf(e.actor)) === step) found.add(at);
  }

  return found;
};
