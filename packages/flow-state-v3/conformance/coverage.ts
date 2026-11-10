import { Data } from "effect";
import type { Guarantee, InvariantId, Mutant } from "./dsl/oracle.ts";

/**
 * The core Specs the suite judges (Conformance R12), by the name each Invariant id starts with.
 */
export const CORE_SPECS = [
  "WriteLanes",
  "Turn",
  "Actors",
  "WriteAhead",
  "Restore",
  "Reads",
  "Compile",
  "Diagnostics",
  "Codec",
  "StaticCli",
] as const;

/**
 * A core Spec's name.
 */
export type CoreSpec = (typeof CORE_SPECS)[number];

/**
 * A Task of the V3 Epic, as the workflow CLI names it.
 */
export type TaskRef = `@task.V3.T${number}`;

/**
 * Invariants that have no check yet, the Task that owns them, and why.
 *
 * **Details**
 *
 * A row expires: once an oracle claims one of its Invariants with a mutant that expects it, the
 * gate fails until the Invariant leaves the row.
 */
export type NotYet = {
  readonly owner: TaskRef;
  readonly why: string;
  readonly invariants: ReadonlyArray<InvariantId>;
};

/**
 * An Invariant judged per case rather than by an oracle (Conformance R6's case expectations),
 * and the cases whose expectations cite it.
 *
 * **Details**
 *
 * It counts as checked only when a prototype mutant that expects it runs one of these cases;
 * falsify then proves that case goes red by a failed expectation citing it.
 */
export type CaseCovered = {
  readonly invariant: InvariantId;
  readonly cases: ReadonlyArray<string>;
};

/**
 * What the case-expectation checks rest on: the rows, the mutants they must catch, and every
 * case with what it cites.
 */
export type CaseChecks = {
  readonly rows: ReadonlyArray<CaseCovered>;
  readonly mutants: ReadonlyArray<Mutant>;
  readonly cases: ReadonlyArray<{ readonly id: string; readonly cites: ReadonlyArray<string> }>;
};

/**
 * The Invariants of one Spec, by number.
 */
export const invariantsOf = (spec: CoreSpec, numbers: ReadonlyArray<number>) =>
  numbers.map((n) => `${spec} I${n}` as const);

/**
 * Where one core Invariant stands: checked by an oracle with the mutants that expect it, or owed
 * by a Task.
 */
export type Standing = Data.TaggedEnum<{
  Checked: { invariant: InvariantId; oracle: string; mutants: ReadonlyArray<string> };
  CaseChecked: {
    invariant: InvariantId;
    cases: ReadonlyArray<string>;
    mutants: ReadonlyArray<string>;
  };
  Owed: { invariant: InvariantId; owner: TaskRef; why: string };
}>;

/**
 * Constructors and matchers for {@link Standing}.
 */
export const Standing = Data.taggedEnum<Standing>();

/**
 * What makes the coverage gate fail.
 *
 * **Details**
 *
 * - `Uncovered`: a Spec Invariant with no oracle and mutant, and no row.
 * - `Stale`: a row still lists an Invariant that is checked.
 * - `Unknown`: a row, an oracle's guarantee or a mutant names an Invariant no core Spec has.
 * - `Twice`: two "not yet" rows, or two case-covered rows, list the same Invariant.
 * - `Unproven`: a case-covered row whose cases no prototype mutant expecting its Invariant runs.
 * - `Uncited`: a case-covered row names a case that does not exist or does not cite its
 *   Invariant.
 */
export type Gap = Data.TaggedEnum<{
  Uncovered: { invariant: InvariantId };
  Stale: { invariant: InvariantId; owner: TaskRef };
  Unknown: { invariant: InvariantId; where: string };
  Twice: { invariant: InvariantId };
  Unproven: { invariant: InvariantId; cases: ReadonlyArray<string> };
  Uncited: { invariant: InvariantId; case: string };
}>;

/**
 * Constructors and matchers for {@link Gap}.
 */
export const Gap = Data.taggedEnum<Gap>();

type Judged = { readonly standing: ReadonlyArray<Standing>; readonly gaps: ReadonlyArray<Gap> };

const checkOf = (guarantees: ReadonlyArray<Guarantee>, invariant: InvariantId) =>
  guarantees.flatMap((g) => {
    if (!g.oracle.guarantee.includes(invariant)) return [];

    const mutants = g.mutants
      .filter((m) => m.runtime === "prototype" && m.expects === invariant)
      .map((m) => m.name);

    return mutants.length === 0 ? [] : [{ oracle: g.oracle.name, mutants }];
  });

