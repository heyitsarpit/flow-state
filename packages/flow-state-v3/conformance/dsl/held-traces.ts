/// <reference types="node" />
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const KILLS = fileURLToPath(new URL("../held-traces.tsv", import.meta.url));

/**
 * Each lifecycle trace's fold-code mutants it kills, as the `fold-mutants` mode last recorded them
 * in `held-traces.tsv`: a name, a tab, then the killed mutants' keys separated by spaces (T61;
 * close review O5).
 */
export const foldKills = () =>
  new Map(
    readFileSync(KILLS, "utf8")
      .split("\n")
      .filter((l) => l !== "")
      .map((l) => {
        const [name = "", keys = ""] = l.split("\t");

        return [name, keys.split(" ").filter((k) => k !== "")] as const;
      }),
  );

/**
 * One trace as the redundancy gate judges it: the table mutants it kills, the Invariants it
 * refuses, and whether it names its ruling.
 */
export type Judged = {
  readonly name: string;
  readonly tableKills: ReadonlySet<number>;
  readonly refuses: ReadonlyArray<string>;
  readonly ruled: boolean;
};

/**
 * The redundancy gate's faults (close review O5). From the last trace back, a trace goes when
 * every table and fold mutant it kills a kept trace also kills, it names no ruling, and it refuses
 * no Invariant only it refuses; each that goes is a fault. A trace with no fold record is stale.
 */
export const redundancyFaults = (
  judged: ReadonlyArray<Judged>,
  fold: ReadonlyMap<string, ReadonlyArray<string>>,
) => {
  const kills = judged.map(
    (t) =>
      new Set([
        ...[...t.tableKills].map((k) => `table ${k}`),
        ...(fold.get(t.name) ?? []).map((k) => `fold ${k}`),
      ]),
  );

  const kept = new Set(judged.keys());

  for (const i of [...judged.keys()].toReversed()) {
    const others = [...kept].filter((j) => j !== i);

    const covered = [...(kills[i] ?? [])].every((k) =>
      others.some((j) => kills[j]?.has(k) === true),
    );

    const onlyRefusal = (judged[i]?.refuses ?? []).some(
      (inv) => !others.some((j) => judged[j]?.refuses.includes(inv) === true),
    );

    if (covered && judged[i]?.ruled === false && !onlyRefusal) kept.delete(i);
  }

  return [
    ...judged
      .filter((t) => !fold.has(t.name))
      .map((t) => `stale: ${t.name} has no fold verdict; rerun the fold-mutants mode`),
    ...judged
      .filter((t, i) => fold.has(t.name) && !kept.has(i))
      .map((t) => `redundant: ${t.name} (every table and fold kill is another trace's; delete it)`),
  ];
};
