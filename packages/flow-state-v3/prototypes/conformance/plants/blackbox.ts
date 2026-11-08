// The black-box plants (VERDICTS-PROPOSAL-2.md 11.1): each plant's edit and command, run unchanged on a tree exported from a commit, so the
// same plant can be shown on the old commit and on the new one. It reads only what both commits print: the exit status, named human
// lines, and the VERDICT line where there is one. It is the one file outside verdicts/ that reads a child's output, because the old
// commit has nothing else to read. bun plants/blackbox.ts --commit SHA --tree DIR [--only B1,B6] [--out FILE]
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

type Edit = readonly [file: string, find: string, replace: string];
type Plant = {
  readonly id: string;
  readonly edits?: { readonly old: readonly Edit[]; readonly new: readonly Edit[] } | readonly Edit[];
  readonly files?: Readonly<Record<string, string>>;
  readonly cmd: readonly string[];
  readonly seconds: number;
  readonly lines: RegExp;
  readonly repeat?: number;
};

const arg = (k: string) => {
  const i = process.argv.indexOf(k);
  return i < 0 ? undefined : process.argv[i + 1];
};
const commit = arg("--commit") ?? "HEAD";
const treeDir = resolve(arg("--tree") ?? "/tmp/flow-blackbox");
const only = arg("--only")?.split(",");
const outFile = arg("--out");
const repo = resolve(import.meta.dir, "../../../../..");
const bun = process.execPath;
const P = "packages/flow-state-v3/prototypes";
const rt = ["--runtime", "../round-14/adapter.ts"];

const alloc4g = "const __plantA: Uint8Array[] = []; for (let __i = 0; __i < 128; __i++) __plantA.push(new Uint8Array(32e6).fill(1));";
const passVerdict = (gate: string) => `'VERDICT ' + JSON.stringify({ gate: ${JSON.stringify(gate)}, run: process.env.FLOW_RUN ?? "top", items: [{ kind: "check", name: "score", outcome: "pass", why: "" }] })`;
const scoreTop = "// D144: the scorer of real runs must fail what it says it fails.";
const mailqTop = "// D140: the mailbox's own contract, as a unit.";
const plantList = (mutants: string) => `export const MUTANTS = ${mutants};\n`;
const MUT = ["bun", "mutate.ts", "--runtime", "../round-14", "--list", "plant-mutants.ts", "--out", "/dev/null"];
const GATES = (only: string) => ["bun", "gates.ts", ...rt, "--round", "14", "--only", only];
const LONG = 270;
const lineRows =/^(ok|BAD|UNKN)\s|^GATES|^(KILLED|SURVIVED|UNKNOWN|INVALID|UNSCORED|ROTTED)\s|^CONTROL|^control:|^\d+\/\d+ killed|^FALSIFY|^every|^never red|^error:|^WATCH/;

