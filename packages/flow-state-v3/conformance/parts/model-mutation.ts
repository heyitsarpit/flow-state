import { Option, Predicate } from "effect";
import { mixed, parts } from "../../fixtures/index.ts";
import { implemented as production } from "../adapters/production.ts";
import type { Owes, TaskRef } from "../coverage.ts";
import type { InvariantId } from "../dsl/facts.ts";
import {
  Act,
  type Deadline,
  Fate,
  Outcome,
  type Promotion,
  type Rules,
  rules,
} from "../dsl/lifecycle-rules.ts";
import type { Script } from "../dsl/script.ts";
import type { CaseVerdict } from "../runner/verdict.ts";
import {
  type CellAt,
  cellName,
  cellsOf,
  type CellValue,
  recording,
  replaced,
  valueAt,
} from "./cells.ts";
import { forgeries, type Forgery } from "./adversary.ts";
import { mixOf, scriptOf } from "./generate.ts";
import { playPart } from "./play.ts";

/**
 * One mutation of a Spec model field: the field's path in the rules, the oracles whose refusal
 * noticed it (`none` when nothing did), and whether a pilot part's trace noticed it (Conformance
 * R19, I61, T39).
 */
export type ModelMutant = {
  readonly field: string;
  readonly oracle: string;
  readonly noticed: boolean;
};

/**
 * The oracles that refused a verdict, when one did. A thrown defect, a case's own expectation and
 * a timeout name no oracle, and are never a kill; what the refusal's text says is not read, since
 * a mutant writes that text itself.
 */
export const killedBy = (verdict: CaseVerdict) =>
  verdict._tag === "Fail" && verdict.oracles.length > 0
    ? Option.some(verdict.oracles.join(","))
    : Option.none<string>();

// FLOW_STATE_ALLOW_UNKNOWN: the rules are walked generically, so a new field is found, not listed.
const isLeaf = (node: unknown) =>
  !Predicate.isObject(node) ||
  Predicate.hasProperty(node, "_tag") ||
  Predicate.hasProperty(node, "by");

// RETURN_TYPE: recursive.
const leaves = (
  // FLOW_STATE_ALLOW_UNKNOWN: walked generically, so a new field is found, not listed.
  node: unknown,
  path: ReadonlyArray<string>,
): ReadonlyArray<string> =>
  isLeaf(node) || !Predicate.isObject(node)
    ? [path.join(".")]
    : Object.entries(node).flatMap(([key, child]) => leaves(child, [...path, key]));

/**
 * Every field of the model's rules, walked from the value itself rather than listed: each table
 * cell at each guard, each deadline and the promotion rule, by path (`tableA.Send.Unsent.open`).
 */
export const modelFields = (given: Rules = rules) => leaves(given, []);

const refusalAt = (given: Rules, cell: CellAt) => {
  const value = valueAt(given, cell);

  return value?._tag === "Refuse" || value?._tag === "Quiet" ? [value.invariant] : [];
};

const FALLBACK: InvariantId = "WriteLanes I15";

const rowRefusal = (given: Rules, cell: CellAt) => {
  const named = cellsOf(given)
    .filter((other) => other.table === cell.table && other.row === cell.row)
    .flatMap((other) => refusalAt(given, other));

  const [most] = [...Map.groupBy(named, (n) => n)].toSorted((a, b) => b[1].length - a[1].length);

  return most?.[0] ?? FALLBACK;
};

/**
 * The one mutant of a cell: a refusal is allowed (Stay); a move or a life leaves its subject where
 * it is (Stay); a cell that leaves it refuses with its row's commonest Invariant; Table B's acts
 * become `Stay`, and its `Stay` marks the lane for release.
 */
export const mutantOf = (given: Rules, cell: CellAt) => {
  const stays = valueAt(given, cell)?._tag === "Stay";
  const invariant = rowRefusal(given, cell);

  const mutants = {
    tableA: () => (stays ? Outcome.Refuse({ invariant }) : Outcome.Stay()),
    tableB: () => (stays ? Act.Mark() : Act.Stay()),
    tableC: () => (stays ? Fate.Refuse({ invariant }) : Fate.Stay()),
  };

  const mutant: CellValue = mutants[cell.table]();

  return mutant;
};

