/// <reference types="node" />
import { Effect, Option } from "effect";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { Mutant } from "../dsl/oracle.ts";
import { caught } from "./caught.ts";
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

    if (caught(Option.some(catchKeyOf(mutant, oracle)), v))
      return `${mutant.name}\t${v.id}\tcaught ${oracle} ${mutant.expects}`;

    if (!caught(Option.none(), v)) return `${mutant.name}\t${v.id}\tfailed uncaught`;
    const by = v.oracles.length > 0 ? v.oracles.join(",") : "case";

    return `${mutant.name}\t${v.id}\tred ${by}`;
  });

/**
 * The judge named for a mutant held by case expectations rather than an oracle: it is caught
 * only by a failed expectation that cites the Invariant it expects (Conformance R6).
 */
export const CASE_EXPECTATIONS = "case expectations";

/**
 * What a mutant held by `oracle` must be caught by: that check (`case` for case expectations)
 * and the Invariant it expects.
 */
export const catchKeyOf = (mutant: Mutant, oracle: string) => ({
  check: oracle === CASE_EXPECTATIONS ? "case" : oracle,
  invariant: mutant.expects,
});

/**
 * The file a full falsify run on `runtime` writes: its catch matrix, or with `--sweep` its sweep
 * record (every mutant on every case, the phase-out baseline later steps compare against).
 */
export const matrixFile = (runtime: "prototype" | "production", sweep: boolean) =>
  `${sweep ? "catch-sweep" : "catch-matrix"}.${runtime}.tsv`;

const keyOf = (row: string) => row.split("\t").slice(0, 2).join("\t");

/**
 * A row with its Invariant's retired form read as the rule it names, so a cite that only took its
 * retired form (`Retired WriteLanes I21`) is the same catch.
 */
const unretired = (row: string) => row.replaceAll("Retired ", "");

/**
 * Writes the catch matrix at `path`, sorted, and returns the catches the committed file had that
 * this run lost: a (mutant, case) once `caught` and now anything else, or no longer run; a catch
 * whose Invariant only took its retired form is not lost.
 */
export const writeMatrix = (path: string, rows: ReadonlyArray<string>) =>
  Effect.sync(() => {
    const before = existsSync(path)
      ? readFileSync(path, "utf8")
          .split("\n")
          .filter((r) => r !== "")
      : [];

    const now = new Map(rows.map((r) => [keyOf(r), r]));

    const lost = before.filter(
      (r) =>
        r.includes("\tcaught ") &&
        Option.map(Option.fromUndefinedOr(now.get(keyOf(r))), unretired).pipe(
          Option.getOrElse(() => ""),
        ) !== unretired(r),
    );

    writeFileSync(path, `${[...rows].toSorted().join("\n")}\n`);

    return lost;
  });
