/// <reference types="node" />
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parts } from "../../fixtures/index.ts";
import { implemented as production } from "../adapters/production.ts";
import { staticOwed } from "../adapters/production-static.ts";
import { constructionCases } from "../compile/construction.cases.ts";
import { productionCases } from "../runner/gates.ts";
import { scenarios } from "../suite.ts";
import { SLICE_OF } from "./codes.ts";
import { FEATURES } from "./feature-rows.ts";
import { casesReaching, checksOf, derivedFrom, widened } from "./features.ts";
import { BUILD_SEEDS, HELD_OUT_SEEDS, mixOf, scriptOf } from "./generate.ts";

const TABLE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../wiki/plans/flow/references/proposals/plan-task-coverage-2026-11-11.md",
);

/**
 * The coverage report's text, read when asked: a mutant's package copy has no wiki folder.
 */
export const tableText = () => readFileSync(TABLE, "utf8");

/**
 * The Plan features' ids, from the coverage report's tables: the matrix's source of record.
 */
export const planIds = () =>
  tableText()
    .split("\n")
    .flatMap((line) => /^\| ([A-Z]\d{2}) \|/.exec(line)?.slice(1, 2) ?? []);

const PROPOSALS = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../wiki");

/**
 * The slice the replan gives each newly scoped feature (its "by owning Spec" list): the source the
 * matrix's owners follow, not the coverage report's older Task column.
 */
export const replanSlices = () => {
  const text = readFileSync(
    resolve(PROPOSALS, "plans/flow/references/proposals/replan-2026-11-11.md"),
    "utf8",
  );

  const section = text.slice(
    text.indexOf("### The 123 newly scoped features"),
    text.indexOf("Notes on the changes"),
  );

  const groups = section.replaceAll(/\n\s+/gu, " ").split(/;|\n- /u);

  return groups.flatMap((group) => {
    const slice = /slice (\d+)\)/u.exec(group)?.[1];

    if (slice === undefined) return [];

    return [...group.matchAll(/([A-Z])(\d{2})(?: to [A-Z](\d{2}))?/gu)].flatMap(
      ([, letter, from, to]) =>
        Array.from(
          { length: Number(to ?? from) - Number(from) + 1 },
          (_, i) =>
            [`${letter}${String(Number(from) + i).padStart(2, "0")}`, Number(slice)] as const,
        ),
    );
  });
};

/**
 * Each V3 Task's status and title, read from its record.
 */
export const taskRecords = () =>
  new Map<string, string>(
    readdirSync(resolve(PROPOSALS, "tasks/V3"))
      .filter((f) => /^P\d+\.task$/u.test(f))
      .flatMap((f) =>
        readFileSync(resolve(PROPOSALS, "tasks/V3", f), "utf8")
          .split(/^ {4}(?=T\d+$)/mu)
          .flatMap((block) => {
            const id = /^(T\d+)$/mu.exec(block)?.[1];
            const title = /^ {8}title +(.+)$/mu.exec(block)?.[1];

            return id === undefined || title === undefined
              ? []
              : [[`@task.V3.${id}`, title] as const];
          }),
      ),
  );

/**
 * Each V3 Task's status, read from its record: open unless done.
 */
export const taskStatuses = () =>
  new Map<string, boolean>(
    readdirSync(resolve(PROPOSALS, "tasks/V3"))
      .filter((f) => /^P\d+\.task$/u.test(f))
      .flatMap((f) =>
        readFileSync(resolve(PROPOSALS, "tasks/V3", f), "utf8")
          .split(/^ {4}(?=T\d+$)/mu)
          .flatMap((block) => {
            const id = /^(T\d+)$/mu.exec(block)?.[1];
            const status = /^ {8}status +(\S+)$/mu.exec(block)?.[1];

            return id === undefined || status === undefined
              ? []
              : [[`@task.V3.${id}`, status !== "done"] as const];
          }),
      ),
  );

const replanText = () =>
  readFileSync(resolve(PROPOSALS, "plans/flow/references/proposals/replan-2026-11-11.md"), "utf8");

/**
 * Each Task's slice, from the replan's "Slices at a glance" table (R is 0; a Task in brackets is
 * absorbed, not listed); the React bindings and package checks (T30, T50) come after slice 10.
 */
