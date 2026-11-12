import { Predicate } from "effect";
import { type Act, type Fate, type Outcome, type Rules, rules } from "../dsl/lifecycle-rules.ts";

/**
 * A cell's value at one guard: an outcome (Table A), an act (B) or a fate (C).
 */
export type CellValue = Outcome | Act | Fate;

type Guarded = Readonly<Record<string, CellValue>>;

type Grid = Readonly<Record<string, Readonly<Record<string, Guarded>>>>;

const TABLES = ["tableA", "tableB", "tableC"] as const;

const LETTER = { tableA: "A", tableB: "B", tableC: "C" } as const;

/**
 * One cell of the lifecycle tables at one guard value: its table, row, column and guard.
 */
export type CellAt = {
  readonly table: (typeof TABLES)[number];
  readonly row: string;
  readonly column: string;
  readonly guard: string;
};

/**
 * A cell's name, as the reports print it: `A Send·Unsent·open`.
 */
export const cellName = ({ table, row, column, guard }: CellAt) =>
  `${LETTER[table]} ${row}·${column}·${guard}`;

const gridOf = (given: Rules, table: CellAt["table"]) => {
  const grid: Grid = given[table];

  return grid;
};

/**
 * Every cell of Tables A, B and C at every guard value, in table order (Conformance R19, T39).
 *
 * **Gotchas**
 *
 * - The deadlines and the promotion rule are not cells; `dsl/lifecycle.test.ts` mutates them over
 *   the model's traces. The catalogue's Q9 grid (G) is not a table of `Rules` yet.
 */
export const cellsOf = (given: Rules = rules) =>
  TABLES.flatMap((table) =>
    Object.entries(gridOf(given, table)).flatMap(([row, columns]) =>
      Object.entries(columns).flatMap(([column, cell]) =>
        Object.keys(cell).map((guard) => ({ table, row, column, guard }) satisfies CellAt),
      ),
    ),
  );

const rebuilt = (given: Rules, each: (at: Omit<CellAt, "guard">, cell: Guarded) => Guarded) => {
  const tables = TABLES.map((table) => [
    table,
    Object.fromEntries(
      Object.entries(gridOf(given, table)).map(([row, columns]) => [
        row,
        Object.fromEntries(
          Object.entries(columns).map(([column, cell]) => [
            column,
            each({ table, row, column }, cell),
          ]),
        ),
      ]),
    ),
  ]);

  // SAFETY: every row, column and guard is copied from `given` with its value kept or replaced by
  // one of the same table's kind, so the result has `given`'s shape.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Object.fromEntries widens the tables' named keys to string
  return { ...given, ...Object.fromEntries(tables) } as Rules;
};

/**
 * The rules with every cell read logged by name, in the order the model reads them.
 *
 * **When to use**
 *
 * To record the cells one run reaches: pass the result to `playPart` and read `log` after.
 */
export const recording = (given: Rules, log: Array<string>) =>
  rebuilt(
    given,
    (at, cell) =>
      new Proxy(cell, {
        get: (target, guard) => {
          if (!Predicate.isString(guard)) return undefined;

          if (Object.hasOwn(target, guard)) log.push(cellName({ ...at, guard }));

          return target[guard];
        },
      }),
  );

/**
 * The rules with one cell's value replaced.
 */
export const replaced = (given: Rules, cell: CellAt, value: CellValue) =>
  rebuilt(given, (at, guarded) =>
    at.table === cell.table && at.row === cell.row && at.column === cell.column
      ? { ...guarded, [cell.guard]: value }
      : guarded,
  );

/**
 * A cell's value, when the cell exists.
 */
export const valueAt = (given: Rules, cell: CellAt) =>
  gridOf(given, cell.table)[cell.row]?.[cell.column]?.[cell.guard];

const headOf = (phase: string) => (phase === "Gone" ? "Idle" : phase);

/**
 * The subject a cell reads: an Attempt's phase (A), a lane's head (B) or an ending's life (C).
 */
const subjectOf = (cell: CellAt) => (cell.table === "tableB" ? cell.row : cell.column);

/**
 * The subject a cell leaves, by its own value: a move's or a life's target, the minted head of an
 * Idle lane, or the subject it read.
 */
const subjectAfter = (given: Rules, cell: CellAt) => {
  const value = valueAt(given, cell);

  if (cell.table === "tableB")
    return value?._tag === "Admit" && value.admit === "Mint" ? "Unsent" : cell.row;

  return value?._tag === "Move" || value?._tag === "Live" ? value.to._tag : cell.column;
};

const follows = (given: Rules, from: CellAt, to: CellAt) => {
  if ((from.table === "tableC") !== (to.table === "tableC")) return false;

  const after = subjectAfter(given, from);

  return subjectOf(to) === (to.table === "tableB" ? headOf(after) : after);
};

/**
 * The ordered cell pairs the model says can follow each other on one lane or one ending: a cell
 * of Table A or B, then a Table A cell at the phase it leaves the Attempt in or a Table B cell of
 * that head; a Table C cell, then a Table C cell at the life it leaves the ending in. Derived from
 * the tables, never listed by hand (catalogue 5A, "Cell-pair reach").
 */
export const successorPairs = (given: Rules = rules) => {
  const cells = cellsOf(given);

  return new Set(
    cells.flatMap((from) =>
      cells
        .filter((to) => follows(given, from, to))
        .map((to) => `${cellName(from)} > ${cellName(to)}`),
    ),
  );
};

/**
 * The successor pairs a run's cell reads reach: two reads in a row that the tables say can follow
 * each other.
 *
 * **Gotchas**
 *
 * - A read carries no lane or ending, so two reads in a row of different lanes count when their
 *   cells could follow on one: the count is an upper bound, reported and never gating (I58).
 */
export const pairsIn = (reads: ReadonlyArray<string>, pairs: ReadonlySet<string>) =>
  new Set(
    reads
      .slice(1)
      .map((to, i) => `${reads[i] ?? ""} > ${to}`)
      .filter((pair) => pairs.has(pair)),
  );

/**
 * The parts that reach nothing of their own: every cell, cell pair or noticed mutant in a part's
 * set is also in another part's (the brief's False pass: parts that differ in name but reach the
 * same cells).
 *
 * **When to use**
 *
 * Over each pilot part's reach across its scripts, with its items tagged by kind (`cell`, `pair`,
 * `kill`), so a part counts when it adds one item of any kind.
 */
export const undistinguished = (byPart: Readonly<Record<string, ReadonlySet<string>>>) =>
  Object.entries(byPart)
    .filter(([part, items]) =>
      [...items].every((item) =>
        Object.entries(byPart).some(([other, theirs]) => other !== part && theirs.has(item)),
      ),
    )
    .map(([part]) => part);
