import { Option } from "effect";
import { Fact, oracle, type Oracle, violation } from "../dsl/oracle.ts";
import { oracles } from "../suite.ts";
import { OwedItem, owedRows, type PartOwed } from "./owed.ts";
import { partFaults, playPart } from "./play.ts";
import { scriptById } from "./records.ts";

const PLANTED = "planted lost ending";

const planted = (check: string, invariant: string, subject: string, at: number) => {
  const found = violation(`${invariant}: ${PLANTED}`, Option.some(subject));
  let firedAt = Option.none<number>();

  const judge = oracle<number>({
    name: check,
    guarantee: [found.invariant],
    start: () => 0,
    step: (n, cut) => {
      if (n !== at) return [n + 1, []];

      const [head] = cut;
      firedAt = Option.some(head !== undefined && Fact.$is("Stepped")(head) ? head.step : 0);

      return [n + 1, [found]];
    },
  });

  return { judge, check, invariant: found.invariant, subject, firedAt: () => firedAt };
};

/**
 * The gate faults of one script played with `extra` oracles planted beside the suite's, under
 * `rows` (its owed rows), by the parts gate's own judgement.
 */
export const judgedWith = (
  id: string,
  extra: ReadonlyArray<Oracle>,
  rows: ReadonlyArray<PartOwed> = owedRows,
  open: ReadonlySet<string> = new Set(rows.map((o) => o.owner)),
) => {
  const script = Option.getOrThrow(scriptById(id));
  const mine = rows.filter((o) => o.case === id);

  return partFaults([{ script, run: playedWith(id, extra, rows) }], mine, new Set([id]), open);
};

const playedWith = (id: string, extra: ReadonlyArray<Oracle>, rows: ReadonlyArray<PartOwed>) =>
  playPart(
    Option.getOrThrow(scriptById(id)),
    "production",
    undefined,
    rows.filter((o) => o.case === id),
    Option.none(),
    [...oracles, ...extra],
  );

const otherCheck = (check: string) => (check === "lane-queue" ? "disposal" : "lane-queue");

const plantsFor = (id: string, rows: ReadonlyArray<PartOwed>, salt: number) => {
  const script = Option.getOrThrow(scriptById(id));
  const stepped = playPart(script, "production", undefined, rows).facts.filter(Fact.$is("Stepped"));
  const late = Math.max(1, stepped.length - 1);

  const keys =
    rows.length === 0 ? [{ check: "delivered-once", invariant: "WriteLanes I15" }] : rows;

  return [0, late].flatMap((at) => [
    ...keys.flatMap((k) => [
      planted(k.check, k.invariant, `att-planted-${salt}`, at),
      planted(k.check, k.invariant, `Planted/Lane x${salt} op`, at),
    ]),
    ...rows.flatMap((r) =>
      r.items.flatMap((i) =>
        OwedItem.$match(i, {
          Attempt: ({ id: attempt }) => [planted(otherCheck(r.check), r.invariant, attempt, at)],
          Item: ({ subject, step }) =>
            step === at + 1 ? [] : [planted(r.check, r.invariant, subject, at)],
        }),
      ),
    ),
  ]);
};

/**
 * The planted-fault sweep (the class gate; Conformance R22): every script in `ids` is played with
 * one planted break at a time, early and late in the run: a fresh Attempt and a fresh lane under
 * each of its owed rows' check and Invariant (or a default one), each owed Attempt under another
 * check, and each owed subject at another step. Each script must pass `gate` (the parts gate's
 * judgement) unplanted under `rows`, and each plant must fire and make it fault; a fault line
 * names every plant that never fired or that the gate let pass. The plants always come from the
 * owed list.
 */
export const plantedSweep = (
  ids: ReadonlyArray<string>,
  rows: ReadonlyArray<PartOwed> = owedRows,
  gate: typeof partFaults = partFaults,
) =>
  ids.flatMap((id, index) => {
    const script = Option.getOrThrow(scriptById(id));
    const mine = rows.filter((o) => o.case === id);
    const open = new Set(rows.map((o) => o.owner));

    const faultsWith = (extra: ReadonlyArray<Oracle>) =>
      gate([{ script, run: playedWith(id, extra, rows) }], mine, new Set([id]), open);

    if (faultsWith([]).length > 0) return [`BAD  ${id}: fails the gate with nothing planted`];

    return plantsFor(
      id,
      owedRows.filter((o) => o.case === id),
      index,
    ).flatMap((plant, n) => {
      const faults = faultsWith([plant.judge]);

      if (Option.isNone(plant.firedAt())) return [`BAD  ${id}: planted break ${n} never fired`];

      return faults.length > 0
        ? []
        : [`BAD  ${id}: planted break ${n} (${plant.check}) passed the gate`];
    });
  });
