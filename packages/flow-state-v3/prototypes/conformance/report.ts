// Parses SCENARIOS.md, the convergences and machine-design 2.4, and prints the runner's reports. D33: a citation counts as
// tested only when a mutant of that id fails a test citing it.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const proto = join(import.meta.dir, "..");
const design = join(
  proto,
  "../../../workflow/plans/flow/references/explorations/machine-fragments/machine-design.md",
);

export type Row = {
  id: string;
  R: number;
  kind: string;
  src: string;
  cites: string[];
  thin: boolean;
};

export const catalog = (): Row[] => {
  const rows: Row[] = [];
  for (const line of readFileSync(join(proto, "SCENARIOS.md"), "utf8").split("\n")) {
    if (!line.startsWith("| ") || line.startsWith("| id") || line.startsWith("| ---")) continue;
    const c = line.split("|").map((x) => x.trim());
    const R = Number(c[2]);
    if (!c[1] || !Number.isInteger(R) || R === 0) continue;
    rows.push({
      id: c[1],
      R,
      kind: c[3]!,
      src: c[4]!,
      cites: c[5]!.split(",").map((x) => x.trim()),
      thin: c[6] === "*",
    });
  }
  return rows;
};

export const changed = (): Map<string, string[]> => {
  const m = new Map<string, string[]>();
  for (const f of [
    "convergence-1.md",
    "convergence-2.md",
    "convergence-3.md",
    "convergence-4.md",
    "convergence-5.md",
    "convergence-6.md",
  ]) {
    const text = readFileSync(join(proto, f), "utf8");
    const block = /```decisions-changed\n([\s\S]*?)```/.exec(text)![1]!;
    for (const l of block.trim().split("\n")) {
      const [id, , repl] = l.trim().split(/\s+/);
      m.set(id!, (repl ?? "").split(","));
    }
  }
  return m;
};

