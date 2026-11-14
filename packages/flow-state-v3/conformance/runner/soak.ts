/// <reference types="node" />
import { Console, Effect, Option, Schema } from "effect";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { mixed, mixedWithPay, parts } from "../../fixtures/index.ts";
import { implemented as production } from "../adapters/production.ts";
import { RegressionJson } from "../generated.ts";
import { mixOf, scriptOf } from "../parts/generate.ts";
import { gateScripts } from "../parts/records.ts";
import { TRIAGED_SIGNATURES } from "../parts/owed-varied.ts";
import { reachOf, seedsByReach, soaked } from "../parts/soak.ts";
import { flag, MAIN } from "./args.ts";

const candidatesAt = (seeds: ReadonlyArray<number>) => [
  ...parts.flatMap((part) =>
    (["stress", "varied"] as const).flatMap((profile) =>
      seeds.map((seed) => scriptOf(part, profile, seed, production)),
    ),
  ),
  ...seeds.flatMap((seed) => [
    mixOf(mixed, "varied", seed, production),
    mixOf(mixedWithPay, "varied", seed, production),
  ]),
];

/**
 * The soak run (T61), at each Task's close: stress and varied scripts of every part and both mixes
 * at `--count` seeds from `--from` (default 1000, 8), played on production under the owed rows.
 * Failures group by signature; each signature not yet triaged (`TRIAGED_SIGNATURES`) gets one
 * shrunk case, written to `--scratch` (or with `--keep` to `regressions/`), and fails the run; a
 * triaged one is listed with its root. The seeds that add cells or cell pairs the gate scripts
 * never reach are listed, chosen by reach.
 */
export const soak = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const from = Number(Option.getOrElse(flag(args, "--from"), () => "1000"));
    const count = Number(Option.getOrElse(flag(args, "--count"), () => "8"));
    const seeds = Array.from({ length: count }, (_, i) => from + i);
    const scripts = candidatesAt(seeds);

    const out = args.includes("--keep")
      ? resolve(dirname(MAIN), "..", "regressions")
      : resolve(Option.getOrElse(flag(args, "--scratch"), () => "."));

    const base = new Set(gateScripts().flatMap((s) => [...reachOf(s)]));

    const chosen = seedsByReach(
      scripts.map((script) => ({ script, reach: reachOf(script) })),
      base,
    );

    const known = new Set(TRIAGED_SIGNATURES.keys());
    const { groups, shrunk } = soaked(scripts, undefined, known);
    const fresh = [...groups.keys()].filter((s) => !known.has(s));

    yield* Effect.sync(() => {
      mkdirSync(out, { recursive: true });

      for (const { signature, script } of shrunk)
        writeFileSync(
          resolve(out, `${script.id}.json`),
          `${Schema.encodeSync(RegressionJson)({ ...script, by: signature })}\n`,
        );
    });

    for (const c of chosen)
      yield* Console.log(
        `REACH ${c.script.id}: adds cells or cell pairs the gate scripts never reach`,
      );

    for (const [signature, ids] of groups)
      yield* Console.log(
        `${known.has(signature) ? `KNOWN (${TRIAGED_SIGNATURES.get(signature) ?? ""})` : "FOUND"} ${signature}: ${ids.length} script(s), first ${ids[0] ?? ""}`,
      );

    for (const { signature, script } of shrunk)
      yield* Console.log(`SHRUNK ${script.id} (${script.steps.length} steps) for ${signature}`);

    yield* Console.log(
      `VERDICT ${fresh.length === 0 ? "pass" : "fail"} ${scripts.length} soak scripts, ${fresh.length} new signature(s), ${groups.size - fresh.length} known, ${chosen.length} seed(s) chosen by reach`,
    );

    if (fresh.length > 0) process.exitCode = 1;
  });
