import { Option } from "effect";

/**
 * How a Plan feature is checked: in a composite part, a hand case, a static case, an example-app
 * check or a package check (Conformance R17).
 */
export type Kind = "part" | "hand" | "static" | "app" | "package";

/**
 * Who owes a feature while no runtime under test builds it, or the rest of one built in part:
 * an open Task of a slice, and `rest`, what of a feature built in part that Task still owes.
 */
export type Owed = {
  readonly slice: number;
  readonly task: string;
  readonly rest: Option.Option<string>;
};

/**
 * One row of the feature matrix: a Plan feature, its fixture kind, the codes a part must reach to
 * exercise it, and its owner while it is not built in full.
 */
export type Feature = {
  readonly id: string;
  readonly kind: Kind;
  readonly codes: ReadonlyArray<string>;
  readonly owed: Option.Option<Owed>;
};

const SPECS = new Map([
  ["Cmp", "Compile"],
  ["Trn", "Turn"],
  ["Act", "Actors"],
  ["WL", "WriteLanes"],
  ["Rd", "Reads"],
  ["WA", "WriteAhead"],
  ["Rs", "Restore"],
  ["Dg", "Diagnostics"],
  ["Cd", "Codec"],
  ["SC", "StaticCli"],
]);

const rulesIn = (cell: string) => {
  const spec = { current: "" };

  return cell
    .replaceAll(/\([^)]*\)/gu, "")
    .split(/[,;]/u)
    .flatMap((part) => {
      const [, abbreviation, kind, from, to] =
        /^\s*(?:([A-Za-z]+)\s+)?([RIQ])(\d+)(?:-[RIQ](\d+))?\s*$/u.exec(part) ?? [];

      if (kind === undefined || from === undefined) return [];

      if (abbreviation !== undefined) spec.current = SPECS.get(abbreviation) ?? "";

      if (spec.current === "") return [];

      return Array.from(
        { length: Number(to ?? from) - Number(from) + 1 },
        (_, i) => `${spec.current} ${kind}${Number(from) + i}`,
      );
    });
};

/**
 * Each Plan feature's Spec rules, read from the coverage report's Checks column (`Cmp R1, I1` is
 * Compile R1 and Compile I1; a range expands; a Task in brackets, `none` and `slice` name none).
 */
export const checksOf = (table: string) =>
  Object.fromEntries(
    table.split("\n").flatMap((line) => {
      const cells = line.split("|").map((c) => c.trim());
      const id = cells[1] ?? "";

      return /^[A-Z]\d{2}$/u.test(id) ? [[id, rulesIn(cells[5] ?? "")] as const] : [];
    }),
  );

/**
 * Each Invariant of one Spec with the Requirements it derives from, read from the Spec's text
 * (`I12  ... [@R8, @R14]` gives `WriteLanes I12` its `WriteLanes R8` and `WriteLanes R14`).
 */
export const derivedFrom = (spec: string, text: string) =>
  new Map(
    text.split(/\n(?=\s{4}I\d+\s)/u).flatMap((block) => {
      const id = /^\s{4}(I\d+)\s/u.exec(block)?.[1];
      const refs = /\[(@R\d+(?:,\s*@R\d+)*)\]/u.exec(block.split(/\n\s*\n/u)[0] ?? "")?.[1];

      return id === undefined || refs === undefined
        ? []
        : [[`${spec} ${id}`, refs.split(",").map((r) => `${spec} ${r.trim().slice(1)}`)] as const];
    }),
  );

/**
 * Each feature's rules widened by the Requirements its Invariants derive from, so a case citing a
 * Requirement reaches the features whose Invariants state it.
 */
export const widened = (
  checks: Readonly<Record<string, ReadonlyArray<string>>>,
  derived: ReadonlyMap<string, ReadonlyArray<string>>,
) =>
  Object.fromEntries(
    Object.entries(checks).map(([feature, rules]) => [
      feature,
      [...new Set([...rules, ...rules.flatMap((r) => derived.get(r) ?? [])])],
    ]),
  );

/**
 * The cases that reach each feature: those citing one of its Spec rules (Conformance R5: a case
 * cites the rules its checks come from).
 */
export const casesReaching = (
  checks: Readonly<Record<string, ReadonlyArray<string>>>,
  cases: ReadonlyArray<{ readonly id: string; readonly cites: ReadonlyArray<string> }>,
) =>
  Object.fromEntries(
    Object.entries(checks).map(([feature, rules]) => [
      feature,
      cases.filter((c) => c.cites.some((r) => rules.includes(r))).map((c) => c.id),
    ]),
  );