// FLOW_STATE_ALLOW_UNKNOWN: a node of the rules rebuilt generically; withField restores the type.
type Rebuilt = Readonly<Record<PropertyKey, unknown>>;

// RETURN_TYPE: recursive.
const setAt = (
  // FLOW_STATE_ALLOW_UNKNOWN: any path, rebuilt generically; withField restores the type.
  node: unknown,
  path: ReadonlyArray<string>,
  value: Deadline | Promotion,
): Rebuilt | Deadline | Promotion => {
  const [key, ...rest] = path;

  if (key === undefined || !Predicate.isObject(node)) return value;

  return { ...node, [key]: setAt(node[key], rest, value) };
};

const withField = (given: Rules, path: ReadonlyArray<string>, value: Deadline | Promotion) => {
  // SAFETY: `value` has the kind of the leaf it replaces (a deadline or a promotion rule), so the
  // copy keeps `given`'s shape.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- setAt rebuilds the path generically
  const mutated = setAt(given, path, value) as Rules;

  return mutated;
};

const cellOf = (path: ReadonlyArray<string>) => {
  const [table, row, column, guard] = path;

  return table === "tableA" || table === "tableB" || table === "tableC"
    ? Option.some({
        table,
        row: row ?? "",
        column: column ?? "",
        guard: guard ?? "",
      } satisfies CellAt)
    : Option.none();
};

const otherDeadline = (deadline: Deadline) =>
  ({ ...deadline, by: deadline.by === "never" ? "StepEnds" : "never" }) satisfies Deadline;

const otherPromotion = (promotion: Promotion) =>
  promotion === "never" ? ("firstFree" as const) : ("never" as const);

/**
 * The one mutant of a model field, with the cell it reads when it is a table cell: a cell as
 * {@link mutantOf}; a deadline falls due at another instant (`never` when it was due, else at the
 * step's end); the promotion rule promotes nothing (or `firstFree` when it was `never`). None for
 * a field of any other kind: the field gate fails it.
 */
export const fieldMutant = (given: Rules, field: string) => {
  const path = field.split(".");
  const [head] = path;
  const cell = cellOf(path);

  if (Option.isSome(cell))
    return Option.some({
      reads: Option.some(cellName(cell.value)),
      rules: replaced(given, cell.value, mutantOf(given, cell.value)),
    });

  if (head === "deadlines") {
    // FLOW_STATE_ALLOW_UNKNOWN: the deadline at a walked path is read generically, then narrowed.
    const deadline = path
      .slice(1)
      .reduce<unknown>(
        (node, key) => (Predicate.isObject(node) ? node[key] : undefined),
        given.deadlines,
      );

    return Predicate.hasProperty(deadline, "by") && Predicate.hasProperty(deadline, "invariant")
      ? Option.some({
          reads: Option.none<string>(),
          // SAFETY: a leaf of `deadlines` with `by` and `invariant` is a Deadline.
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the walk reads it untyped
          rules: withField(given, path, otherDeadline(deadline as Deadline)),
        })
      : Option.none();
  }

  return head === "promotion"
    ? Option.some({
        reads: Option.none<string>(),
        rules: withField(given, path, otherPromotion(given.promotion)),
      })
    : Option.none();
};

/**
 * The pilots' scripts the mutants are judged against: each part's usual and stress scripts and
 * the stress app mix, at the first seed, on production. One that fails on the design's rules
 * (production's owed reds among them) judges no mutant ({@link modelMutants}).
 */
export const pilots = () => [
  ...parts.flatMap((part) =>
    (["usual", "stress"] as const).map((profile) => scriptOf(part, profile, 1, production)),
  ),
  mixOf(mixed, "stress", 1, production),
];

const recorded = (scripts: ReadonlyArray<Script>, given: Rules) =>
  scripts.map((script) => {
    const log: Array<string> = [];
    const played = playPart(script, "production", recording(given, log), []);

    return { script, passed: played.verdict._tag === "Pass", reads: new Set(log) };
  });

