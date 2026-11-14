import { Option } from "effect";
import { pairsIn, successorPairs } from "./cells.ts";
import { interactingPairs, interacts, SHARED } from "./channels.ts";
import { unknownCodes } from "./codes.ts";

/**
 * One generated run's reach: the codes each composite's steps exercised, whether it was an app
 * mix (several composites in one runtime), and the lifecycle table cells its model read, in order.
 */
export type RunReach = {
  readonly id: string;
  readonly mix: boolean;
  readonly byComposite: Readonly<Record<string, ReadonlySet<string>>>;
  readonly cells: ReadonlyArray<string>;
};

/**
 * Who will reach an unreached pair: an open Task of a slice, the part, operation or pair sweep
 * that will reach it, and the date the owner was set.
 */
export type Owner = {
  readonly task: string;
  readonly slice: number;
  readonly by: string;
  readonly date: string;
};

/**
 * What the combination gate reads.
 *
 * **Details**
 *
 * - `declared`: the codes the runtime under test declares.
 * - `sliceOf`: the slice that builds each code; `current` is the slice being built, so a code
 *   declared ahead of its slice is refused (Conformance R16).
 * - `tasks`: each Task's status and slice, read from the records.
 */
export type PairInput = {
  readonly declared: ReadonlyArray<string>;
  readonly runs: ReadonlyArray<RunReach>;
  readonly owners: Readonly<Record<string, Owner>>;
  readonly tasks: Readonly<Record<string, { readonly open: boolean; readonly slice: number }>>;
  readonly sliceOf: Readonly<Record<string, number>>;
  readonly current: number;
};

/**
 * The key of a pair in `owners`: its two codes in the closed list's order, joined by `+`.
 */
export const pairKey = (a: string, b: string) => `${a}+${b}`;

const together = (run: RunReach, codes: ReadonlyArray<string>) => {
  const sets = Object.values(run.byComposite);

  if (sets.some((set) => codes.every((c) => set.has(c)))) return true;

  const [a, b] = codes;

  return (
    run.mix &&
    codes.length === 2 &&
    a !== undefined &&
    b !== undefined &&
    (SHARED.has(a) || SHARED.has(b)) &&
    sets.some((x) => x.has(a)) &&
    sets.some((y) => y.has(b))
  );
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const ownerFault = (input: PairInput, found: Option.Option<Owner>) => {
  if (Option.isNone(found)) return "no owner";

  const owner = found.value;

  const task = input.tasks[owner.task];

  if (task === undefined) return `owner ${owner.task} is no Task`;

  if (!task.open) return `owner ${owner.task} is done`;

  if (task.slice !== owner.slice || owner.slice < input.current)
    return `owner ${owner.task} is not slice ${owner.slice}'s, or that slice is past`;

  if (owner.by.length === 0) return "the owner names no part, operation or pair sweep";

  return DATE.test(owner.date) ? undefined : `the owner's date ${owner.date} is not a date`;
};

const triplesOf = (codes: ReadonlyArray<string>) =>
  codes.flatMap((a, i) =>
    codes
      .slice(i + 1)
      .flatMap((b, j) =>
        codes
          .slice(i + j + 2)
          .flatMap((c) =>
            interacts(a, b) && interacts(a, c) && interacts(b, c) ? [[a, b, c]] : [],
          ),
      ),
  );

/**
 * The cell pairs the committed record holds that no run reaches now (Conformance R18, I58), one
 * fault each; a pair reached now and not recorded is no fault, and a recording run adds it.
 */
export const lostCellPairs = (recorded: ReadonlyArray<string>, reached: ReadonlyArray<string>) => {
  const now = new Set(reached);

  return recorded
    .filter((pair) => !now.has(pair))
    .map((pair) => `BAD  cell pair ${pair}: recorded as reached, reached by no run now`);
};

/**
 * The combination gate (Conformance R18): every interacting pair of the declared codes is
 * reached together in one run, or has an owner. Triples are reported and never fail it.
 *
 * **Details**
 *
 * - A code declared ahead of the slice that builds it, or that no slice builds, fails it.
 * - Triples and cell pairs are reported in total and per composite (Conformance I58; catalogue
 *   5A, "Cell-pair reach"). A run's cell pairs count for its one composite, or for `app mix`.
 * - Together means one composite's steps in one run, or, in an app mix, two composites when one
 *   code of the pair is a shared resource.
 * - An owner is an open Task of a slice not yet past, the part, operation or pair sweep that will
 *   reach the pair, and a date. Dates are recorded, never compared with a clock (R8).
 */
export const combinationGate = (input: PairInput) => {
  const unknown = unknownCodes(input.declared).map((c) => `${c}: not in the closed list`);

  const ahead = input.declared.flatMap((c) => {
    const slice = input.sliceOf[c];

    if (slice === undefined) return [`${c}: declared, but no slice builds it`];

    return slice > input.current ? [`${c}: declared before slice ${slice} builds it`] : [];
  });

  const pairs = interactingPairs(input.declared);

  const unreached = pairs.filter((pair) => !input.runs.some((run) => together(run, pair)));

  const unowned = unreached.flatMap(([a, b]) => {
    const fault = ownerFault(input, Option.fromUndefinedOr(input.owners[pairKey(a, b)]));

    return fault === undefined ? [] : [`${pairKey(a, b)}: unreached; ${fault}`];
  });

  const triples = triplesOf(input.declared.filter((c) => unknownCodes([c]).length === 0));

  const composites = [...new Set(input.runs.flatMap((r) => Object.keys(r.byComposite)))];

  const byComposite = Object.fromEntries(
    composites.map((c) => [
      c,
      triples.filter((t) =>
        input.runs.some((r) => t.every((code) => r.byComposite[c]?.has(code) === true)),
      ).length,
    ]),
  );

  const successors = successorPairs();

  const cellPairs = input.runs.map((run) => ({
    composites: run.mix ? ["app mix"] : Object.keys(run.byComposite),
    reached: pairsIn(run.cells, successors),
  }));

  const pairsOf = (runs: typeof cellPairs) => new Set(runs.flatMap((r) => [...r.reached])).size;

  const interacting = new Set(pairs.map(([a, b]) => pairKey(a, b)));
  const open = new Set(unreached.map(([a, b]) => pairKey(a, b)));

  const stale = Object.keys(input.owners).flatMap((key) => {
    if (!interacting.has(key)) return [`${key}: owned, but no interacting pair of declared codes`];

    return open.has(key) ? [] : [`${key}: owned, but reached: drop the owner`];
  });

  const empty = input.runs.length === 0 ? ["no generated run: the gate judged nothing"] : [];

  return {
    failures: [...empty, ...unknown, ...ahead, ...unowned, ...stale],
    reached: pairs.length - unreached.length,
    owed: unreached.length,
    triples: {
      total: triples.length,
      reached: triples.filter((t) => input.runs.some((run) => together(run, t))).length,
      byComposite,
    },
    cellPairs: {
      total: successors.size,
      reached: pairsOf(cellPairs),
      keys: [...new Set(cellPairs.flatMap((r) => [...r.reached]))].toSorted(),
      byComposite: Object.fromEntries(
        [...new Set(cellPairs.flatMap((r) => r.composites))].map((c) => [
          c,
          pairsOf(cellPairs.filter((r) => r.composites.includes(c))),
        ]),
      ),
    },
  };
};
