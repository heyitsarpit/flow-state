import { Option } from "effect";

/**
 * How a Plan feature is checked: in a composite part, a hand case, a static case, an example-app
 * check or a package check (Conformance R17).
 */
export type Kind = "part" | "hand" | "static" | "app" | "package";

/**
 * One row of the feature matrix: a Plan feature, its fixture kind, the codes or cases that reach
 * it, and the slice and Task that owe it while no runtime under test implements it.
 */
export type Feature = {
  readonly id: string;
  readonly kind: Kind;
  readonly codes: ReadonlyArray<string>;
  readonly cases: ReadonlyArray<string>;
  readonly owed: Option.Option<{ readonly slice: number; readonly task: string }>;
};

const built = (id: string, codes: ReadonlyArray<string>) => ({
  id,
  kind: "part" as const,
  codes,
  cases: [],
  owed: Option.none(),
});

const owed = (id: string, kind: Kind, slice: number, task: string) => ({
  id,
  kind,
  codes: [],
  cases: [],
  owed: Option.some({ slice, task }),
});

/**
 * Every Plan feature's row, by the ids of the Plan coverage report
 * (`workflow/plans/flow/references/proposals/plan-task-coverage-2026-11-11.md`).
 *
 * **Details**
 *
 * - A built row names the codes a part must reach; every other row is owed by the Task that
 *   builds it in production, with that Task's slice (the replan's slice table, 0 for slice R; 11
 *   for work after slice 10: the React bindings and the package checks).
 * - A row a done Task names but did not finish (`P34`, `P35`, `P51`: the other policies and
 *   members) is owed by @task.V3.T18; absorbed Tasks are named by the Task that absorbed them.
 * - A row gains its codes or cases, and loses its owner, in the slice that builds it.
 */
