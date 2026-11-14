import { Option } from "effect";
import type { TaskRef } from "./coverage.ts";
import { limits } from "./limits.ts";

/**
 * The cases round-14 no longer plays: its limits'.
 */
export const LIMITED: ReadonlySet<string> = new Set(limits.map((l) => l.case));

/**
 * Who owes a production mutant for a round-14 mutant or probe whose cases are all round-14 limits
 * (Conformance R22, I66): its intent moves to the runtime that ships. `uncaughtIn` is set when
 * the mutant keeps cases but only a limited case caught it: what the rest show.
 */
export type LimitedOwner = {
  readonly task: TaskRef;
  readonly why: string;
  readonly uncaughtIn: Option.Option<string>;
};

const owner = (task: TaskRef, why: string) => (names: ReadonlyArray<string>) =>
  names.map((name) => [name, { task, why, uncaughtIn: Option.none<string>() }] as const);

const ledger = owner(
  "@task.V3.T54",
  "the ledger, a start or the boot on production: its round-14 cases fail by the boot's parked restores",
);

const restore = owner(
  "@task.V3.T20",
  "a restore on production: its round-14 cases fail by the boot's parked restores",
);

const retry = owner(
  "@task.V3.T19",
  "a re-send's retry count on production: its round-14 cases fail by the boot's parked restores",
);

const lane = owner(
  "@task.V3.T18",
  "the write lane on production: its round-14 cases fail by the boot's parked restores",
);

/**
 * The owed production mutants, by the round-14 mutant or probe each replaces.
 */
export const limitedOwners: Readonly<Record<string, LimitedOwner>> = Object.fromEntries([
  ...ledger([
    "mutant.still-unknown-dropped",
    "mutant.success-without-answer",
    "mutant.unsent-ends-unknown",
    "a2.deliv-fail-samemail",
    "d154.moved-fail-released",
    "lie.released",
    "lie.parked-as-unparked",
    "mutant.release-drops-held",
    "id.dispose-drops-lanes",
    "mutant.disposal-hold-first",
    "mutant.disposal-rereads",
    "1b.forget-marks-held-lane",
    "k.drop-row",
    "mutant.boot-resends-held",
    "mutant.boot-replays-never-sent",
  ]),
  ...restore([
    "mutant.boot-skips-restored",
    "mutant.restore-skips-unsent",
    "mutant.restored-twice",
    "lie.boot-says-disposed",
    "lie.boot-drops-held",
    "mutant.boot-after-disposal-skips-restored",
    "turn.root-first-on-restored",
    "q1a.unchanged-resets",
  ]),
  ...retry(["lane.retry-count-frozen"]),
  ...lane([
    "lane.old-version-sends",
    "lane.cancel-wire-as-never-sent",
    "1b.cancel-all-queue-reversed",
    "1b.cancel-all-wire-held-at-once",
    "lie.release-on-guarded-read",
    "lie.release-other-lane",
    "lie.release-member-claimed",
  ]),
  [
    "audit-1.cancel-all-leaves-the-head",
    {
      task: "@task.V3.T18",
      why: "the write lane on production: only LANE-04, now a round-14 limit, caught it",
      uncaughtIn: Option.some("LANE-03, red only by lane-queue WriteLanes I12, another check"),
    },
  ],
]);

const decline = owner(
  "@task.V3.T18",
  "a decline's delivery on production: under the liar gate only LANE-15, now a round-14 limit, caught it",
);

const turnRoot = owner(
  "@task.V3.T17",
  "turn selection on production: under the liar gate only PAY-08/reload-while-reconciling, now a round-14 limit, caught it",
);

/**
 * The owed production mutants for round-14 mutants the liar gate leaves out: each keeps cases
 * falsify still plays, but its only catch that does not rest on its own reports was in a limited
 * case.
 */
export const liarLimitedOwners: Readonly<Record<string, LimitedOwner>> = Object.fromEntries([
  ...decline(["pay16.decline-not-delivered", "lost.decline.mail"]),
  ...turnRoot(["turn.root-first-no-part"]),
]);

/**
 * A mutant's cases that are not round-14 limits; none left means the mutant is limited.
 */
