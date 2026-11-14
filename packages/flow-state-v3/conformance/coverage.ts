import { Data, Option } from "effect";
import { citedBy, type Guarantee, type Mutant } from "./dsl/oracle.ts";
import type { InvariantId } from "./dsl/facts.ts";

/**
 * Core Spec rules that were retired and whose ids are never reused: WriteLanes R15 (`cancelAll`)
 * and its Invariant I21. Round-14's frozen cases and the model's CancelAll column still judge
 * them, citing them in their retired form (`Retired WriteLanes I21`); coverage counts neither.
 */
export const RETIRED_RULES: ReadonlyArray<string> = ["WriteLanes I21", "WriteLanes R15"];

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
 * A Task of the V3 Epic, as the wk CLI names it.
 */
export type TaskRef = `@task.V3.T${number}`;

/**
 * Whether a Task with this status may still own an owed row: one done or in review may not, so a
 * Task cannot close, or ask to, while a row names it.
 */
export const ownsRows = (status: string) => status !== "done" && status !== "review";

/**
 * What a Task owes the suite (consult A3): a `subject`, which is a core Invariant, a Plan feature
 * or a Spec model field, the `clause` of it still owed (`None`: all of it), the Task and why.
 *
 * **Details**
 *
 * A row expires when its check lands, and a Task cannot close while a row names it.
 */
export type Owes = {
  readonly subject: string;
  readonly clause: Option.Option<string>;
  readonly task: TaskRef;
  readonly why: string;
};

/**
 * Everything the coverage gate judges: the Specs' Invariants, the registered oracles, the rows
 * of what is owed, the case-expectation checks, and the owning Tasks still open.
 *
 * **Details**
 *
 * `open` holds each Task the wk CLI resolves with a status other than done; a row owned by
 * any other Task is a gap.
 */