export const FEATURES: ReadonlyArray<Feature> = [
  owed("M01", "static", 3, "@task.V3.T17"),
  owed("M02", "static", 3, "@task.V3.T17"),
  owed("M03", "static", 3, "@task.V3.T17"),
  owed("M04", "static", 3, "@task.V3.T17"),
  owed("M05", "part", 3, "@task.V3.T17"),
  owed("M06", "static", 3, "@task.V3.T17"),
  owed("M07", "static", 3, "@task.V3.T17"),
  owed("M08", "static", 3, "@task.V3.T17"),
  owed("M09", "static", 3, "@task.V3.T17"),
  owed("M10", "part", 3, "@task.V3.T17"),
  owed("M11", "static", 3, "@task.V3.T17"),
  owed("M12", "static", 3, "@task.V3.T17"),
  owed("M13", "part", 3, "@task.V3.T17"),
  owed("M14", "static", 3, "@task.V3.T17"),
  owed("M15", "static", 3, "@task.V3.T17"),
  owed("M16", "static", 3, "@task.V3.T17"),
  owed("M17", "static", 3, "@task.V3.T17"),
  owed("M18", "static", 3, "@task.V3.T17"),
  owed("M19", "static", 3, "@task.V3.T17"),
  owed("M20", "static", 3, "@task.V3.T17"),
  owed("M21", "static", 3, "@task.V3.T17"),
  owed("M22", "part", 3, "@task.V3.T17"),
  owed("M23", "static", 5, "@task.V3.T21"),
  owed("M24", "static", 5, "@task.V3.T21"),
  owed("M25", "part", 5, "@task.V3.T21"),
  owed("M26", "part", 5, "@task.V3.T21"),
  owed("M27", "static", 5, "@task.V3.T21"),
  owed("M28", "static", 5, "@task.V3.T21"),
  owed("M29", "static", 5, "@task.V3.T21"),
  owed("M30", "part", 5, "@task.V3.T21"),
  owed("M31", "static", 5, "@task.V3.T21"),
  owed("M32", "static", 5, "@task.V3.T21"),
  owed("M33", "static", 5, "@task.V3.T21"),
  owed("M34", "part", 5, "@task.V3.T21"),
  owed("M35", "static", 3, "@task.V3.T17"),
  owed("M36", "static", 3, "@task.V3.T17"),
  owed("M37", "static", 3, "@task.V3.T17"),
  owed("M38", "part", 6, "@task.V3.T22"),
  owed("M39", "static", 3, "@task.V3.T17"),
  owed("M40", "static", 3, "@task.V3.T17"),
  owed("M41", "static", 3, "@task.V3.T17"),
  owed("M42", "part", 1, "@task.V3.T18"),
  owed("M43", "part", 1, "@task.V3.T18"),
  owed("M44", "part", 3, "@task.V3.T17"),
  owed("M45", "part", 1, "@task.V3.T18"),
  owed("M46", "part", 1, "@task.V3.T18"),
  owed("M47", "part", 1, "@task.V3.T18"),
  owed("M48", "part", 1, "@task.V3.T18"),
  owed("M49", "part", 5, "@task.V3.T21"),
  owed("M50", "part", 1, "@task.V3.T18"),
  owed("M51", "part", 1, "@task.V3.T18"),
  owed("M52", "part", 1, "@task.V3.T18"),
  owed("M53", "part", 1, "@task.V3.T18"),
  built("M54", ["du"]),
  owed("M55", "part", 1, "@task.V3.T18"),
  owed("M56", "part", 1, "@task.V3.T18"),
  owed("M57", "part", 1, "@task.V3.T18"),
  owed("M58", "part", 1, "@task.V3.T18"),
  owed("M59", "part", 1, "@task.V3.T18"),
  owed("M60", "part", 1, "@task.V3.T18"),
  owed("M61", "part", 1, "@task.V3.T18"),
  owed("M62", "part", 1, "@task.V3.T18"),
  owed("M63", "part", 1, "@task.V3.T18"),
  owed("M64", "part", 5, "@task.V3.T21"),
  owed("M65", "part", 5, "@task.V3.T21"),
  owed("M66", "part", 5, "@task.V3.T21"),
  owed("M67", "part", 5, "@task.V3.T21"),
  owed("M68", "part", 1, "@task.V3.T18"),
  owed("M69", "part", 1, "@task.V3.T18"),
  owed("M70", "part", 1, "@task.V3.T18"),
  owed("M71", "part", 1, "@task.V3.T18"),
  owed("M72", "part", 1, "@task.V3.T18"),
  owed("M73", "part", 1, "@task.V3.T18"),
  owed("M74", "part", 1, "@task.V3.T18"),
  owed("R01", "static", 3, "@task.V3.T17"),
  owed("R02", "static", 3, "@task.V3.T17"),
  owed("R03", "static", 3, "@task.V3.T17"),
  owed("R04", "static", 3, "@task.V3.T17"),
  owed("R05", "static", 3, "@task.V3.T17"),
  owed("R06", "part", 1, "@task.V3.T18"),
  owed("R07", "part", 5, "@task.V3.T21"),
  owed("R08", "part", 1, "@task.V3.T18"),
  owed("R09", "part", 1, "@task.V3.T18"),
  owed("R10", "part", 1, "@task.V3.T18"),
  owed("R11", "part", 1, "@task.V3.T18"),
  owed("R12", "part", 3, "@task.V3.T17"),
  owed("R13", "part", 1, "@task.V3.T18"),
  owed("R14", "part", 1, "@task.V3.T18"),
  owed("R15", "part", 1, "@task.V3.T18"),
  owed("R16", "part", 1, "@task.V3.T18"),
  owed("R17", "part", 1, "@task.V3.T18"),
  owed("R18", "part", 1, "@task.V3.T18"),
  owed("R19", "part", 1, "@task.V3.T18"),
  owed("R20", "part", 1, "@task.V3.T18"),
  owed("R21", "part", 1, "@task.V3.T18"),
  owed("R22", "part", 1, "@task.V3.T18"),
  owed("R23", "part", 2, "@task.V3.T20"),
  owed("R24", "part", 1, "@task.V3.T18"),
  owed("R25", "part", 1, "@task.V3.T18"),
  owed("R26", "part", 1, "@task.V3.T18"),
  owed("R27", "part", 1, "@task.V3.T18"),
  owed("R28", "part", 1, "@task.V3.T18"),
  owed("R29", "part", 1, "@task.V3.T18"),
  owed("R30", "part", 1, "@task.V3.T18"),
  owed("R31", "part", 1, "@task.V3.T18"),
  owed("R32", "part", 1, "@task.V3.T18"),
  owed("R33", "part", 1, "@task.V3.T18"),
  owed("R34", "part", 1, "@task.V3.T18"),
  owed("P01", "part", 5, "@task.V3.T21"),
  built("P02", ["rj"]),
  owed("P03", "part", 5, "@task.V3.T21"),
  owed("P04", "part", 5, "@task.V3.T21"),
  owed("P05", "part", 8, "@task.V3.T24"),
  owed("P06", "part", 5, "@task.V3.T21"),
  owed("P07", "part", 7, "@task.V3.T25"),
  owed("P08", "part", 3, "@task.V3.T17"),
  owed("P09", "part", 5, "@task.V3.T21"),
  owed("P10", "part", 5, "@task.V3.T21"),
  owed("P11", "part", 3, "@task.V3.T17"),
  owed("P12", "part", 5, "@task.V3.T21"),
  owed("P13", "part", 5, "@task.V3.T21"),
  owed("P14", "part", 5, "@task.V3.T21"),
  owed("P15", "part", 5, "@task.V3.T21"),
  owed("P16", "part", 5, "@task.V3.T21"),
  owed("P17", "part", 6, "@task.V3.T22"),
  owed("P18", "part", 5, "@task.V3.T21"),
  owed("P19", "part", 5, "@task.V3.T21"),
  owed("P20", "part", 5, "@task.V3.T21"),
  owed("P21", "part", 5, "@task.V3.T21"),
  owed("P22", "part", 5, "@task.V3.T21"),
  owed("P23", "part", 5, "@task.V3.T21"),
  owed("P24", "part", 5, "@task.V3.T21"),
  owed("P25", "part", 5, "@task.V3.T21"),
  owed("P26", "part", 5, "@task.V3.T21"),
  owed("P27", "part", 8, "@task.V3.T24"),
  owed("P28", "part", 5, "@task.V3.T21"),
  built("P29", ["rj", "un"]),
  owed("P30", "part", 5, "@task.V3.T21"),
  owed("P31", "part", 5, "@task.V3.T21"),
  built("P32", ["un"]),
  owed("P33", "part", 1, "@task.V3.T18"),
  owed("P34", "part", 1, "@task.V3.T18"),
  owed("P35", "part", 1, "@task.V3.T18"),
  built("P36", ["rt"]),
  owed("P37", "part", 1, "@task.V3.T18"),
  owed("P38", "part", 1, "@task.V3.T18"),
  owed("P39", "part", 6, "@task.V3.T22"),
  owed("P40", "part", 8, "@task.V3.T24"),
  owed("P41", "part", 7, "@task.V3.T25"),
  owed("P42", "part", 7, "@task.V3.T25"),
  owed("P43", "part", 7, "@task.V3.T25"),
  owed("P44", "part", 5, "@task.V3.T21"),
  owed("P45", "part", 5, "@task.V3.T21"),
  owed("P46", "part", 5, "@task.V3.T21"),
  owed("P47", "part", 5, "@task.V3.T21"),
  owed("P48", "part", 5, "@task.V3.T21"),
  owed("P49", "part", 5, "@task.V3.T21"),
  owed("P50", "part", 5, "@task.V3.T21"),
  owed("P51", "part", 1, "@task.V3.T18"),
  owed("Q01", "part", 2, "@task.V3.T19"),
  owed("Q02", "part", 2, "@task.V3.T19"),
  owed("Q03", "part", 9, "@task.V3.T28"),
  owed("Q04", "part", 2, "@task.V3.T19"),
  owed("Q05", "part", 2, "@task.V3.T19"),
  owed("Q06", "part", 2, "@task.V3.T19"),
  owed("Q07", "part", 2, "@task.V3.T19"),
  owed("Q08", "part", 2, "@task.V3.T19"),
  owed("Q09", "part", 2, "@task.V3.T19"),
  owed("Q10", "part", 2, "@task.V3.T19"),
  owed("Q11", "part", 9, "@task.V3.T28"),
  owed("Q12", "part", 2, "@task.V3.T20"),
  owed("Q13", "part", 2, "@task.V3.T20"),
  owed("Q14", "part", 2, "@task.V3.T20"),
  owed("Q15", "part", 2, "@task.V3.T20"),
  owed("Q16", "part", 2, "@task.V3.T20"),
  owed("Q17", "part", 2, "@task.V3.T20"),
  owed("Q18", "part", 2, "@task.V3.T20"),
  owed("Q19", "part", 2, "@task.V3.T20"),
  owed("Q20", "part", 2, "@task.V3.T20"),
  built("Q21", ["wa", "sr"]),
  owed("Q22", "part", 2, "@task.V3.T19"),
  owed("Q23", "part", 9, "@task.V3.T27"),
  owed("E01", "part", 8, "@task.V3.T24"),
  owed("E02", "part", 8, "@task.V3.T24"),
  owed("E03", "part", 8, "@task.V3.T24"),
  owed("E04", "part", 8, "@task.V3.T24"),
  owed("E05", "part", 8, "@task.V3.T24"),
  owed("E06", "part", 8, "@task.V3.T24"),
  owed("E07", "part", 8, "@task.V3.T24"),
  owed("E08", "part", 8, "@task.V3.T24"),
  owed("E09", "part", 8, "@task.V3.T24"),
  owed("E10", "part", 8, "@task.V3.T24"),
  owed("E11", "part", 10, "@task.V3.T29"),
  owed("E12", "part", 8, "@task.V3.T24"),
  owed("E13", "part", 8, "@task.V3.T24"),
  owed("F01", "app", 11, "@task.V3.T30"),
  owed("F02", "app", 11, "@task.V3.T30"),
  owed("F03", "app", 11, "@task.V3.T30"),
  owed("F04", "app", 11, "@task.V3.T30"),
  owed("F05", "app", 11, "@task.V3.T30"),
  owed("F06", "app", 11, "@task.V3.T50"),
  owed("H01", "app", 11, "@task.V3.T30"),
  owed("H02", "app", 11, "@task.V3.T30"),
  owed("H03", "app", 11, "@task.V3.T30"),
  owed("H04", "app", 11, "@task.V3.T30"),
  owed("H05", "app", 11, "@task.V3.T30"),
  owed("H06", "app", 11, "@task.V3.T30"),
  owed("H07", "app", 11, "@task.V3.T30"),
  owed("L01", "part", 9, "@task.V3.T48"),
  owed("L02", "part", 9, "@task.V3.T48"),
  owed("L03", "part", 1, "@task.V3.T18"),
  owed("L04", "part", 9, "@task.V3.T48"),
  owed("L05", "part", 9, "@task.V3.T48"),
  owed("L06", "part", 10, "@task.V3.T29"),
  owed("L07", "part", 9, "@task.V3.T48"),
  owed("I01", "part", 10, "@task.V3.T49"),
  owed("I02", "part", 10, "@task.V3.T49"),
  owed("I03", "part", 2, "@task.V3.T20"),
  owed("I04", "part", 10, "@task.V3.T49"),
  owed("I05", "part", 10, "@task.V3.T49"),
  owed("I06", "part", 10, "@task.V3.T49"),
  owed("I07", "part", 10, "@task.V3.T49"),
  owed("I08", "part", 10, "@task.V3.T49"),
  owed("I09", "part", 7, "@task.V3.T25"),
  owed("D01", "static", 3, "@task.V3.T17"),
  owed("D02", "static", 3, "@task.V3.T17"),
  owed("D03", "static", 3, "@task.V3.T17"),
  owed("D04", "static", 3, "@task.V3.T17"),
  owed("D05", "static", 3, "@task.V3.T17"),
  owed("D06", "static", 3, "@task.V3.T17"),
  owed("C01", "static", 6, "@task.V3.T22"),
  owed("C02", "static", 6, "@task.V3.T22"),
  owed("C03", "static", 6, "@task.V3.T22"),
  owed("C04", "static", 10, "@task.V3.T31"),
  owed("C05", "static", 10, "@task.V3.T29"),
  owed("C06", "static", 10, "@task.V3.T29"),
  owed("C07", "static", 6, "@task.V3.T22"),
  owed("C08", "static", 10, "@task.V3.T29"),
  owed("C09", "static", 6, "@task.V3.T22"),
  owed("C10", "static", 10, "@task.V3.T31"),
  owed("C11", "static", 10, "@task.V3.T29"),
  owed("C12", "static", 6, "@task.V3.T22"),
  owed("C13", "static", 6, "@task.V3.T22"),
  owed("C14", "static", 6, "@task.V3.T22"),
  owed("C15", "static", 6, "@task.V3.T22"),
  owed("T01", "static", 10, "@task.V3.T29"),
  owed("T02", "static", 10, "@task.V3.T29"),
  owed("T03", "static", 10, "@task.V3.T29"),
  owed("T04", "static", 10, "@task.V3.T29"),
  owed("T05", "static", 10, "@task.V3.T29"),
  owed("T06", "static", 10, "@task.V3.T29"),
  owed("T07", "static", 10, "@task.V3.T29"),
  owed("T08", "static", 10, "@task.V3.T29"),
  owed("T09", "static", 10, "@task.V3.T29"),
  owed("K01", "package", 11, "@task.V3.T50"),
  owed("K02", "package", 11, "@task.V3.T50"),
  owed("K03", "package", 11, "@task.V3.T50"),
  owed("K04", "package", 11, "@task.V3.T50"),
  owed("K05", "package", 11, "@task.V3.T50"),
  owed("K06", "package", 11, "@task.V3.T50"),
  owed("K07", "package", 11, "@task.V3.T50"),
  owed("K08", "package", 11, "@task.V3.T50"),
  owed("K09", "package", 11, "@task.V3.T50"),
  owed("K10", "package", 11, "@task.V3.T50"),
  owed("K11", "package", 11, "@task.V3.T50"),
];

