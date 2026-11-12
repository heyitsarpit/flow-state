/// <reference types="node" />
import { Console, Effect } from "effect";
import { parts } from "../fixtures/index.ts";
import { implemented as production } from "../conformance/adapters/production.ts";
import { fingerprintOf } from "../conformance/parts/fingerprint.ts";
import { scriptOf } from "../conformance/parts/generate.ts";
import { playPart } from "../conformance/parts/play.ts";
import { verdict } from "../conformance/runner/parts-gates.ts";
import { benchReplay } from "./bench.ts";

const quantile = (sorted: ReadonlyArray<number>, q: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;

/**
 * The bench gate: each pilot's usual script does the same work in the bench as in the run the
 * suite judged (Conformance R23, I67); turn cost per part is printed, never gated.
 */
export const benchGate = Effect.suspend(() => {
  const rows = parts.map((part) => {
    const script = scriptOf(part, "usual", 1, production);
    const judged = fingerprintOf(playPart(script, "production"));
    const benched = benchReplay(script);
    const same = JSON.stringify(benched.fingerprint) === JSON.stringify(judged);
    const ms = benched.turnMs.toSorted((a, b) => a - b);

    return {
      line: `${part.name}: turn median ${quantile(ms, 0.5).toFixed(3)} ms, p99 ${quantile(ms, 0.99).toFixed(3)} ms`,
      fault: same
        ? []
        : [
            `BAD  ${part.name}: bench ${JSON.stringify(benched.fingerprint)}, judged ${JSON.stringify(judged)}`,
          ],
    };
  });

  return Effect.forEach(rows, (r) => Console.log(r.line), { concurrency: 1 }).pipe(
    Effect.andThen(
      verdict(
        rows.flatMap((r) => r.fault),
        rows.length,
        "bench fingerprints equal",
      ),
    ),
  );
});

// oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- the bench gate's process entry, run as a child by the gate file
Effect.runFork(benchGate);
