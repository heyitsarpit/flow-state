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

// Each open's landed batches, in trace order: each one's sequence and its keys without their kind.
type Landed = Map<number, Array<{ readonly sequence: number; readonly keys: Array<string> }>>;

const landedOf = (run: StoryRun) => {
  const landed: Landed = new Map();

  for (const e of run.trace.events)
    if (e.record._tag === "Write" && e.record.status === "landed") {
      const batches = landed.get(e.tab.open) ?? [];
      landed.set(e.tab.open, batches);
      batches.push({
        sequence: e.sequence,
        keys: e.record.keys.map((k) => k.split("/").slice(1).join("/")),
      });
    }

  return landed;
};

// Per run, read once: its landed batches, and the latest landed batch of an open carrying an
// actor's records.
const savedOf = new WeakMap<
  StoryRun,
  { readonly landed: Landed; readonly latest: Map<string, number> }
>();

const latestLanded = (run: StoryRun, open: number, actor: string) => {
  const saved = savedOf.get(run) ?? { landed: landedOf(run), latest: new Map<string, number>() };
  savedOf.set(run, saved);
  const key = `${open}|${actor}`;
  const found = saved.latest.get(key);

  if (found !== undefined) return found;

  const batches = saved.landed.get(open) ?? [];
  const latest = batches.findLast((b) => b.keys.some((k) => k.startsWith(actor)))?.sequence ?? -1;
  saved.latest.set(key, latest);

  return latest;
};

// Whether what the record at `at` changed for an actor was saved before its open ended: a batch of
// the same open, issued after it and carrying one of that actor's records, landed.
const savedAfter = (run: StoryRun, places: ReadonlyArray<Place>, at: number, actor: string) =>
  Option.exists(
    Option.fromUndefinedOr(places[at]),
    (place) => latestLanded(run, place.open, actor) > place.sequence,
  );

/**
 * Whether the record at `later` still knows what the record at `at` did for an actor: it comes from
 * the same open of the tab, or from a later open after that was saved. A crash forgets only what
 * was never saved (WriteAhead I21).
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
 * The Ended records made at a boot, which derives what the store owes (Records R16), or at their
 * actor's start (a return or an adoption): after that actor's Incarnated record within the same
 * step.
 */
export const atStart = (run: StoryRun) => {
  const steps = stepOfEvidence(run);
  const found = new Set<number>();
  const started = new Map<string, number>();

  for (const [at, e] of run.evidence.entries()) {
    const step = steps[at] ?? -1;

    if (e._tag === "Incarnated") started.set(nameOf(e.actor), step);

    if (
      e._tag === "Ended" &&
      (started.get(nameOf(e.actor)) === step || run.steps[step]?._tag === "reload")
    )
      found.add(at);
  }

  return found;
};