/**
 * What the matrix gate reads.
 *
 * **Details**
 *
 * - `ids`: the Plan features' ids, read from their source table.
 * - `declared`: codes the runtimes under test declare; `reached`: codes the reach recorder saw.
 * - `claimed`: codes the parts' commands claim; `cases`: case ids that run on a runtime under test.
 */
export type MatrixInput = {
  readonly features: ReadonlyArray<Feature>;
  readonly ids: ReadonlyArray<string>;
  readonly declared: ReadonlyArray<string>;
  readonly reached: ReadonlySet<string>;
  readonly claimed: ReadonlyArray<string>;
  readonly cases: ReadonlySet<string>;
  readonly tasks: Readonly<Record<string, { readonly open: boolean; readonly slice: number }>>;
};

const ownedFault = (input: MatrixInput, feature: Feature) =>
  Option.match(feature.owed, {
    onNone: () => undefined,
    onSome: ({ slice, task }) => {
      const record = input.tasks[task];

      if (record === undefined || !record.open) return `owed to ${task}, which is not open`;

      return record.slice === slice
        ? undefined
        : `owed by slice ${slice}, but ${task} is slice ${record.slice}'s`;
    },
  });

const builtFor = (input: MatrixInput, feature: Feature) => {
  if (feature.kind === "part")
    return feature.codes.length > 0 && feature.codes.every((c) => input.declared.includes(c));

  if (feature.kind === "hand" || feature.kind === "static")
    return feature.cases.length > 0 && feature.cases.every((c) => input.cases.has(c));

  return false;
};