// Reachable cells of the 2.7.13 holding table, parsed: a cell whose text says "cannot occur" is not owed.
export const laneCells = (): string[] => {
  const lines = readFileSync(design, "utf8").split("\n");
  const start = lines.findIndex((l) => l.startsWith("| Row | `Idle` | `InFlight` | `Held` |"));
  const names: Record<string, string> = {
    commit: "commit",
    retry: "retry",
    cancel: "cancel",
    idle: "idle",
    retryable: "retryable",
    invoked: "invoked",
    "storage refused": "storageRefused",
    success: "success",
    failure: "failure",
    unknown: "unknown",
    interrupt: "interrupt",
    dispose: "dispose",
    rebind: "rebind",
    restore: "restore",
    "Runtime disposal": "runtimeDisposal",
    "SSR hydration": "ssrHydration",
  };
  const out: string[] = [];
  for (const l of lines.slice(start + 2)) {
    if (!l.startsWith("|")) break;
    const c = l.split(" | ").map((x) => x.replace(/^\| /, "").trim());
    const m = /\*\*`?([^*`(]+?)`?(?:\([^)]*\))?\*\*/.exec(c[0]!);
    const row = m && names[m[1]!.trim()];
    if (!row) continue;
    (["Idle", "InFlight", "Held"] as const).forEach((s, i) => {
      if (!c[i + 1]?.startsWith("cannot occur")) out.push(`cell:lane.${row}.${s}`);
    });
  }
  return out;
};

// D33: `sec:` ids must name a real heading (or a labelled part of one).
export const badSections = (ids: readonly string[]): string[] => {
  const text = readFileSync(design, "utf8");
  const heads = new Set([...text.matchAll(/^#{2,4} (\d+(?:\.\d+)*)/gm)].map((m) => m[1]!));
  return ids
    .filter((x) => x.startsWith("sec:"))
    .filter((x) => {
      const m = /^sec:(\d+(?:\.\d+)*)/.exec(x);
      return !m || !heads.has(m[1]!);
    });
};

const allIds = (): string[] => {
  const lines = readFileSync(design, "utf8").split("\n");
  const a = lines.findIndex((l) => l.startsWith("### 2.4 The rules"));
  const b = lines.findIndex((l) => l.startsWith("### 2.5 The turn"));
  const rules = new Set<string>();
  for (const l of lines.slice(a, b)) {
    const m = /^(\d+)\. \*\*/.exec(l);
    if (m) rules.add(`rule:${m[1]}`);
    const n = /^\s*\*?\*?(N[123])\b/.exec(l);
    if (n) rules.add(n[1]!);
  }
  const ds = Array.from({ length: 73 }, (_, i) => `D${i + 1}`);
  const ts = Array.from({ length: 9 }, (_, i) => `T${i + 1}`);
  return [...rules, ...laneCells(), ...ts, ...ds];
};

const ROUND_ROWS = [
  "rebind",
  "dispose",
  "commit",
  "retry",
  "cancel",
  "idle",
  "retryable",
  "invoked",
  "storageRefused",
  "success",
  "failure",
  "unknown",
  "interrupt",
  "restore",
  "runtimeDisposal",
];
const ROUND_DS = [
  "D1",
  "D2",
  "D3",
  "D4",
  "D5",
  "D6",
  "D7",
  "D8",
  "D23",
  "D25",
  "D26",
  "D27",
  "D28",
  "D29",
  "D30",
  "D31",
  "D35",
  "D39",
  "D40",
  "D41",
  "D42",
  "D43",
  "D15",
  "D21",
  "D22",
  "D45",
  "D46",
  "D47",
  "D48",
  "D49",
  "D50",
  "D51",
  "D52",
  "D53",
  "D54",
  "D55",
  "D56",
  "D57",
  "D58",
  "D59",
  "D60",
  "D61",
  "D64",
];
const inRound = (id: string) => {
  const m = /^cell:lane\.(\w+)\./.exec(id);
  return m ? ROUND_ROWS.includes(m[1]!) : ROUND_DS.includes(id);
};
const cited = (id: string, c: readonly string[]) =>
  c.includes(id) || (/^T\d$/.test(id) && c.some((x) => x.startsWith(`${id}:`)));

// A mutant kills citation X when it fails a test that cites X, and the mutant says it breaks X.
export type MutantResult = {
  id: string;
  kills: readonly string[];
  killed: boolean;
  killers: readonly string[];
  author: string;
};
export const proven = (
  results: readonly MutantResult[],
  cites: ReadonlyMap<string, readonly string[]>,
): Set<string> => {
  const out = new Set<string>();
  for (const m of results)
    for (const id of m.kills)
      if (m.killers.some((k) => cites.get(k.split("/")[0]!)?.includes(id))) out.add(id);
  return out;
};

export const printReports = (
  round: number,
  ran: ReadonlyArray<{
    id: string;
    cites: readonly string[];
    near?: readonly string[];
    pins?: readonly string[];
  }>,
  cellsHit: ReadonlySet<string>,
  mutantsFile: string | undefined,
) => {
  const rows = catalog();
  const here = rows.filter((r) => r.R <= round);
  const citedIds = ran.flatMap((r) => r.cites);
  const results: MutantResult[] =
    mutantsFile && existsSync(mutantsFile) ? JSON.parse(readFileSync(mutantsFile, "utf8")) : [];
  const citesBy = new Map(ran.map((r) => [r.id, r.cites]));
  const good = proven(results, citesBy);
  const untested = allIds().filter((id) => !cited(id, citedIds));
  const owed = untested.filter(inRound);
  console.log(`\nUNTESTED     ${untested.length} ids with no scenario in rounds <= ${round}`);
  console.log(`  owed by this round (${owed.length}): ${owed.join(" ")}`);
  console.log(
    `  not in this round's scope (${untested.length - owed.length}): ${untested.filter((x) => !inRound(x)).join(" ")}`,
  );
  const hitNotCited = [...cellsHit].filter((c) => !citedIds.includes(`cell:${c}`));
  console.log(
    `  cells hit though no scenario cites them (${hitNotCited.length}): ${hitNotCited.sort().join(" ")}`,
  );
  const checkable = [
    ...new Set(
      citedIds.filter(
        (x) =>
          !x.startsWith("sec:") &&
          x !== "no-decision" &&
          !x.startsWith("S1:") &&
          !x.startsWith("OD:"),
      ),
    ),
  ];
  const near = checkable.filter((x) => !good.has(x));
  console.log(
    `\nCITATIONS (D33, D56)  ${good.size}/${checkable.length} covered by at least one killing mutant, which is not proof${results.length ? "" : " (no mutants file: run mutate.ts)"}`,
  );
  console.log(`  near, stays UNTESTED (${near.length}): ${near.sort().join(" ")}`);
  const bad = badSections([...new Set(citedIds)]);
  console.log(`  bad sec ids (${bad.length}): ${bad.join(" ")}`);
  const ch = changed();
  console.log("\nOLD-RULE");
  for (const r of ran) {
    for (const id of r.cites) {
      const repl = ch.get(id);
      if (!repl) continue;
      const ok = repl.some((x) => r.cites.includes(x));
      console.log(
        `  ${r.id} cites ${id}: changed to ${repl.join(",")}, ${ok ? "also cites it: ok" : "no replacement cited: FLAG"}`,
      );
    }
  }
  console.log(
    `\nPINNED       ${ran
      .filter((r) => r.pins?.length)
      .map((r) => `${r.id}:${r.pins!.join("+")}`)
      .join(" ")}`,
  );
  console.log(
    `NO-DECISION  ${rows
      .filter((r) => r.cites.includes("no-decision"))
      .map((r) => r.id)
      .join(" ")}`,
  );
  console.log(
    `THIN         ${here
      .filter((r) => r.thin)
      .map((r) => r.id)
      .join(" ")}`,
  );
  return { unproven: near };
};