/**
 * Each model field mutated in turn and judged against the pilots' recorded production runs
 * (Conformance R19, I61, T39).
 *
 * **Details**
 *
 * - A pilot that fails on the design's rules is left out: its red is production's or the suite's.
 * - A cell no passing pilot reads cannot change a verdict, so it is listed unnoticed unrun; the
 *   rest, and every field that is not a cell, are replayed on the pilots until one refuses.
 * - A kill is an oracle's refusal ({@link killedBy}), never a throw; the oracle is recorded.
 * - A refusal cell no correct run reads is judged on the adversary's forgery that reaches it
 *   (`forgeries`): noticed when the forgery, replayed under the mutant, no longer refuses by the
 *   cell's Invariant at its step.
 * - A field with no mutant is left out here; {@link fieldGate} fails it.
 */
/**
 * A mutant noticed by the adversary: the forgery that reaches the cell it reads, replayed under
 * the mutant, no longer refuses by the cell's Invariant at the forged step; the kill names the
 * oracles that refused under the design.
 */
const forgedKill = (
  forged: ReadonlyMap<string, Forgery>,
  mutant: { readonly reads: Option.Option<string>; readonly rules: Rules },
) =>
  Option.flatMap(
    Option.flatMap(mutant.reads, (cell) => Option.fromUndefinedOr(forged.get(cell))),
    (f) => {
      const under = playPart(f.script, "production", mutant.rules, [], Option.some(f.replay));

      const refused = under.violations.some(
        (v) => v.invariant === f.invariant && v.step === f.step,
      );

      return refused ? Option.none<string>() : killedBy(f.design);
    },
  );

export const modelMutants = (scripts: ReadonlyArray<Script> = pilots(), given: Rules = rules) => {
  const runs = recorded(scripts, given).filter((r) => r.passed);
  const forged = forgeries(scripts);

  return modelFields(given).flatMap((field) =>
    Option.match(fieldMutant(given, field), {
      onNone: () => [],
      onSome: (mutant) => {
        const kill = runs
          .filter((r) =>
            Option.match(mutant.reads, { onNone: () => true, onSome: (c) => r.reads.has(c) }),
          )
          .reduce<Option.Option<string>>(
            (found, r) =>
              Option.isSome(found)
                ? found
                : killedBy(playPart(r.script, "production", mutant.rules, []).verdict),
            Option.none(),
          )
          .pipe(Option.orElse(() => forgedKill(forged, mutant)));

        return [
          {
            field,
            oracle: Option.getOrElse(kill, () => "none"),
            noticed: Option.isSome(kill),
          } satisfies ModelMutant,
        ];
      },
    }),
  );
};

/**
 * The model-mutation gate's faults (Conformance I61, T39): a model field no mutant reaches; a
 * field no part's trace notices that no owed row names; and an owed row on a noticed field, on no
 * field of the model, or of a Task not in `open` (the routed-gap rule: a gap is owed to an open
 * Task, and a Task cannot close while a row names it).
 */
export const fieldGate = (
  mutants: ReadonlyArray<ModelMutant>,
  given: Rules = rules,
  owes: ReadonlyArray<Owes> = [],
  open: ReadonlySet<TaskRef> = new Set(),
) => {
  const fields = modelFields(given);
  const reached = new Set(mutants.map((m) => m.field));
  const noticed = new Set(mutants.filter((m) => m.noticed).map((m) => m.field));
  const owed = new Set(owes.map((o) => o.subject));

  return [
    ...fields
      .filter((field) => !reached.has(field))
      .map((field) => `BAD  model field ${field}: no mutation reaches it`),
    ...fields
      .filter((field) => reached.has(field) && !noticed.has(field) && !owed.has(field))
      .map(
        (field) => `BAD  model field ${field}: no part's expected trace changes under its mutation`,
      ),
    ...owes
      .filter((o) => noticed.has(o.subject))
      .map(
        (o) => `BAD  model field ${o.subject}: owed to ${o.task}, but a part's trace notices it`,
      ),
    ...owes
      .filter((o) => !fields.includes(o.subject))
      .map((o) => `BAD  owed row ${o.subject}: no such model field`),
    ...owes
      .filter((o) => !open.has(o.task))
      .map((o) => `BAD  model field ${o.subject}: owed to ${o.task}, a Task not open`),
    ...[...new Set(owes.map((o) => o.subject))]
      .filter((s) => owes.filter((o) => o.subject === s).length > 1)
      .map((s) => `BAD  model field ${s}: owed by a doubled row`),
  ];
};
