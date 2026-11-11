/// <reference types="node" />
import { Effect } from "effect";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { Mutant } from "../dsl/oracle.ts";
import type { CaseVerdict } from "./verdict.ts";

/**
 * One mutant's rows of the catch matrix (advisor Q6): per case it ran, `caught <oracle>
 * <Invariant>` when the oracle that holds it caught it, `red <oracles>` when another check did,
 * `green` when the case passed, `time` when it ran out of time.
 */
export const matrixRows = (mutant: Mutant, oracle: string, verdicts: ReadonlyArray<CaseVerdict>) =>
  verdicts.map((v) => {
    if (v._tag === "Pass") return `${mutant.name}\t${v.id}\tgreen`;

    if (v._tag === "Timeout") return `${mutant.name}\t${v.id}\ttime`;
    const named = `${oracle}: ${mutant.expects}:`;

    const caught =
      oracle === CASE_EXPECTATIONS
        ? v.oracles.length === 0 && (v.cites ?? []).includes(mutant.expects)
        : v.oracles.includes(oracle) && v.why.includes(named);

    if (caught) return `${mutant.name}\t${v.id}\tcaught ${oracle} ${mutant.expects}`;
    const by = v.oracles.length > 0 ? v.oracles.join(",") : "case";

    return `${mutant.name}\t${v.id}\tred ${by}`;
  });

/**
 * The judge named for a mutant held by case expectations rather than an oracle: it is caught
 * only by a failed expectation that cites the Invariant it expects (Conformance R6).
 */
export const CASE_EXPECTATIONS = "case expectations";

const keyOf = (row: string) => row.split("\t").slice(0, 2).join("\t");

/**
 * Writes the catch matrix at `path`, sorted, and returns the catches the committed file had that
 * this run lost: a (mutant, case) once `caught` and now anything else, or no longer run.
 */
export const writeMatrix = (path: string, rows: ReadonlyArray<string>) =>
  Effect.sync(() => {
    const before = existsSync(path)
      ? readFileSync(path, "utf8")
          .split("\n")
          .filter((r) => r !== "")
      : [];

    const now = new Map(rows.map((r) => [keyOf(r), r]));
    const lost = before.filter((r) => r.includes("\tcaught ") && now.get(keyOf(r)) !== r);

    writeFileSync(path, `${[...rows].toSorted().join("\n")}\n`);

    return lost;
  });