/**
 * The rows whose owner's slice comes before a slice that builds one of their codes: reported for
 * the user's read, never gating (the owners follow the replan; a code's slice is the catalogue's).
 */
export const lateCodes = (
  features: ReadonlyArray<Feature>,
  sliceOf: Readonly<Record<string, number>>,
) =>
  features.flatMap((f) =>
    Option.match(f.owed, {
      onNone: () => [],
      onSome: ({ slice, task }) => {
        const late = f.codes.filter((c) => (sliceOf[c] ?? 0) > slice);

        return late.length === 0
          ? []
          : [`${f.id}: owed by ${task} in slice ${slice}, but its codes ${late.join(", ")} land in a later slice`];
      },
    }),
  );

/**
 * What the matrix gate reads.
 *
 * **Details**
 *
 * - `ids`: the Plan features' ids, read from their source table.
 * - `declared`: codes the runtimes under test declare; `reached`: codes the reach recorder saw.
 * - `claimed`: codes the parts' commands claim; `reaching`: by feature, the hand and the static
 *   cases that reach it and run on a runtime or static surface under test.
 * - `sliceOf`: the slice that builds each code; `current`: the slice being built. A part may claim
 *   a code a later slice builds (its operation is filtered until then).
 */
export type MatrixInput = {
  readonly features: ReadonlyArray<Feature>;
  readonly ids: ReadonlyArray<string>;
  readonly declared: ReadonlyArray<string>;
  readonly reached: ReadonlySet<string>;
  readonly claimed: ReadonlyArray<string>;
  readonly reaching: {
    readonly hand: Readonly<Record<string, ReadonlyArray<string>>>;
    readonly static: Readonly<Record<string, ReadonlyArray<string>>>;
  };
  readonly tasks: Readonly<Record<string, { readonly open: boolean; readonly slice: number }>>;
  readonly sliceOf: Readonly<Record<string, number>>;
  readonly current: number;
};

const ownedFault = (input: MatrixInput, { slice, task }: Owed) => {
  const record = input.tasks[task];

  if (record === undefined || !record.open) return `owed to ${task}, which is not open`;

  return record.slice === slice
    ? undefined
    : `owed by slice ${slice}, but ${task} is slice ${record.slice}'s`;
};

const builtFor = (input: MatrixInput, feature: Feature) => {
  if (feature.kind === "part")
    return feature.codes.length > 0 && feature.codes.every((c) => input.declared.includes(c));

  if (feature.kind === "hand" || feature.kind === "static")
    return (input.reaching[feature.kind][feature.id] ?? []).length > 0;

  return false;
};

const ownerFault = (input: MatrixInput, feature: Feature, isBuilt: boolean) =>
  Option.match(feature.owed, {
    onNone: () => (isBuilt ? undefined : `${feature.kind} row not built and owed by no slice`),
    onSome: (o) => {
      if (isBuilt && Option.isNone(o.rest)) return "built, yet marked owed";

      if (!isBuilt && Option.isSome(o.rest)) return "built in part, yet nothing of it is built";

      return ownedFault(input, o);
    },
  });

const rowFault = (input: MatrixInput, feature: Feature) => {
  if (feature.kind === "part" && feature.codes.length === 0) return "a part row names no codes";

  const isBuilt = builtFor(input, feature);
  const fault = ownerFault(input, feature, isBuilt);

  if (fault !== undefined || !isBuilt) return fault;

  const unreached = feature.codes.filter((c) => !input.reached.has(c));

  return unreached.length === 0 ? undefined : `codes no fixture reached: ${unreached.join(" ")}`;
};

const claimFault = (input: MatrixInput, code: string) => {
  if (input.declared.includes(code)) return undefined;

  const slice = input.sliceOf[code];

  return slice !== undefined && slice > input.current
    ? undefined
    : `${code}: claimed by a part, declared by no runtime under test and built by no later slice`;
};

/**
 * The matrix gate's failures (Conformance R17); none means it passes.
 *
 * **Details**
 *
 * - The rows are exactly the Plan features' ids: a row missing or added fails.
 * - A part row is built when every code it names is declared by a runtime under test; a hand or
 *   static row when a case of its kind that reaches it runs on one; example-app and package rows are owed
 *   until their checks exist. A built row needs every code reached and no owner, unless it is
 *   built in part; an unbuilt one an owner: an open Task of the slice it names.
 * - Every declared code is reached by some fixture, and a part claims only declared codes or codes
 *   a later slice builds.
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
    ...input.claimed.flatMap((c) => Option.toArray(Option.fromUndefinedOr(claimFault(input, c)))),
  ];
};
