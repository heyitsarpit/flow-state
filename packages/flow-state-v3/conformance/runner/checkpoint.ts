/// <reference types="node" />
import { Console, Effect } from "effect";
import { MAIN } from "./args.ts";
import { runChild } from "./child.ts";
import { machineGates, verdictLine } from "./gates.ts";

/**
 * The cheap gates `nub run verify` runs at every checkpoint, by their gate-file names: together
 * about a minute (T61; survey item 1). The slow ones (suite, falsify, liar, crash, pairs, model
 * mutation, core mutants) stay in `conformance:gates`.
 */
export const CHECKPOINT_GATES: ReadonlyArray<string> = [
  "coverage",
  "parts production",
  "held-out production",
  "class gate production",
  "bench production",
];

/**
 * One gate the checkpoint runs: its name, the script bun runs, and that script's arguments.
 */
export type CheckpointGate = {
  readonly gate: string;
  readonly entry: string;
  readonly args: ReadonlyArray<string>;
};

/**
 * The checkpoint's gates, from the gate file's list so each gate's arguments live in one place.
 */
export const checkpointGates = () =>
  machineGates("")
    .filter((g) => CHECKPOINT_GATES.includes(g.gate))
    .map(({ gate, args, entry = MAIN }) => ({ gate, entry, args }));

/**
 * The checkpoint names the gate file has no gate for: each one fails the checkpoint.
 */
export const missingGates = (names: ReadonlyArray<string>) => {
  const known = new Set(machineGates("").map((g) => g.gate));

  return names.filter((n) => !known.has(n));
};

const green = (code: number, verdict: string) =>
  code === 0 && (verdict.startsWith("VERDICT pass") || verdict.startsWith("ok   coverage"));

/**
 * Runs each gate in its own bounded child, one at a time, without writing the gate file: a gate
 * passes only when its exit code is zero and its verdict line says pass. Every gate runs even
 * after a red; an empty list judges nothing and fails.
 */
export const checkpoint = (gates: ReadonlyArray<CheckpointGate>, seconds: number) =>
  Effect.map(
    Effect.forEach(
      gates,
      ({ gate, entry, args }) =>
        runChild("bun", [entry, ...args], seconds).pipe(
          Effect.map((out) => {
            const verdict = verdictLine(out.stdout);

            return { ok: green(out.code, verdict), line: `${gate}: ${verdict} (exit ${out.code})` };
          }),
          Effect.catchTag("ChildFailed", (e) =>
            Effect.succeed({ ok: false, line: `${gate}: failed: ${e.why}` }),
          ),
          Effect.map(({ ok, line }) => ({ ok, line: `${ok ? "ok  " : "BAD "} ${line}` })),
        ),
      { concurrency: 1 },
    ),
    (runs) => ({
      ok: runs.length > 0 && runs.every((r) => r.ok),
      lines: runs.map((r) => r.line),
    }),
  );

/**
 * The checkpoint mode (T61): the cheap gates, each in a child under the gate file's bound,
 * without writing the gate file; any red fails the run, so `nub run verify` fails.
 */
export const checkpointMode = Effect.gen(function* () {
  const result = yield* checkpoint(checkpointGates(), 280);
  const missing = missingGates(CHECKPOINT_GATES).map((n) => `BAD  ${n}: no such gate`);
  const lines = [...result.lines, ...missing];
  const ok = result.ok && missing.length === 0;

  for (const line of lines) yield* Console.log(line);
  yield* Console.log(
    `VERDICT ${ok ? "pass" : "fail"} ${lines.filter((l) => l.startsWith("ok")).length}/${lines.length} checkpoint gates`,
  );

  if (!ok) process.exitCode = 1;
});