export const splitByLimits = (cases: ReadonlyArray<string>, limited: ReadonlySet<string>) =>
  cases.filter((c) => !limited.has(c));

/**
 * Whether round-14 leaves a mutant out: none of its cases is left, or an owed row says only a
 * limited case caught it.
 */
export const isLimited = (
  name: string,
  left: ReadonlyArray<string>,
  owners: Readonly<Record<string, LimitedOwner>>,
) => left.length === 0 || Option.isSome(owners[name]?.uncaughtIn ?? Option.none());

/**
 * The gate's faults: a limited mutant no production mutant is owed for, and an owed row whose
 * mutant is not limited (one marked `uncaughtIn` counts as limited).
 */
export const limitedFaults = (
  names: ReadonlyArray<string>,
  owners: Readonly<Record<string, LimitedOwner>>,
) => [
  ...names
    .filter((n) => owners[n] === undefined)
    .map(
      (n) => `BAD  ${n}: every case is a round-14 limit, and no production mutant is owed for it`,
    ),
  ...Object.entries(owners)
    .filter(([n, o]) => !names.includes(n) && Option.isNone(o.uncaughtIn))
    .map(([n]) => n)
    .map((n) => `BAD  ${n}: owed as a limited mutant, but some case of it is not a round-14 limit`),
];

/**
 * Falsify's line for a limited mutant: its name and the Task that owes its production mutant.
 */
export const limitedLine = (name: string) =>
  `LIMITED ${name}: owed as a production mutant to ${limitedOwners[name]?.task ?? "no one"}`;

type Cased = { readonly name: string; readonly cases: ReadonlyArray<string> };

/**
 * Falsify's split on round-14: each mutant and probe keeps only its cases that are not limits;
 * one left limited ({@link isLimited}) is listed by name, not played, and judged by
 * {@link limitedFaults} against {@link limitedOwners}.
 */
export const withoutLimits = <M extends { readonly mutant: Cased }, P extends Cased>(
  mutants: ReadonlyArray<M>,
  probes: ReadonlyArray<P>,
  sweep: Option.Option<ReadonlyArray<string>>,
) => {
  const cases = (own: ReadonlyArray<string>) =>
    splitByLimits(
      Option.getOrElse(sweep, () => own),
      LIMITED,
    );

  const trimmed = mutants.map((m) => ({
    ...m,
    mutant: { ...m.mutant, cases: cases(m.mutant.cases) },
  }));

  const trimmedProbes = probes.map((p) => ({ ...p, cases: cases(p.cases) }));
  const out = (c: Cased) => isLimited(c.name, c.cases, limitedOwners);
  const all = [...trimmed.map((m) => m.mutant), ...trimmedProbes];

  return {
    kept: trimmed.filter((m) => !out(m.mutant)),
    keptProbes: trimmedProbes.filter((p) => !out(p)),
    limitedNames: all.filter(out).map((c) => c.name),
    faults: limitedFaults(
      all.filter((c) => c.cases.length === 0).map((c) => c.name),
      limitedOwners,
    ),
  };
};

/**
 * The liar gate's split: on production every mutant plays; on round-14 a limit's cases leave
 * every mutant, as in falsify, and one {@link liarLimitedOwners} names is left out too. Each
 * limited one comes back as its line.
 */
export const liarChosen = <M extends Cased>(named: ReadonlyArray<M>, production: boolean) => {
  if (production) return { chosen: named, limitedNames: [] };

  const split = withoutLimits(
    named.map((mutant) => ({ mutant })),
    [],
    Option.none(),
  );

  const kept = split.kept.map(({ mutant }) => mutant);
  const liarOnly = kept.filter((m) => liarLimitedOwners[m.name] !== undefined);

  return {
    chosen: kept.filter((m) => liarLimitedOwners[m.name] === undefined),
    limitedNames: [
      ...split.limitedNames.map(limitedLine),
      ...liarOnly.map(
        (m) =>
          `LIMITED ${m.name}: under the liar gate; owed as a production mutant to ${liarLimitedOwners[m.name]?.task ?? "no one"}`,
      ),
    ],
  };
};