const rowFault = (input: MatrixInput, feature: Feature) => {
  const isBuilt = builtFor(input, feature);

  if (Option.isSome(feature.owed))
    return isBuilt ? "built, yet marked owed" : ownedFault(input, feature);

  if (!isBuilt) return `${feature.kind} row not built and owed by no slice`;

  const unreached = feature.codes.filter((c) => !input.reached.has(c));

  return unreached.length === 0 ? undefined : `codes no fixture reached: ${unreached.join(" ")}`;
};

/**
 * The matrix gate's failures (Conformance R17); none means it passes.
 *
 * **Details**
 *
 * - The rows are exactly the Plan features' ids: a row missing or added fails.
 * - A row is built when every code it names is declared by a runtime under test (a part row) or
 *   every case it names runs on one (a hand or static row); example-app and package rows are owed
 *   until their checks exist. A built row needs every code reached; an unbuilt one an owner: an
 *   open Task of the slice it names.
 * - Every declared code is reached by some fixture, and no part claims an undeclared code.
 */
export const matrixGate = (input: MatrixInput) => {
  const rows = new Set(input.features.map((f) => f.id));
  const ids = new Set(input.ids);

  return [
    ...input.ids.filter((id) => !rows.has(id)).map((id) => `${id}: no matrix row`),
    ...[...rows].filter((id) => !ids.has(id)).map((id) => `${id}: a row for no Plan feature`),
    ...input.features.flatMap((f) => {
      const fault = rowFault(input, f);

      return fault === undefined ? [] : [`${f.id}: ${fault}`];
    }),
    ...input.declared
      .filter((c) => !input.reached.has(c))
      .map((c) => `${c}: declared, reached by no fixture`),
    ...input.claimed
      .filter((c) => !input.declared.includes(c))
      .map((c) => `${c}: claimed by a part, declared by no runtime under test`),
  ];
};
