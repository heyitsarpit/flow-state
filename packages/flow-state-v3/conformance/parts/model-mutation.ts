import { Option } from "effect";
import { parts } from "../../fixtures/index.ts";
import { implemented as production } from "../adapters/production.ts";
import type { InvariantId } from "../dsl/facts.ts";
import { Act, Fate, Outcome, type Rules, rules } from "../dsl/lifecycle-rules.ts";
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
import { mixOf, scriptOf } from "./generate.ts";
import { partsOwed, playPart } from "./play.ts";

/**
 * One mutation of a Spec model table cell: the cell, the Invariant the refusal that noticed it
 * names (`none` when nothing did), and whether a pilot part's trace noticed it (Conformance R19,
 * I61, T39).
 */
export type CellMutant = {
  readonly cell: string;
  readonly invariant: string;
  readonly noticed: boolean;
};

const INVARIANT = /\b([A-Z][A-Za-z]+ I\d+):/u;

/**
 * The Invariant a verdict's refusal names, when an oracle refused. A thrown defect, a case's own
 * expectation and a timeout name no oracle, and are never a kill.
 */
export const killedBy = (verdict: CaseVerdict) =>
  verdict._tag === "Fail" && verdict.oracles.length > 0
    ? Option.fromNullishOr(INVARIANT.exec(verdict.why)?.[1])
    : Option.none<string>();

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

/**
 * The pilots' scripts the mutants are judged against: each part's usual and stress scripts and
 * the stress app mix, at the first seed, on production; production's owed reds are left out.
 */
export const pilots = () =>
  [
    ...parts.flatMap((part) =>
      (["usual", "stress"] as const).map((profile) => scriptOf(part, profile, 1, production)),
    ),
    mixOf(parts, "stress", 1, production),
  ].filter((script) => !partsOwed.some((o) => o.case === script.id));

/**
 * Every cell of the model's tables, by name.
 */
export const tableCells = (given: Rules = rules) => cellsOf(given).map(cellName);

const recorded = (scripts: ReadonlyArray<Script>, given: Rules) =>
  scripts.map((script) => {
    const log: Array<string> = [];
    const played = playPart(script, "production", recording(given, log));

    return { script, passed: played.verdict._tag === "Pass", reads: new Set(log) };
  });

/**
 * Each table cell mutated in turn and judged against the pilots' recorded production runs
 * (Conformance R19, I61, T39).
 *
 * **Details**
 *
 * - A pilot that fails on the design's rules is left out: its red is production's or the suite's.
 * - A cell no passing pilot reads cannot change a verdict, so it is listed unnoticed unrun; the
 *   rest are replayed on the pilots that read them until one refuses.
 * - A kill is an oracle's refusal naming an Invariant ({@link killedBy}), never a throw.
 */
export const cellMutants = (scripts: ReadonlyArray<Script> = pilots(), given: Rules = rules) => {
  const runs = recorded(scripts, given).filter((r) => r.passed);

  return cellsOf(given).map((cell) => {
    const name = cellName(cell);
    const mutated = replaced(given, cell, mutantOf(given, cell));

    const kill = runs
      .filter((r) => r.reads.has(name))
      .reduce<Option.Option<string>>(
        (found, r) =>
          Option.isSome(found)
            ? found
            : killedBy(playPart(r.script, "production", mutated).verdict),
        Option.none(),
      );

    return {
      cell: name,
      invariant: Option.getOrElse(kill, () => "none"),
      noticed: Option.isSome(kill),
    } satisfies CellMutant;
  });
};
