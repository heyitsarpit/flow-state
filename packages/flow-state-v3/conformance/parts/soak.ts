import { Option } from "effect";
import { rules } from "../dsl/lifecycle-rules.ts";
import type { Oracle } from "../dsl/oracle.ts";
import type { Script } from "../dsl/script.ts";
import { oracles } from "../suite.ts";
import { pairsIn, recording, successorPairs } from "./cells.ts";
import { owedRows } from "./owed.ts";
import { playPart } from "./play.ts";
import { bySignature, shrunkPart } from "./shrink.ts";

/**
 * What one script reaches on production: the lifecycle cells it reads and the cell pairs it reads
 * in sequence.
 */
export const reachOf = (script: Script) => {
  const cells: Array<string> = [];
  playPart(script, "production", recording(rules, cells));

  return new Set([...cells, ...pairsIn(cells, successorPairs())]);
};

/**
 * Seeds chosen by reach (T61; survey item 4): from candidate scripts, greedily the one adding the
 * most cells and cell pairs `reached` lacks, until none adds any; the chosen in pick order.
 */
export const seedsByReach = <C extends { readonly reach: ReadonlySet<string> }>(
  candidates: ReadonlyArray<C>,
  reached: ReadonlySet<string>,
) => {
  const seen = new Set(reached);
  const left = [...candidates];
  const chosen: Array<C> = [];

  for (;;) {
    const gains = left.map((c) => [...c.reach].filter((r) => !seen.has(r)).length);
    const best = gains.indexOf(Math.max(0, ...gains));

    if (best < 0 || (gains[best] ?? 0) === 0) return chosen;
    const [pick] = left.splice(best, 1);

    if (pick === undefined) return chosen;
    chosen.push(pick);

    for (const r of pick.reach) seen.add(r);
  }
};

/**
 * A soak run (T61): each script played on production under the owed rows, its failures grouped
 * by signature, and for each signature not `known`, the first script failing by it shrunk: one
 * case per new signature.
 */
export const soaked = (
  scripts: ReadonlyArray<Script>,
  judges: ReadonlyArray<Oracle> = oracles,
  known: ReadonlySet<string> = new Set(),
) => {
  const runs = scripts.map((script) => ({
    script,
    run: playPart(script, "production", undefined, owedRows, Option.none(), judges),
  }));

  const groups = bySignature(runs);

  const shrunk = [...groups]
    .filter(([signature]) => !known.has(signature))
    .flatMap(([signature, ids]) =>
      Option.toArray(Option.fromUndefinedOr(scripts.find((s) => s.id === ids[0]))).map(
        (script) => ({ signature, script: shrunkPart(script, judges) }),
      ),
    );

  return { groups, shrunk };
};
