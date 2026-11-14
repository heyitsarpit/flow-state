/// <reference types="node" />
import { Console, Effect } from "effect";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { type HostMutant, hostMutants } from "../host-mutants.ts";
import { flag, PACKAGE } from "./args.ts";
import { runChild } from "./child.ts";
import { applyEdits, copyPackage } from "./falsify.ts";

const playOne = (scratch: string, mutant: HostMutant) =>
  Effect.scoped(
    Effect.gen(function* () {
      const { copy } = yield* copyPackage(PACKAGE, scratch);
      yield* applyEdits(copy, mutant);
      const root = dirname(copy);

      const run = yield* runChild(
        join(root, "node_modules", ".bin", "vitest"),
        ["run", "--root", root, join("package", mutant.test), "-t", mutant.named],
        120,
      );

      const said = `${run.stdout}\n${run.stderr}`;

      return run.code !== 0 && said.includes(mutant.red)
        ? `ok   ${mutant.name}: killed by "${mutant.named}" (${mutant.red})`
        : `BAD  ${mutant.name}: survived, or failed for another reason (exit ${run.code})`;
    }),
  ).pipe(Effect.catch((e) => Effect.succeed(`BAD  ${mutant.name}: ${e._tag}: ${e.why}`)));

/**
 * The host-mutant mode (T54 A0 review N3): plays every {@link hostMutants} entry on its own copy of
 * the package and fails unless each is killed by its named host test with its message.
 */
export const hostMutantsMode = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const scratch = resolve(
      flag(args, "--scratch").pipe((o) => (o._tag === "Some" ? o.value : tmpdir())),
    );

    const lines = yield* Effect.forEach(hostMutants, (m) => playOne(scratch, m), {
      concurrency: 4,
    });

    for (const line of lines) yield* Console.log(line);
    const killed = lines.filter((l) => l.startsWith("ok")).length;

    if (killed < lines.length) process.exitCode = 1;

    return yield* Console.log(
      `VERDICT ${killed === lines.length ? "pass" : "fail"} ${killed}/${lines.length} host mutants killed`,
    );
  });