const caseCheckOf = (checks: CaseChecks, invariant: InvariantId) =>
  checks.rows
    .filter((row) => row.invariant === invariant)
    .map((row) => ({
      cases: row.cases,
      mutants: checks.mutants
        .filter(
          (m) =>
            m.runtime === "prototype" &&
            m.expects === invariant &&
            m.cases.some((c) => row.cases.includes(c)),
        )
        .map((m) => m.name),
      uncited: row.cases.filter(
        (id) => !checks.cases.some((c) => c.id === id && c.cites.includes(invariant)),
      ),
    }));

const rowOf = (notYet: ReadonlyArray<NotYet>, invariant: InvariantId) =>
  notYet.filter((row) => row.invariants.includes(invariant));

const named = (
  guarantees: ReadonlyArray<Guarantee>,
  notYet: ReadonlyArray<NotYet>,
  checks: CaseChecks,
) => [
  ...notYet.flatMap((row) => row.invariants.map((invariant) => ({ invariant, where: row.owner }))),
  ...checks.rows.map((row) => ({ invariant: row.invariant, where: "case-covered rows" })),
  ...checks.mutants.map((m) => ({ invariant: m.expects, where: `mutant ${m.name}` })),
  ...guarantees.flatMap((g) => [
    ...g.oracle.guarantee.map((invariant) => ({ invariant, where: `oracle ${g.oracle.name}` })),
    ...g.mutants.map((m) => ({ invariant: m.expects, where: `mutant ${m.name}` })),
  ]),
];

/**
 * Every core Invariant's standing and every gap, from the Specs' Invariants, the registered
 * oracles with their mutants, and the "not yet" table.
 *
 * **When to use**
 *
 * The coverage gate (Conformance R12, I38) runs it before falsify; falsify then proves each
 * claimed mutant is caught by the Invariant it expects.
 *
 * **Details**
 *
 * An Invariant is checked when an oracle's guarantee names it and one of that oracle's prototype
 * mutants expects it, or when a case-covered row lists it, every case it names cites it, and a
 * prototype mutant that expects it runs one of those cases. Otherwise it must be in exactly one
 * "not yet" row. A row that lists a checked Invariant is stale, and any Invariant no core Spec
 * has is unknown.
 */
export const coverageOf = (
  invariants: ReadonlyArray<InvariantId>,
  guarantees: ReadonlyArray<Guarantee>,
  notYet: ReadonlyArray<NotYet>,
  checks: CaseChecks,
) => {
  const judged = invariants.map((invariant) => judgeOne(guarantees, notYet, checks, invariant));

  const unknown = named(guarantees, notYet, checks)
    .filter(({ invariant }) => !invariants.includes(invariant))
    .map(({ invariant, where }) => Gap.Unknown({ invariant, where }));

  return {
    standings: judged.flatMap((j) => j.standing),
    gaps: [...judged.flatMap((j) => j.gaps), ...unknown],
  };
};

// RETURN_TYPE: each branch builds one variant; without it the branches infer different arrays.
const judgeOne = (
  guarantees: ReadonlyArray<Guarantee>,
  notYet: ReadonlyArray<NotYet>,
  checks: CaseChecks,
  invariant: InvariantId,
): Judged => {
  const [check] = checkOf(guarantees, invariant);
  const caseRows = caseCheckOf(checks, invariant);
  const rows = rowOf(notYet, invariant);
  const twice = rows.length > 1 || caseRows.length > 1 ? [Gap.Twice({ invariant })] : [];
  const [row] = rows;
  const stale = row === undefined ? [] : [Gap.Stale({ invariant, owner: row.owner })];

  if (check !== undefined) {
    const standing = Standing.Checked({ invariant, ...check });

    return { standing: [standing], gaps: [...stale, ...twice] };
  }

  const [caseRow] = caseRows;

  if (caseRow !== undefined) {
    const uncited = caseRow.uncited.map((id) => Gap.Uncited({ invariant, case: id }));

    const unproven =
      caseRow.mutants.length === 0 ? [Gap.Unproven({ invariant, cases: caseRow.cases })] : [];

    const standing =
      uncited.length + unproven.length === 0
        ? [Standing.CaseChecked({ invariant, cases: caseRow.cases, mutants: caseRow.mutants })]
        : [];

    return { standing, gaps: [...uncited, ...unproven, ...stale, ...twice] };
  }

  if (row === undefined) return { standing: [], gaps: [Gap.Uncovered({ invariant })] };

  return {
    standing: [Standing.Owed({ invariant, owner: row.owner, why: row.why })],
    gaps: twice,
  };
};