export const taskSlices = () => {
  const text = replanText();

  const table = text.slice(
    text.indexOf("| Slice               | Tasks"),
    text.indexOf("Parts each slice"),
  );

  const listed = table.split("\n").flatMap((line) => {
    const [, label = "", tasks = ""] = line.split("|").map((c) => c.trim());
    const slice = label.startsWith("R ") ? 0 : Number.parseInt(label, 10);

    if (Number.isNaN(slice)) return [];

    return [...tasks.replaceAll(/\([^)]*\)/gu, "").matchAll(/T\d+/gu)].map(
      ([t]) => [`@task.V3.${t}`, slice] as const,
    );
  });

  return new Map<string, number>([...listed, ["@task.V3.T30", 11], ["@task.V3.T50", 11]]);
};

/**
 * The code slices the replan's table gives ("built" is 0).
 */
export const replanCodeSlices = () => {
  const text = replanText();
  const table = text.slice(text.indexOf("| Codes "), text.indexOf("`in` is split"));

  return table.split("\n").flatMap((line) => {
    const [, codes = "", , , slice = ""] = line.split("|").map((c) => c.trim());
    const n = slice === "built" ? 0 : Number.parseInt(slice, 10);

    return Number.isNaN(n) ? [] : codes.split(/\s+/u).map((c) => [c, n] as const);
  });
};

const SPECS = resolve(PROPOSALS, "specs/core");

/**
 * Each feature's Spec rules from the coverage report, widened by the Requirements its Invariants
 * derive from, read from the core Specs.
 */
export const featureRules = () =>
  widened(
    checksOf(tableText()),
    new Map(
      readdirSync(SPECS)
        .filter((f) => f.endsWith(".spec"))
        .flatMap((f) => [
          ...derivedFrom(f.replace(".spec", ""), readFileSync(resolve(SPECS, f), "utf8")),
        ]),
    ),
  );

const scriptsAt = (seeds: ReadonlyArray<number>, mixSeeds: ReadonlyArray<number>) => [
  ...parts.flatMap((part) =>
    (["usual", "stress"] as const).flatMap((profile) =>
      seeds.map((seed) => scriptOf(part, profile, seed, production)),
    ),
  ),
  ...mixSeeds.map((seed) => mixOf(parts, "stress", seed, production)),
];

/**
 * The scripts the parts gate plays on production: each pilot's usual and stress scripts at six
 * build seeds, and the stress app mix at the first two.
 */
export const gateScripts = () => scriptsAt(BUILD_SEEDS.slice(0, 6), BUILD_SEEDS.slice(0, 2));

/**
 * The scripts the held-out gate plays on production: each pilot's usual and stress scripts and
 * the stress app mix at every held-out seed, which no builder tunes against (advisor Q8).
 */
export const heldOutScripts = () => scriptsAt(HELD_OUT_SEEDS, HELD_OUT_SEEDS);

/**
 * The slice being built: the lowest slice that still has an open Task.
 */
export const currentSlice = (
  statuses: ReadonlyMap<string, boolean>,
  slices: ReadonlyMap<string, number>,
) =>
  Math.min(
    ...[...statuses].flatMap(([task, open]) => {
      const slice = slices.get(task);

      return open && slice !== undefined ? [slice] : [];
    }),
  );

/**
 * The Compile construction cases production passes: every one its owed rows do not name.
 */
export const productionStatics = (
  owed: ReadonlyArray<string> = staticOwed.cases.map((row) => row.case),
) => constructionCases.filter((c) => !owed.includes(c.id));

/**
 * The matrix gate's input over the real rows: production's declarations, the Task records, the
 * codes the given runs reached and the hand and static cases production runs.
 */
export const matrixInputOf = (reached: ReadonlySet<string>) => {
  const statuses = taskStatuses();
  const slices = taskSlices();
  const running = new Set(productionCases);

  return {
    features: FEATURES,
    ids: planIds(),
    declared: production,
    reached,
    claimed: [
      ...new Set(
        parts.flatMap((p) =>
          Object.values(p.user)
            .flat()
            .flatMap((a) => a.codes),
        ),
      ),
    ],
    reaching: {
      hand: casesReaching(
        featureRules(),
        scenarios.filter((c) => running.has(c.id)),
      ),
      static: casesReaching(featureRules(), productionStatics()),
    },
    tasks: Object.fromEntries(
      [...statuses].map(([task, open]) => [task, { open, slice: slices.get(task) ?? -1 }]),
    ),
    sliceOf: SLICE_OF,
    current: currentSlice(statuses, slices),
  };
};
