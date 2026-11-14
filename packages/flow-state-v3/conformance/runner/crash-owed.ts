import { Option } from "effect";
import { excuses, OwedItem, type PartOwed, RETRY_COUNT } from "../parts/owed.ts";
import type { CaseVerdict } from "./verdict.ts";

/**
 * Production's owed crash reds (T61): a crash point (`<case>@<step>`) it fails by a production
 * bug a Task owns, by its check, Invariant and exact Attempts (the one owed rule, Conformance
 * R22). Each item must still break there, and its owner must be open.
 */
export const crashOwed: ReadonlyArray<PartOwed> = [
  {
    case: "PAY-22@16",
    check: "lane-queue",
    invariant: "WriteLanes I12",
    why: `after the third re-send the boot restores retryCount 2, so the restored unknown's handler retries a spent retryable({ times: 3 }) where the model gives up: ${RETRY_COUNT}`,
    owner: "@task.V3.T19",
    items: [OwedItem.Attempt({ id: "att-000000000000000000000000000003e8-2" })],
  },
  ...(["WriteLanes I16", "WriteLanes I15"] as const).map((invariant) => ({
    case: "PAY-22@16",
    check: "delivered-once",
    invariant,
    why: `the head the model released when the spent retryable({ times: 3 }) cancelled is restored at the reload, and its ending delivered: ${RETRY_COUNT}`,
    owner: "@task.V3.T19",
    items: [OwedItem.Attempt({ id: "att-000000000000000000000000000003e8-2" })],
  })),
  {
    case: "PAY-16/dispose-waiting-resend@9",
    check: "selection",
    invariant: "Turn I2",
    why: "the disposal reports Done with a capture still out and no final write issued, so a kill then restores the leaf before the last turn (Actors R23, I44; the same bug as PAY-15/final-write-refused)",
    owner: "@task.V3.T55",
    items: [OwedItem.Item({ subject: "Checkout/Pay shopper-1", step: 10 })],
  },
];

/**
 * A violation an owed crash row excused: its point, check, Invariant and subject.
 */
export type CrashHit = {
  readonly point: string;
  readonly check: string;
  readonly invariant: string;
  readonly subject: string;
};

/**
 * One case under the crash generator: how many points it played, the red ones, and every
 * violation an owed row excused.
 */
export type CrashRun = {
  readonly id: string;
  readonly points: number;
  readonly red: ReadonlyArray<CaseVerdict>;
  readonly hits: ReadonlyArray<CrashHit>;
};

/**
 * The excuse a crash point plays under: true for a violation an owed row of that point names by
 * its exact subject, which `hit` records.
 */
export const crashExcuse =
  (point: string, owed: ReadonlyArray<PartOwed>, hit: (h: CrashHit) => void) =>
  (check: string, invariant: string, subject: Option.Option<string>, step: number) =>
    Option.exists(subject, (s) => {
      const owes = owed.some(
        (o) =>
          o.case === point && o.check === check && o.invariant === invariant && excuses(o, s, step),
      );

      if (owes) hit({ point, check, invariant, subject: s });

      return owes;
    });

const labelOf = (item: OwedItem) =>
  OwedItem.$match(item, { Attempt: ({ id }) => id, Item: ({ subject }) => subject });

/**
 * The crash gate's faults: each red point no row owes, each owed item that no longer breaks, each
 * row whose owner is not an open Task, and each row naming a case that no longer exists (`cases`,
 * every case id), played or not.
 */
export const crashFaults = (
  runs: ReadonlyArray<CrashRun>,
  owed: ReadonlyArray<PartOwed>,
  open: ReadonlySet<string>,
  cases: ReadonlySet<string>,
) => {
  const hits = runs.flatMap((r) => r.hits);
  const played = new Set(runs.map((r) => r.id));

  const stale = owed
    .filter((o) => played.has(o.case.split("@")[0] ?? ""))
    .flatMap((o) =>
      o.items
        .filter(
          (i) =>
            !hits.some(
              (h) =>
                h.point === o.case &&
                h.check === o.check &&
                h.invariant === o.invariant &&
                labelOf(i) === h.subject,
            ),
        )
        .map(
          (i) =>
            `BAD  ${o.case} ${o.check} ${o.invariant} ${labelOf(i)}: owed to ${o.owner}, but it no longer breaks`,
        ),
    );

  const closed = owed
    .filter((o) => !open.has(o.owner))
    .map(
      (o) =>
        `BAD  ${o.case} ${o.check} ${o.invariant}: owed to ${o.owner}, which is not an open Task`,
    );

  const red = runs
    .flatMap((r) => r.red)
    .map((v) => `BAD  ${v.id}: no row owes this red point: ${v._tag === "Fail" ? v.why : v._tag}`);

  const ghosts = owed
    .filter((o) => !cases.has(o.case.split("@")[0] ?? ""))
    .map((o) => `BAD  ${o.case}: owed to ${o.owner}, but there is no such case`);

  return [...red, ...stale, ...closed, ...ghosts];
};

/**
 * The crash gate's counts: points played, red points, and owed points no red point shares, so a
 * point that is both counts once, as red.
 */
export const crashCounts = (runs: ReadonlyArray<CrashRun>) => {
  const red = new Set(runs.flatMap((r) => r.red.map((v) => v.id)));
  const owed = new Set(runs.flatMap((r) => r.hits.map((h) => h.point)).filter((p) => !red.has(p)));

  return { points: runs.reduce((n, r) => n + r.points, 0), red: red.size, owed: owed.size };
};