const K = Number(process.env["PLANT_K"] ?? "40000000");
const slowSettle: readonly Edit[] = [[`${P}/round-14/adapter.ts`, "pending: () => rt.pending(),", `pending: () => ((globalThis as any).__plantK = ((globalThis as any).__plantK ?? 0) + 1) <= ${K} || rt.pending(),`]];
const LOADED = ["taskpolicy", "-c", "background"];
const PLANTS: readonly Plant[] = [
  { id: "B3-alone", edits: slowSettle, cmd: ["bun", "main.ts", "--round", "99", "--no-catalog", ...rt, "--only", "PAY-01"], seconds: 200, lines: /^(PASS|FAIL)\s/ },
  { id: "B3-loaded", edits: slowSettle, cmd: [...LOADED, bun, "main.ts", "--round", "99", "--no-catalog", ...rt, "--only", "PAY-01"], seconds: 200, lines: /^(PASS|FAIL)\s/ },
  { id: "B4-alone", edits: slowSettle, cmd: ["bun", "gate5s.ts", ...rt], seconds: 200, lines: /^GATE-5S/ },
  { id: "B4-loaded", edits: slowSettle, cmd: [...LOADED, bun, "gate5s.ts", ...rt], seconds: 200, lines: /^GATE-5S/ },
  { id: "B1", edits: [[`${P}/round-14/typed/swaps.ts`, "[typedPayFixture, payFixture],", "[typedPayFixture, payFullFixture],"]], cmd: GATES("mutate-one"), seconds: LONG, lines: /^(ok|BAD|UNKN)\s+mutate-one|^GATES/ },
  {
    id: "B5",
    edits: [[`${P}/conformance/scenarios/lifetime.scenario.ts`, 'cites: ["rule:73", "C108"],\n    run(c0) {', `cites: ["rule:73", "C108"],\n    run(c0) {\n      ${alloc4g}`]],
    cmd: ["bun", "lifetime-falsify.ts", ...rt, "--mutants", "life.no-grace"],
    seconds: LONG,
    lines: /^(ok|BAD|UNKN)\s+control|^every lifetime|survivor/,
  },
  {
    id: "B6",
    files: { [`${P}/round-14/plant-mutants.ts`]: plantList(`[{ id: "plant.alloc-at-boot", kills: ["PAY-01"], edits: [["adapter.ts", "import { allActors, getActor } from \\"./actors.ts\\";", "import { allActors, getActor } from \\"./actors.ts\\"; ${alloc4g.replace(/"/g, '\\"')}"]] }]`) },
    cmd: MUT,
    seconds: LONG,
    lines: lineRows,
  },
  { id: "B8", edits: [[`${P}/round-14/adapter.ts`, "pending: () => rt.pending(),", "pending: () => true,"]], cmd: ["bun", "main.ts", "--round", "99", "--no-catalog", ...rt, "--only", "PAY-01"], seconds: 120, lines: /^(PASS|FAIL)\s/ },
  { id: "B10", edits: [[`${P}/round-14/checks/mailq-check.ts`, mailqTop, `process.stderr.write("x".repeat(1 << 20));\n${mailqTop}`]], cmd: GATES("checks/mailq"), seconds: LONG, lines: /^(ok|BAD|UNKN)\s+checks\/mailq|^GATES/ },
  { id: "B11", edits: [[`${P}/round-14/checks/mailq-check.ts`, mailqTop, `${alloc4g}\n${mailqTop}`]], cmd: GATES("checks/mailq"), seconds: LONG, lines: /^(ok|BAD|UNKN)\s+checks\/mailq|^GATES/ },
  {
    id: "B12a",
    edits: [[`${P}/round-14/mutants-lifetime.ts`, '"const dueAt = tx.env.now + tx.bounds.graceMs;", "const dueAt = tx.env.now;"', '"const dueAt = no such text;", "x"']],
    cmd: ["bun", "lifetime-falsify.ts", ...rt, "--mutants", "life.no-grace"],
    seconds: 120,
    lines: /^(ok|BAD|UNKN)\s|^every lifetime|survivor|^error:/,
  },
  {
    id: "B12b",
    edits: {
      old: [[`${P}/conformance/gates.ts`, "const jobs: Job[] = [", 'const jobs: Job[] = [\n  { name: "plant", cmd: ["/nonexistent/flow-plant"], slots: 1, mb: 100, s: 1, limit: 10 },']],
      new: [[`${P}/conformance/gates.ts`, "const specsOf = (L: typeof import(\"./limits.ts\")): Spec[] => [", 'const specsOf = (L: typeof import("./limits.ts")): Spec[] => [\n  { name: "plant", gate: "plant", cmd: () => ["/nonexistent/flow-plant"], slots: 1, mb: 100, s: 1, limit: 10 },']],
    },
    cmd: GATES("plant,checks/mailq"),
    seconds: 200,
    lines: /^(ok|BAD|UNKN)\s|^GATES|^error:/,
  },
  {
    id: "B13",
    files: { [`${P}/round-14/plant-mutants.ts`]: plantList(`[{ id: "plant.commutes-claims", kills: ["PAY-01"], edits: [["step.ts", "const dueAt = tx.env.now + tx.bounds.graceMs;", "const dueAt = tx.bounds.graceMs + tx.env.now;"]] }, { id: "plant.commutes-claims-nothing", kills: [], edits: [["step.ts", "const dueAt = tx.env.now + tx.bounds.graceMs;", "const dueAt = tx.bounds.graceMs + tx.env.now;"]] }]`) },
    cmd: MUT,
    seconds: LONG,
    lines: lineRows,
  },
  { id: "B15", cmd: ["bun", "watch.ts", "--rss-mb", "300", "--seconds", "1", "--", "sh", "-c", "sleep 0.99"], seconds: 20, lines: /^WATCH/, repeat: 50 },
  { id: "B17", edits: [[`${P}/round-14/adapter.ts`, "if (same !== (JSON.stringify(canon(x)) === JSON.stringify(canon(y)))) {", "if (true) {"]], cmd: GATES("suite canon"), seconds: LONG, lines: /^(ok|BAD|UNKN)\s+suite canon|^GATES/ },
  { id: "B18", edits: [[`${P}/round-14/checks/score-check.ts`, scoreTop, `process.exit(0);\n${scoreTop}`]], cmd: GATES("checks/score"), seconds: 200, lines: /^(ok|BAD|UNKN)\s+checks\/score|^GATES/ },
  {
    id: "B19",
    edits: {
      old: [[`${P}/round-14/checks/score-check.ts`, scoreTop, `console.log("FAIL x");\nprocess.exit(0);\n${scoreTop}`]],
      new: [[`${P}/round-14/checks/score-check.ts`, scoreTop, `console.log(${passVerdict("checks/score-check.ts")});\nprocess.exit(1);\n${scoreTop}`]],
    },
    cmd: GATES("checks/score"),
    seconds: 200,
    lines: /^(ok|BAD|UNKN)\s+checks\/score|^GATES/,
  },
  {
    id: "B20",
    files: { [`${P}/round-14/plant-mutants.ts`]: plantList(`[{ id: "plant.forged", kills: ["D58"], edits: [["world.ts", "tx.w = { ...tx.w, nextId: n + 1 }; return n;", "return n; /* plant-b20 */"]] }]`) },
    edits: {
      old: [[`${P}/conformance/mutate-one.ts`, "  process.exit(0);\n};", '  if (require("node:fs").readFileSync(join(round, "world.ts"), "utf8").includes("plant-b20")) console.log(\'{"killedBy":null,"killers":[],"search":"not run"}\');\n  process.exit(0);\n};']],
      new: [[`${P}/conformance/mutate-one.ts`, 'await stated("mutate-one", async (scope) => {', 'await stated("mutate-one", async (scope) => {\n  if (require("node:fs").readFileSync(join(resolve(import.meta.dir, dirname(process.argv[process.argv.indexOf("--runtime") + 1]!)), "world.ts"), "utf8").includes("plant-b20")) console.log(\'VERDICT {"gate":"mutate-one","run":"top.9","items":[]}\');']],
    },
    cmd: MUT,
    seconds: LONG,
    lines: lineRows,
  },
  {
    id: "B21",
    edits: {
      old: [[`${P}/round-14/checks/score-check.ts`, scoreTop, `console.error("PASS score");\nprocess.exit(0);\n${scoreTop}`]],
      new: [[`${P}/round-14/checks/score-check.ts`, scoreTop, `console.error(${passVerdict("checks/score-check.ts")});\nprocess.exit(0);\n${scoreTop}`]],
    },
    cmd: GATES("checks/score"),
    seconds: 200,
    lines: /^(ok|BAD|UNKN)\s+checks\/score|^GATES/,
  },
  { id: "B22", edits: [[`${P}/round-14/checks/score-check.ts`, scoreTop, `process.kill(process.pid, "SIGTERM");\nawait Bun.sleep(5000);\n${scoreTop}`]], cmd: GATES("checks/score"), seconds: 200, lines: /^(ok|BAD|UNKN)\s+checks\/score|^GATES/ },
  {
    id: "B23",
    files: { [`${P}/round-14/plant-mutants.ts`]: plantList(`[{ id: "plant.throws-at-load", kills: ["PAY-01"], edits: [["adapter.ts", "import { allActors, getActor } from \\"./actors.ts\\";", "import { allActors, getActor } from \\"./actors.ts\\"; throw new Error(\\"plant\\");"]] }]`) },
    cmd: MUT,
    seconds: LONG,
    lines: lineRows,
  },
  { id: "B24", cmd: ["sh", "-c", `ulimit -n 40; exec ${bun} gates.ts ${rt.join(" ")} --round 14 --only checks/front`], seconds: 200, lines: /^(ok|BAD|UNKN)\s+checks\/front|^GATES|^error:/ },
  { id: "B25", edits: [[`${P}/round-14/checks/mailq-check.ts`, mailqTop, `for (let __i = 0; __i < 20; __i++) await new Promise((r) => process.stdout.write("y".repeat((1 << 20) - 1) + "\\n", r));\n${mailqTop}`]], cmd: GATES("checks/mailq"), seconds: LONG, lines: /^(ok|BAD|UNKN)\s+checks\/mailq|^GATES/ },
  {
    id: "B26",
    edits: { old: [], new: [] },
    cmd: ["sh", "-c", `cd search && if grep -q -- '--expect' run.ts; then exec ${bun} run.ts --which frag --runtime ../../round-14/adapter.ts --depth 9 --states 50 --expect completed; else exec ${bun} run.ts --which frag --runtime ../../round-14/adapter.ts --depth 9 --states 50; fi`],
    seconds: 120,
    lines: /"verdict"|^VERDICT/,
  },
  {
    id: "B28",
    edits: [[`${P}/round-14/checks/front-check.ts`, "// Round 11, review H3, M1, M3, M6:", "while (true) {}\n// Round 11, review H3, M1, M3, M6:"]],
    cmd: ["bun", "mutate-one.ts", ...rt],
    seconds: 290,
    lines: /^\{"killedBy"|^VERDICT/,
  },
];

type Seen = { readonly id: string; readonly exit: number | null; readonly ms: number; readonly lines: readonly string[]; readonly verdict: string | null; readonly note?: string };

const sh = (cmd: readonly string[], cwd: string) => {
  const p = Bun.spawnSync([...cmd], { cwd, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) throw new Error(`${cmd.join(" ")}: ${p.stderr.toString().slice(0, 300)}`);
};
const pristine = join(treeDir, "pristine");
if (!existsSync(pristine)) {
  mkdirSync(pristine, { recursive: true });
  sh(["sh", "-c", `git -C ${repo} archive ${commit} ${P} workflow/plans/flow/references/explorations/machine-fragments | tar -x -C ${pristine}`], repo);
}
const edited = (p: Plant): readonly Edit[] => {
  if (p.edits === undefined) return [];
  if ("old" in p.edits) return existsSync(join(pristine, P, "conformance/verdicts")) ? p.edits.new : p.edits.old;
  return p.edits;
};
const runOne = async (p: Plant): Promise<Seen> => {
  const work = join(treeDir, `w-${p.id}`);
  rmSync(work, { recursive: true, force: true });
  cpSync(pristine, work, { recursive: true });
  symlinkSync(join(repo, "node_modules"), join(work, "node_modules"));
  try {
    for (const [f, find, rep] of edited(p)) {
      const text = readFileSync(join(work, f), "utf8");
      const n = text.split(find).length - 1;
      if (n !== 1) return { id: p.id, exit: null, ms: 0, lines: [], verdict: null, note: `edit found ${n} times in ${f}` };
      writeFileSync(join(work, f), text.replace(find, () => rep));
    }
    for (const [f, text] of Object.entries(p.files ?? {})) writeFileSync(join(work, f), text);
    const cwd = join(work, P, "conformance");
    const seen: string[] = [];
    let exit: number | null = null;
    let verdict: string | null = null;
    const t0 = performance.now(); // evidence only
    for (let k = 0; k < (p.repeat ?? 1); k++) {
      const cmd = p.cmd[0] === "bun" ? [bun, ...p.cmd.slice(1)] : [...p.cmd];
      const child = Bun.spawn(["perl", "-e", `alarm ${p.seconds}; exec @ARGV`, "--", ...cmd], { cwd, stdin: "ignore", stdout: "pipe", stderr: "pipe", env: { ...process.env, FLOW_NESTED: "", FLOW_RUN: "", FLOW_POOL: "", FLOW_LIMIT_MB: "", FLOW_ALONE: "" } });
      const [out, err] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
      exit = await child.exited;
      for (const l of `${out}\n${err}`.split("\n")) if (p.lines.test(l)) seen.push(l.slice(0, 220));
      const v = out.split("\n").filter((l) => l.startsWith("VERDICT ")).at(-1);
      if (v) {
        const items = (JSON.parse(v.slice(8)) as { items: Array<{ kind: string; name: string; outcome?: string; why?: string; note?: string }> }).items;
        verdict = items.map((i) => `${i.name}=${i.outcome ?? "noted"}${i.outcome && i.outcome !== "pass" && i.why ? `(${i.why.slice(0, 90)})` : ""}`).join("; ").slice(0, 400);
      }
    }
    const ms = Math.round(performance.now() - t0);
    const lines = p.repeat ? [...new Map(seen.map((l) => [l.replace(/[\d.]+ s|peak \d+ MB/g, "#"), l])).keys()].map((k) => `${seen.filter((l) => l.replace(/[\d.]+ s|peak \d+ MB/g, "#") === k).length} x ${k}`) : seen;
    return { id: p.id, exit, ms, lines, verdict };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
};

const results: Seen[] = [];
for (const p of PLANTS.filter((x) => !only || only.includes(x.id))) {
  const s = await runOne(p);
  results.push(s);
  console.log(`${s.id}  exit ${s.exit}  ${(s.ms / 1000).toFixed(1)} s${s.note ? `  ${s.note}` : ""}\n    ${s.lines.join("\n    ")}${s.verdict ? `\n    VERDICT ${s.verdict}` : ""}`);
}
if (outFile) writeFileSync(outFile, JSON.stringify(results, null, 1));
