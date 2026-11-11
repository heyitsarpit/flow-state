/// <reference types="node" />
import { Effect, Option, Predicate } from "effect";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { nullPort } from "../adapters/null.ts";
import { nullSurface } from "../adapters/null-static.ts";
import { loadPrototypeSurface } from "../adapters/prototype-static.ts";
import { productionPort } from "../adapters/production.ts";
import { load, loadPrototype, PrototypeLoadFailed, prototypePort } from "../adapters/prototype.ts";
import type { Scenario } from "../dsl/case.ts";
import type { Graphed } from "../dsl/oracle.ts";
import type { Port } from "../port.ts";
import { graphedOf } from "../static-cli/graph.ts";
import type { Surface } from "../surface.ts";
import { oracles } from "../suite.ts";
import { runCaseLiar, runCases } from "./run.ts";
import type { CaseVerdict } from "./verdict.ts";

export const MAIN = resolve(dirname(fileURLToPath(import.meta.url)), "main.ts");
export const PACKAGE = resolve(dirname(MAIN), "..", "..");
export const NULL_RUNTIME = "null";
export const PRODUCTION_RUNTIME = "production";
export const DEFAULT_RUNTIME = resolve(dirname(MAIN), "..", "..", "prototypes", "round-14");
export const REPOSITORY = resolve(dirname(MAIN), "..", "..", "..", "..");

export const flag = (args: ReadonlyArray<string>, name: string) => {
  const at = args.indexOf(name);

  return at < 0 ? Option.none<string>() : Option.fromUndefinedOr(args[at + 1]);
};

export const runtimeOf = (args: ReadonlyArray<string>) => {
  const given = Option.getOrElse(flag(args, "--runtime"), () => DEFAULT_RUNTIME);

  return given === NULL_RUNTIME || given === PRODUCTION_RUNTIME ? given : resolve(given);
};

export const runtimePort = (runtime: string) => {
  if (runtime === NULL_RUNTIME) return Effect.succeed(nullPort);

  if (runtime === PRODUCTION_RUNTIME) return Effect.succeed(productionPort);

  return Effect.map(loadPrototype(runtime), prototypePort);
};

// The production runtime has no static surface yet (T17 builds the compiler's and the CLI's): its
// cases run with no `flow graph`, so the graph gate does not judge its turns.
export const runtimeSurface = (runtime: string) =>
  runtime === NULL_RUNTIME || runtime === PRODUCTION_RUNTIME
    ? Effect.succeed(nullSurface)
    : loadPrototypeSurface(runtime);

export const graphsFor = (surface: Surface, chosen: ReadonlyArray<Scenario>) => {
  const names = new Set(chosen.flatMap((s) => s.fixtures.map((f) => f.name)));
  const graphs = new Map([...names].map((name) => [name, graphedOf(surface, name)]));

  return (scenario: Scenario) =>
    scenario.fixtures.flatMap((f) => Option.toArray(graphs.get(f.name) ?? Option.none()));
};

export const list = (value: Option.Option<string>) =>
  Option.match(value, {
    onNone: () => Option.none<ReadonlyArray<string>>(),
    onSome: (v) => Option.some(v.split(",").filter((x) => x !== "")),
  });

export const parallelOf = (args: ReadonlyArray<string>) =>
  Math.min(8, Math.max(1, Number(Option.getOrElse(flag(args, "--parallel"), () => "1")) || 1));

export const caughtBy = (oracles: ReadonlyArray<string>) =>
  oracles.length > 0 ? oracles.join(",") : "case";

export const lineOf = (v: CaseVerdict) => {
  if (v._tag === "Pass") return `pass ${v.id}`;

  if (v._tag === "Timeout") return `TIME ${v.id}  seed ${v.seed}: past its ${v.seconds} s bound`;

  return `FAIL ${v.id}  ${caughtBy(v.oracles)}: ${v.why}`;
};

export const failed = (id: string, why: string) =>
  ({ _tag: "Fail", id, oracles: [], why }) satisfies CaseVerdict;

/**
 * The reference a liar run records from: `production:<package dir>` loads that package's
 * production adapter by path; anything else is a prototype runtime directory.
 */
export const referencePort = (spec: string) =>
  spec.startsWith(`${PRODUCTION_RUNTIME}:`)
    ? Effect.flatMap(
        load(
          join(
            spec.slice(PRODUCTION_RUNTIME.length + 1),
            "conformance",
            "adapters",
            "production.ts",
          ),
        ),
        (module) =>
          Predicate.hasProperty(module, "productionPort")
            ? // SAFETY: the production adapter's export is the Port the suite boots (adapters/production.ts).
              // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a dynamic import has no static type
              Effect.succeed(module["productionPort"] as Port)
            : Effect.fail(new PrototypeLoadFailed({ path: spec, why: "no export productionPort" })),
      )
    : runtimePort(resolve(spec));

/**
 * Runs the chosen cases: plainly, or under the liar gate with `--liar-reference`.
 */
export const playChosen = (
  args: ReadonlyArray<string>,
  runtime: string,
  chosen: ReadonlyArray<Scenario>,
  graphs: (scenario: Scenario) => ReadonlyArray<Graphed>,
) =>
  Effect.gen(function* () {
    const port = yield* runtimePort(runtime);

    return yield* Option.match(flag(args, "--liar-reference"), {
      onNone: () => runCases(port, chosen, oracles, graphs),
      onSome: (spec) =>
        Effect.flatMap(referencePort(spec), (reference) =>
          Effect.forEach(chosen, (s) => runCaseLiar(reference, port, s, oracles, graphs(s)), {
            concurrency: 1,
          }),
        ),
    });
  });