export type CoverageInput = {
  readonly invariants: ReadonlyArray<InvariantId>;
  readonly guarantees: ReadonlyArray<Guarantee>;
  readonly owes: ReadonlyArray<Owes>;
  readonly checks: CaseChecks;
  readonly open: ReadonlySet<TaskRef>;
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
 * The case-covered rows of some cases, derived from what each cites: one row per cited Invariant,
 * with every case citing it.
 */
export const coveredBy = (
  cases: ReadonlyArray<{ readonly id: string; readonly cites: ReadonlyArray<string> }>,
) => {
  const invariants = [...new Set(cases.flatMap((c) => c.cites.flatMap(citedBy)))];

  return invariants.map((invariant) => ({
    invariant,
    cases: cases.filter((c) => c.cites.flatMap(citedBy).includes(invariant)).map((c) => c.id),
  }));
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
 * Where one core Invariant stands: checked by an oracle with the mutants that expect it, checked
 * by case expectations, checked in part with the rest owed by a Task, or owed whole by a Task.
 */
export type Standing = Data.TaggedEnum<{
  Checked: { invariant: InvariantId; oracle: string; mutants: ReadonlyArray<string> };
  CaseChecked: {
    invariant: InvariantId;
    cases: ReadonlyArray<string>;
    mutants: ReadonlyArray<string>;
  };
  Partial: { invariant: InvariantId; checkedBy: string; owner: TaskRef; owed: string };
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
 * - `Twice`: two "not yet" rows, two case-covered rows or two remainder rows list the same
 *   Invariant.
 * - `Unproven`: a case-covered row whose cases no prototype mutant expecting its Invariant runs.
 * - `Uncited`: a case-covered row names a case that does not exist or does not cite its
 *   Invariant.
 * - `Unchecked`: a remainder row names an Invariant with no standing check (none, or one with
 *   its own gaps).
 * - `Unowned`: a row's owner is not an open Task (unresolved, or done).
 */
export type Gap = Data.TaggedEnum<{
  Uncovered: { invariant: InvariantId };
  Stale: { invariant: InvariantId; owner: TaskRef };
  Unknown: { invariant: InvariantId; where: string };
  Twice: { invariant: InvariantId };
  Unproven: { invariant: InvariantId; cases: ReadonlyArray<string> };
  Uncited: { invariant: InvariantId; case: string };
  Unchecked: { invariant: InvariantId; owner: TaskRef };
  Unowned: { invariant: InvariantId; owner: TaskRef };
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

const rowOf = (owes: ReadonlyArray<Owes>, invariant: InvariantId) =>
  owes.filter((row) => row.subject === invariant && Option.isNone(row.clause));

/**
 * Whether an owed row's subject is a core Invariant (`Turn I12`); any other subject is a Plan
 * feature id, which the matrix gate judges.
 */
// RETURN_TYPE: a type predicate, so an owed subject narrows to an Invariant id.
export const isInvariant = (subject: string): subject is InvariantId => /^\S+ I\d+$/u.test(subject);

const owners = (input: CoverageInput) =>
  input.owes.flatMap((row) =>
    isInvariant(row.subject) ? [{ invariant: row.subject, owner: row.task }] : [],
  );

const named = (input: CoverageInput) => [
  ...owners(input).map(({ invariant, owner }) => ({ invariant, where: owner })),
  ...input.checks.rows.map((row) => ({ invariant: row.invariant, where: "case-covered rows" })),
  ...input.checks.mutants.map((m) => ({ invariant: m.expects, where: `mutant ${m.name}` })),
  ...input.guarantees.flatMap((g) => [
    ...g.oracle.guarantee.map((invariant) => ({ invariant, where: `oracle ${g.oracle.name}` })),
    ...g.mutants.map((m) => ({ invariant: m.expects, where: `mutant ${m.name}` })),
  ]),
];

/**
 * Every core Invariant's standing and every gap, from the Specs' Invariants, the registered
 * oracles with their mutants, the case-expectation checks and the rows of what is owed.
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
 * prototype mutant that expects it runs one of those cases. A checked Invariant with a remainder
 * row is checked in part. Otherwise it must be in exactly one "not yet" row. A "not yet" row that
 * lists a checked Invariant is stale, a remainder row on an unchecked one is unchecked, a row
 * whose owner is not an open Task is unowned, and any Invariant no core Spec has is unknown.
 */
export const coverageOf = (input: CoverageInput) => {
  const judged = input.invariants
    .filter((invariant) => !RETIRED_RULES.includes(invariant))
    .map((invariant) => judgeOne(input, invariant));

  const unknown = named(input)
    .filter(
      ({ invariant }) => !input.invariants.includes(invariant) && !invariant.startsWith("Retired "),
    )
    .map(({ invariant, where }) => Gap.Unknown({ invariant, where }));

  const unowned = owners(input)
    .filter(({ owner }) => !input.open.has(owner))
    .map(({ invariant, owner }) => Gap.Unowned({ invariant, owner }));

  return {
    standings: judged.flatMap((j) => j.standing),
    gaps: [...judged.flatMap((j) => j.gaps), ...unknown, ...unowned],
  };
};

const checkedBy = (standing: Standing) =>
  Standing.$match(standing, {
    Checked: ({ oracle }) => `oracle ${oracle}`,
    CaseChecked: ({ cases }) => `cases ${cases.join(", ")}`,
    Partial: ({ checkedBy: by }) => by,
    Owed: () => "",
  });

// RETURN_TYPE: each branch builds one variant; without it the branches infer different arrays.
const withRemainder = (
  judged: Judged,
  invariant: InvariantId,
  clauses: ReadonlyArray<Owes>,
): Judged => {
  const [part, ...more] = clauses;
  const [standing] = judged.standing;

  if (part === undefined) return judged;

  const twice = more.length > 0 ? [Gap.Twice({ invariant })] : [];

  if (standing === undefined || Standing.$is("Owed")(standing))
    return {
      standing: judged.standing,
      gaps: [...judged.gaps, ...twice, Gap.Unchecked({ invariant, owner: part.task })],
    };

  return {
    standing: [
      Standing.Partial({
        invariant,
        checkedBy: checkedBy(standing),
        owner: part.task,
        owed: Option.getOrElse(part.clause, () => ""),
      }),
    ],
    gaps: [...judged.gaps, ...twice],
  };
};

const judgeOne = (input: CoverageInput, invariant: InvariantId) =>
  withRemainder(
    judgeWhole(input, invariant),
    invariant,
    input.owes.filter((row) => row.subject === invariant && Option.isSome(row.clause)),
  );

// RETURN_TYPE: each branch builds one variant; without it the branches infer different arrays.
const judgeWhole = (
  { guarantees, owes, checks }: CoverageInput,
  invariant: InvariantId,
): Judged => {
  const [check] = checkOf(guarantees, invariant);
  const caseRows = caseCheckOf(checks, invariant);
  const rows = rowOf(owes, invariant);
  const twice = rows.length > 1 || caseRows.length > 1 ? [Gap.Twice({ invariant })] : [];
  const [row] = rows;
  const stale = row === undefined ? [] : [Gap.Stale({ invariant, owner: row.task })];

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
    standing: [Standing.Owed({ invariant, owner: row.task, why: row.why })],
    gaps: twice,
  };
};
