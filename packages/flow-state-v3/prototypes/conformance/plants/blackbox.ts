// The black-box plants (VERDICTS-PROPOSAL-2.md 11.1): each plant's edit and command, run unchanged on a tree exported from a commit, and
// what that side must show. It reads only what both commits print (the exit status, named human lines, the VERDICT line where there is
// one): it is the one file outside verdicts/ that reads a child's output, because the old commit has nothing else to read. Each plant is an
// item: pass iff every pattern of its side holds; an edit that does not apply is a fail.
// bun plants/blackbox.ts --commit SHA --side old|new --tree DIR [--only B1,B6] [--out FILE]
import { stated } from "../verdicts/state.ts";

type Edit = readonly [file: string, find: string, replace: string];
type Side = "old" | "new";
type BySide<T> = { readonly old: T; readonly new: T };
type Pattern = RegExp | { readonly not: RegExp };
type Plant = {
  readonly id: string;
  readonly sides?: readonly Side[];
  readonly edits?: BySide<readonly Edit[]> | readonly Edit[];
  readonly files?: Readonly<Record<string, string>>;
  readonly cmd: BySide<readonly string[]> | readonly string[];
  readonly seconds: number;
  readonly lines: RegExp;
  readonly expect: BySide<readonly Pattern[]>;
  readonly repeat?: number;
  readonly signal?: { readonly after: number; readonly name: NodeJS.Signals };
  readonly midEdit?: { readonly after: RegExp; readonly edit: Edit };
  readonly sample?: RegExp;
  readonly strays?: BySide<boolean>;
};

const P = "packages/flow-state-v3/prototypes";
const rt = ["--runtime", "../round-14/adapter.ts"];
const alloc4g = "const __plantA: Uint8Array[] = []; for (let __i = 0; __i < 128; __i++) __plantA.push(new Uint8Array(32e6).fill(1));";
const passVerdict = (gate: string) => `'VERDICT ' + JSON.stringify({ gate: ${JSON.stringify(gate)}, run: process.env.FLOW_RUN || "top", items: [{ kind: "check", name: "score", outcome: "pass", why: "" }] })`;
const scoreTop = "// D144: the scorer of real runs must fail what it says it fails.";
const mailqTop = "// D140: the mailbox's own contract, as a unit.";
const adapterImport = 'import { allActors, getActor } from "./actors.ts";';
const plantList = (mutants: string) => `export const MUTANTS = ${mutants};\n`;
const MUT = ["bun", "mutate.ts", "--runtime", "../round-14", "--list", "plant-mutants.ts", "--out", "/dev/null"];
const GATES = (only: string) => ["bun", "gates.ts", ...rt, "--round", "14", "--only", only];
const SUITE1 = (only: string) => ["bun", "main.ts", "--round", "99", "--no-catalog", ...rt, "--only", only];
const rows = /^(ok|BAD|UNKN)\s|^GATES|^(KILLED|SURVIVED|UNKNOWN|INVALID|UNSCORED|ROTTED)\s|^CONTROL|^control:|^\d+\/\d+ killed|^every|^never red|^error:|^WATCH|^left /;
const LONG = 270;
const K = 1_000_000_000;
const settleFor = (k: number): readonly Edit[] => [[`${P}/round-14/adapter.ts`, "pending: () => rt.pending(),", `pending: () => ((globalThis as any).__plantK = ((globalThis as any).__plantK ?? 0) + 1) <= ${k} || rt.pending(),`]];
const slowSettle = settleFor(K);
const LOADED = ["taskpolicy", "-c", "background"];
const lifeMutant = (edits: string) => ({ [`${P}/round-14/mutants-lifetime.ts`]: plantList(`[{ id: "plant", kills: ["rule:73"], edits: ${edits} }]`) });
const noGrace = '["step.ts", "const dueAt = tx.env.now + tx.bounds.graceMs;", "const dueAt = tx.env.now;"]';
const not = (re: RegExp) => ({ not: re });

const PLANTS: readonly Plant[] = [
  { id: "B1", edits: [[`${P}/round-14/typed/swaps.ts`, "[typedPayFixture, payFixture],", "[typedPayFixture, payFullFixture],"]], cmd: GATES("mutate-one"), seconds: LONG, lines: /^(ok|BAD|UNKN)\s+mutate-one|^GATES/, expect: { old: [/^ok\s+mutate-one/m, /^exit 0$/m], new: [/^BAD\s+mutate-one.*swap/m, /^exit 1$/m] } },
  {
    id: "B2",
    files: { [`${P}/round-14/plant-mutants.ts`]: plantList(`[{ id: "plant.hang", kills: ["PAY-01"], edits: [["adapter.ts", ${JSON.stringify(adapterImport)}, ${JSON.stringify(`${adapterImport} while (true) {}`)}]] }]`) },
    cmd: [...MUT, "--budget", "280"],
    seconds: 288,
    lines: rows,
    strays: { old: true, new: false },
    expect: { old: [/^control: the unmutated code passes/m, /^exit 142$/m, not(/^UNKNOWN/m)], new: [/^UNKNOWN\s+plant\.hang/m, /^exit 2$/m] },
  },
  {
    id: "B9-alone",
    edits: [[`${P}/conformance/search/frag.search.ts`, "    state(h) {\n      checkClaims(h.read);", '    state(h) {\n      if (((globalThis as any).__plantN = ((globalThis as any).__plantN ?? 0) + 1) > 600) throw new Error("PLANT-B9 past state 600");\n      checkClaims(h.read);']],
    cmd: [...SUITE1("FRAG-15"), "--no-output"],
    seconds: 200,
    lines: /^(PASS|FAIL)\s/,
    expect: { old: [/^FAIL\s+FRAG-15.*PLANT-B9/m], new: [/^FAIL\s+FRAG-15.*PLANT-B9/m] },
  },
  {
    id: "B9-loaded",
    edits: [[`${P}/conformance/search/frag.search.ts`, "    state(h) {\n      checkClaims(h.read);", '    state(h) {\n      if (((globalThis as any).__plantN = ((globalThis as any).__plantN ?? 0) + 1) > 600) throw new Error("PLANT-B9 past state 600");\n      checkClaims(h.read);']],
    cmd: [...LOADED, ...SUITE1("FRAG-15"), "--no-output"],
    seconds: 200,
    lines: /^(PASS|FAIL)\s/,
    expect: { old: [/^(PASS|FAIL)\s+FRAG-15/m], new: [/^FAIL\s+FRAG-15.*PLANT-B9/m] },
  },
  {
    id: "B14",
    edits: settleFor(2 * K),
    cmd: ["bun", "mutate-one.ts", ...rt],
    seconds: 280,
    lines: /^\{"killedBy"|^VERDICT/,
    sample: /main\.ts --round 99/,
    strays: { old: true, new: false },
    expect: { old: [/^after the first drain, at most [01]$/m, /unknown under load: plain/], new: [/^after the first drain, at most [01]$/m, /suite=fail/] },
  },
  { id: "B3-alone", edits: slowSettle, cmd: SUITE1("PAY-01"), seconds: 200, lines: /^(PASS|FAIL)\s/, expect: { old: [/^PASS\s+PAY-01/m], new: [/did not quiesce in 100000 work units/] } },
  { id: "B3-loaded", edits: slowSettle, cmd: [...LOADED, ...SUITE1("PAY-01")], seconds: 200, lines: /^(PASS|FAIL)\s/, expect: { old: [/did not quiesce in 20 s of wall clock/], new: [/did not quiesce in 100000 work units/] } },
  { id: "B4-alone", edits: slowSettle, cmd: ["bun", "gate5s.ts", ...rt], seconds: 200, lines: /^GATE-5S/, expect: { old: [/^exit 0$/m], new: [/^exit 1$/m, /gate-5s=fail/] } },
  { id: "B4-loaded", edits: slowSettle, cmd: [...LOADED, "bun", "gate5s.ts", ...rt], seconds: 200, lines: /^GATE-5S/, expect: { old: [/^exit 1$/m], new: [/^exit 1$/m, /gate-5s=fail/] } },
  {
    id: "B5",
    edits: [[`${P}/conformance/scenarios/lifetime.scenario.ts`, 'cites: ["rule:73", "C108"],\n    run(c0) {', `cites: ["rule:73", "C108"],\n    run(c0) {\n      ${alloc4g}`]],
    cmd: ["bun", "lifetime-falsify.ts", ...rt, "--mutants", "life.no-grace"],
    seconds: LONG,
    lines: rows,
    expect: { old: [/^ok\s+control: (?!119 )\d+ pass/m, /^every lifetime mutant goes red/m], new: [/^UNKN control/m, /^exit 2$/m] },
  },
  {
    id: "B6",
    files: { [`${P}/round-14/plant-mutants.ts`]: plantList(`[{ id: "plant.alloc-at-boot", kills: ["PAY-01"], edits: [["adapter.ts", ${JSON.stringify(adapterImport)}, ${JSON.stringify(`${adapterImport} ${alloc4g}`)}]] }]`) },
    cmd: MUT,
    seconds: LONG,
    lines: rows,
    expect: { old: [/^KILLED\s+plant\.alloc-at-boot\s+watchdog rss/m], new: [/^KILLED\s+plant\.alloc-at-boot\s+(rss|suite): 0/m, /^exit 0$/m] },
  },
  {
    id: "B7",
    files: lifeMutant(`[${noGrace}, ["../conformance/scenarios/lifetime.scenario.ts", "const c = onLife(c0, { persisted: false }); c.ensure(X); c.detach(X); c.advance(GRACE); c.advance(340);", "while (true) {} const c = onLife(c0, { persisted: false }); c.ensure(X); c.detach(X); c.advance(GRACE); c.advance(340);"]]`),
    cmd: ["bun", "lifetime-falsify.ts", ...rt, "--mutants", "plant", "--budget", "200"],
    seconds: LONG,
    lines: rows,
    expect: { old: [/^ok\s+plant/m], new: [/^UNKN plant/m, not(/^ok\s+plant/m), /^exit 2$/m] },
  },
  { id: "B8", edits: [[`${P}/round-14/adapter.ts`, "pending: () => rt.pending(),", "pending: () => true,"]], cmd: SUITE1("PAY-01"), seconds: 120, lines: /^(PASS|FAIL)\s/, expect: { old: [/did not quiesce in 20 s of wall clock/], new: [/did not quiesce in 100000 work units/] } },
  {
    id: "B8b",
    edits: [[`${P}/round-14/adapter.ts`, "boot(a: BootArgs): Instance {", "boot(a: BootArgs): Instance { { const __tick = () => void a.host.setTimer(a.host.now(), __tick); __tick(); }"]],
    cmd: SUITE1("LIFE-02"),
    seconds: 120,
    lines: /^(PASS|FAIL)\s/,
    expect: { old: [/^exit 142$/m], new: [/did not quiesce in 100000 work units/, /^exit 1$/m] },
  },
  { id: "B10", edits: [[`${P}/round-14/checks/mailq-check.ts`, mailqTop, `process.stderr.write("x".repeat(1 << 20));\n${mailqTop}`]], cmd: GATES("checks/mailq"), seconds: LONG, lines: /^(ok|BAD|UNKN)\s+checks\/mailq|^GATES/, expect: { old: [/^ok\s+checks\/mailq/m], new: [/^ok\s+checks\/mailq/m] } },
  { id: "B11", edits: [[`${P}/round-14/checks/mailq-check.ts`, mailqTop, `${alloc4g}\n${mailqTop}`]], cmd: GATES("checks/mailq"), seconds: LONG, lines: /^(ok|BAD|UNKN)\s+checks\/mailq|^GATES/, expect: { old: [/^BAD\s+checks\/mailq/m], new: [/^BAD\s+checks\/mailq.*killed by memory/m] } },
  {
    id: "B12a",
    edits: [[`${P}/round-14/mutants-lifetime.ts`, '"const dueAt = tx.env.now + tx.bounds.graceMs;", "const dueAt = tx.env.now;"', '"const dueAt = no such text;", "x"']],
    cmd: ["bun", "lifetime-falsify.ts", ...rt, "--mutants", "life.no-grace"],
    seconds: 120,
    lines: rows,
    expect: { old: [/^exit 142$/m], new: [/does not apply/, /^exit 1$/m] },
  },
  {
    id: "B12b",
    edits: {
      old: [[`${P}/conformance/gates.ts`, "const jobs: Job[] = [", 'const jobs: Job[] = [\n  { name: "plant", cmd: ["/nonexistent/flow-plant"], slots: 1, mb: 100, s: 1, limit: 10 },']],
      new: [[`${P}/conformance/gates.ts`, 'const specsOf = (L: typeof import("./limits.ts")): Spec[] => [', 'const specsOf = (L: typeof import("./limits.ts")): Spec[] => [\n  { name: "plant", gate: "plant", cmd: () => ["/nonexistent/flow-plant"], slots: 1, mb: 100, s: 1, limit: 10 },']],
    },
    cmd: GATES("plant,checks/mailq"),
    seconds: 200,
    lines: rows,
    expect: { old: [/^exit 1$/m, not(/^GATES/m)], new: [/^UNKN\s+plant.*unstarted/m, /^ok\s+checks\/mailq/m] },
  },
  {
    id: "B13",
    files: { [`${P}/round-14/plant-mutants.ts`]: plantList(`[{ id: "plant.commutes-claims", kills: ["PAY-01"], edits: [["step.ts", "const dueAt = tx.env.now + tx.bounds.graceMs;", "const dueAt = tx.bounds.graceMs + tx.env.now;"]] }, { id: "plant.commutes-claims-nothing", kills: [], edits: [["step.ts", "const dueAt = tx.env.now + tx.bounds.graceMs;", "const dueAt = tx.bounds.graceMs + tx.env.now;"]] }]`) },
    cmd: MUT,
    seconds: LONG,
    lines: rows,
    expect: { old: [/^SURVIVED\s+plant\.commutes-claims\s/m, /^exit 0$/m], new: [/plant\.commutes-claims=fail/, /plant\.commutes-claims-nothing=noted/, /^exit 1$/m] },
  },
  { id: "B15", cmd: ["bun", "watch.ts", "--rss-mb", "300", "--seconds", "1", "--", "sh", "-c", "sleep 0.99"], seconds: 20, lines: /^WATCH/, repeat: 50, expect: { old: [/WATCH #, #, exit 0, killed time/, /^repeats 50 of 50 WATCH lines$/m], new: [not(/exit 0, killed time/), /^repeats 50 of 50 WATCH lines$/m] } },
  {
    id: "B16",
    cmd: ["bun", "lifetime-falsify.ts", ...rt, "--mutants", "life.no-grace,life.grace-never-ends"],
    seconds: LONG,
    lines: /MIDRUN-PLANT|^(ok|BAD|UNKN)\s/,
    midEdit: { after: /control: \d+ pass/, edit: [`${P}/round-14/adapter.ts`, adapterImport, `${adapterImport} throw new Error("MIDRUN-PLANT");`] },
    expect: { old: [/^mid-edit applied$/m, /^BAD\s+life\.no-grace \(rule:73\): 0 red/m, /^BAD\s+life\.grace-never-ends \(rule:73\): 0 red/m], new: [/^mid-edit applied$/m, /^ok\s+life\.no-grace/m, /^ok\s+life\.grace-never-ends/m, not(/MIDRUN-PLANT/)] },
  },
  { id: "B17", edits: [[`${P}/round-14/adapter.ts`, "if (same !== (JSON.stringify(canon(x)) === JSON.stringify(canon(y)))) {", "if (true) {"]], cmd: GATES("suite canon"), seconds: LONG, lines: /^(ok|BAD|UNKN)\s+suite canon|^GATES/, expect: { old: [/GATES\s+0\/0/, /^exit 0$/m], new: [/^BAD\s+suite canon/m] } },
  { id: "B18", edits: [[`${P}/round-14/checks/score-check.ts`, scoreTop, `process.exit(0);\n${scoreTop}`]], cmd: GATES("checks/score"), seconds: 200, lines: /^(ok|BAD|UNKN)\s+checks\/score|^GATES/, expect: { old: [/^ok\s+checks\/score/m], new: [/^UNKN.*silent/m] } },
  {
    id: "B19",
    edits: {
      old: [[`${P}/round-14/checks/score-check.ts`, scoreTop, `console.log("FAIL x");\nprocess.exit(0);\n${scoreTop}`]],
      new: [[`${P}/round-14/checks/score-check.ts`, scoreTop, `console.log(${passVerdict("checks/score-check.ts")});\nprocess.exit(1);\n${scoreTop}`]],
    },
    cmd: GATES("checks/score"),
    seconds: 200,
    lines: /^(ok|BAD|UNKN)\s+checks\/score|^GATES/,
    expect: { old: [/^ok\s+checks\/score/m], new: [/^UNKN.*disagree/m] },
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
    lines: rows,
    expect: { old: [/^SURVIVED\s+plant\.forged/m], new: [/^UNKNOWN\s+plant\.forged.*duplicate/m] },
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
    expect: { old: [/^ok\s+checks\/score/m], new: [/^UNKN.*silent/m] },
  },
  { id: "B22", edits: [[`${P}/round-14/checks/score-check.ts`, scoreTop, `process.kill(process.pid, "SIGTERM");\nawait Bun.sleep(5000);\n${scoreTop}`]], cmd: GATES("checks/score"), seconds: 200, lines: /^(ok|BAD|UNKN)\s+checks\/score|^GATES/, expect: { old: [/^BAD\s+checks\/score/m], new: [/^UNKN.*signal SIGTERM/m] } },
  {
    id: "B23",
    files: { [`${P}/round-14/plant-mutants.ts`]: plantList(`[{ id: "plant.throws-at-load", kills: ["PAY-01"], edits: [["adapter.ts", ${JSON.stringify(adapterImport)}, ${JSON.stringify(`${adapterImport} throw new Error("plant");`)}]] }]`) },
    cmd: MUT,
    seconds: LONG,
    lines: rows,
    expect: { old: [/^KILLED\s+plant\.throws-at-load\s+crash/m], new: [/^KILLED\s+plant\.throws-at-load\s+suite: \d+: threw/m] },
  },
  { id: "B25", edits: [[`${P}/round-14/checks/mailq-check.ts`, mailqTop, `for (let __i = 0; __i < 20; __i++) await new Promise((r) => process.stdout.write("y".repeat((1 << 20) - 1) + "\\n", r));\n${mailqTop}`]], cmd: GATES("checks/mailq"), seconds: LONG, lines: /^(ok|BAD|UNKN)\s+checks\/mailq|^GATES/, expect: { old: [/^ok\s+checks\/mailq/m], new: [/^ok\s+checks\/mailq.*bytes dropped/m] } },
  {
    id: "B26",
    cmd: {
      old: ["bun", "search/run.ts", "--which", "frag", "--runtime", "../../round-14/adapter.ts", "--depth", "9", "--states", "50"],
      new: ["bun", "search/run.ts", "--which", "frag", "--runtime", "../../round-14/adapter.ts", "--depth", "9", "--states", "50", "--expect", "completed"],
    },
    seconds: 120,
    lines: /"verdict"/,
    expect: { old: [/"verdict": "inconclusive"/, /^exit 0$/m], new: [/inconclusive, completed expected/, /^exit 1$/m] },
  },
  { id: "B28", edits: [[`${P}/round-14/checks/front-check.ts`, "// Round 11, review H3, M1, M3, M6:", "while (true) {}\n// Round 11, review H3, M1, M3, M6:"]], cmd: ["bun", "mutate-one.ts", ...rt], seconds: 290, lines: /^\{"killedBy"/, strays: { old: true, new: false }, expect: { old: [/^exit 142$/m], new: [/checks\/front-check\.ts=unknown\(unknown: time\)/, /^exit 2$/m] } },
  ...(["SIGINT", "SIGTERM", "SIGALRM"] as const).map(
    (s): Plant => ({ id: `B29-${s}`, cmd: GATES("falsify suite1"), seconds: 120, lines: rows, signal: { after: 20, name: s }, strays: { old: true, new: false }, expect: { old: [/^tree [1-9]/m, /^left [1-9]/m], new: [/^tree [1-9]/m, /^left 0$/m, new RegExp(`interrupted by ${s}`), /^exit 2$/m] } }),
  ),
  { id: "B30", edits: [[`${P}/round-14/checks/score-check.ts`, scoreTop, `console.log("VERDICT {garbled");\nprocess.exit(0);\n${scoreTop}`]], cmd: GATES("checks/score"), seconds: 200, lines: /^(ok|BAD|UNKN)\s+checks\/score|^GATES/, expect: { old: [/^ok\s+checks\/score/m], new: [/^UNKN.*garbled/m] } },
];

await stated("blackbox", async () => {
  const { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } = await import("node:fs");
  const { join, resolve } = await import("node:path");
  type Item = import("../verdicts/verdict.ts").Item;
  const arg = (k: string) => {
    const i = process.argv.indexOf(k);
    return i < 0 ? undefined : process.argv[i + 1];
  };
  const commit = arg("--commit");
  const side = arg("--side") as Side | undefined;
  const treeArg = arg("--tree");
  if (!commit || (side !== "old" && side !== "new") || !treeArg) throw new Error("blackbox: --commit SHA, --side old|new and --tree DIR are required");
  const repo = resolve(import.meta.dir, "../../../../..");
  const sha = Bun.spawnSync(["git", "-C", repo, "rev-parse", commit], { stdin: "ignore" }).stdout.toString().trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`blackbox: no commit ${commit}`);
  const only = arg("--only")?.split(",");
  const bun = process.execPath;
  const base = join(resolve(treeArg), sha);
  const pristine = join(base, "pristine");
  if (!existsSync(pristine)) {
    mkdirSync(pristine, { recursive: true });
    const x = Bun.spawnSync(["sh", "-c", `git -C ${repo} archive ${sha} ${P} workflow/plans/flow/references/explorations/machine-fragments | tar -x -C ${pristine}`], { stdin: "ignore" });
    if (x.exitCode !== 0) throw new Error(`blackbox: export failed: ${x.stderr.toString().slice(0, 300)}`);
    writeFileSync(join(base, ".commit"), sha);
  }
  if (readFileSync(join(base, ".commit"), "utf8").trim() !== sha) throw new Error(`blackbox: ${base} holds another commit`);
  const hasVerdicts = existsSync(join(pristine, P, "conformance/verdicts"));
  if (hasVerdicts !== (side === "new")) throw new Error(`blackbox: --side ${side} does not fit ${sha.slice(0, 8)} (${hasVerdicts ? "it has" : "it has no"} verdicts/)`);
  const pick = <T>(x: BySide<T> | T): T => (x !== null && typeof x === "object" && "old" in (x as object) && "new" in (x as object) ? (x as BySide<T>)[side] : (x as T));
  const PS_MS = 5000;
  const strays = (work: string): number[] => {
    const p = Bun.spawnSync(["pgrep", "-f", work], { stdin: "ignore", timeout: PS_MS });
    return p.stdout.toString().split("\n").map(Number).filter((n) => n > 0 && n !== process.pid);
  };
  const alive = (pid: number) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  const descendants = (root: number): number[] => {
    const rows = Bun.spawnSync(["ps", "-Ao", "pid=,ppid=,command="], { stdin: "ignore", timeout: PS_MS }).stdout.toString().trim().split("\n").map((l) => {
      const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(l);
      return m ? ([Number(m[1]), Number(m[2]), m[3]!] as const) : ([0, 0, ""] as const);
    });
    const out: Array<{ pid: number; command: string }> = [];
    const walk = (p: number) => {
      for (const [pid, ppid, command] of rows) if (ppid === p && !out.some((x) => x.pid === pid)) (out.push({ pid, command }), walk(pid));
    };
    walk(root);
    return out;
  };
  const tree = new Set<number>();
  const killStrays = (work: string) => {
    let n = 0;
    for (const pid of [...tree].filter(alive)) {
      try {
        process.kill(pid, 9);
        n++;
      } catch {}
    }
    tree.clear();
    for (const pid of strays(work)) {
      const cmd = Bun.spawnSync(["ps", "-o", "command=", "-p", String(pid)], { stdin: "ignore", timeout: PS_MS }).stdout.toString();
      if (!cmd.includes(work)) continue;
      try {
        process.kill(pid, 9);
        n++;
      } catch {}
    }
    return n;
  };
  const items: Item[] = [];
  for (const p of PLANTS.filter((x) => !only || only.includes(x.id))) {
    if (p.sides && !p.sides.includes(side)) {
      items.push({ kind: "plant", name: `${p.id} ${side}`, outcome: "fail", why: "not built for this side" });
      continue;
    }
    const work = join(base, `w-${p.id}`);
    rmSync(work, { recursive: true, force: true });
    cpSync(pristine, work, { recursive: true });
    symlinkSync(join(repo, "node_modules"), join(work, "node_modules"));
    let missed = "";
    for (const [f, find, rep] of pick(p.edits ?? [])) {
      const text = readFileSync(join(work, f), "utf8");
      const n = text.split(find).length - 1;
      if (n !== 1) missed = `edit found ${n} times in ${f}`;
      else writeFileSync(join(work, f), text.replace(find, () => rep));
    }
    for (const [f, text] of Object.entries(p.files ?? {})) writeFileSync(join(work, f), text);
    const cwd = join(work, P, "conformance");
    const seen: string[] = [];
    let exit: number | null = null;
    let verdict = "";
    const t0 = performance.now(); // evidence only
    if (!missed)
      for (let k = 0; k < (p.repeat ?? 1); k++) {
        const raw = pick(p.cmd);
        const cmd = raw.map((c) => (c === "bun" ? bun : c));
        mkdirSync(join(work, "tmp"), { recursive: true });
        const env = { ...process.env, TMPDIR: join(work, "tmp"), FLOW_NESTED: "", FLOW_RUN: "", FLOW_POOL: "", FLOW_LIMIT_MB: "", FLOW_ALONE: "", FLOW_SCRATCH: "", FLOW_VERDICTS_DIR: join(work, "verdicts-lock") };
        const child = Bun.spawn(["perl", "-e", `alarm ${p.seconds}; exec @ARGV`, "--", ...cmd], { cwd, stdin: "ignore", stdout: "pipe", stderr: "pipe", env });
        if (p.signal)
          setTimeout(() => {
            for (const d of descendants(child.pid)) tree.add(d.pid);
            seen.push(`tree ${tree.size}`);
            child.kill(p.signal!.name);
          }, p.signal.after * 1000);
        let phase: "none" | "seen" | "drained" = "none";
        let after = 0;
        const sampler = p.sample
          ? setInterval(() => {
              const n = descendants(child.pid).filter((d) => p.sample!.test(d.command)).length;
              if (phase === "none" && n > 0) phase = "seen";
              else if (phase === "seen" && n === 0) phase = "drained";
              if (phase === "drained") after = Math.max(after, n);
            }, 100)
          : undefined;
        let midDone = false;
        const watch = async (s: ReadableStream<Uint8Array>) => {
          let all = "";
          const dec = new TextDecoder();
          for await (const chunk of s) {
            all += dec.decode(chunk, { stream: true });
            if (p.midEdit && !midDone && p.midEdit.after.test(all)) {
              midDone = true;
              const [f, find, rep] = p.midEdit.edit;
              const text = readFileSync(join(work, f), "utf8");
              const next = text.replace(find, () => rep);
              writeFileSync(join(work, f), next);
              seen.push(next !== text ? "mid-edit applied" : "mid-edit did not apply");
            }
          }
          return all;
        };
        const [out, err] = await Promise.all([watch(child.stdout as ReadableStream<Uint8Array>), watch(child.stderr as ReadableStream<Uint8Array>)]);
        exit = await child.exited;
        if (sampler) {
          clearInterval(sampler);
          seen.push(`after the first drain, at most ${after}`);
        }
        for (const l of `${out}\n${err}`.split("\n")) if (p.lines.test(l)) seen.push(l.slice(0, 260));
        const v = out.split("\n").filter((l) => l.startsWith("VERDICT ")).at(-1);
        if (v)
          try {
            const vs = (JSON.parse(v.slice(8)) as { items: Array<{ name: string; outcome?: string; why?: string }> }).items;
            verdict = vs.map((i) => `${i.name}=${i.outcome ?? "noted"}${i.outcome && i.outcome !== "pass" && i.why ? `(${i.why.slice(0, 90)})` : ""}`).join("; ");
          } catch {
            verdict = "(not JSON)";
          }
        if (p.signal) {
          await Bun.sleep(1500);
          seen.push(`left ${[...tree].filter(alive).length}`);
        }
      }
    const left = killStrays(work);
    const ms = Math.round(performance.now() - t0);
    const lines = p.repeat ? [...[...new Set(seen.map((l) => l.replace(/[\d.]+ s|peak \d+ MB/g, "#")))].map((k) => `${seen.filter((l) => l.replace(/[\d.]+ s|peak \d+ MB/g, "#") === k).length} x ${k}`), `repeats ${p.repeat} of ${seen.filter((l) => l.startsWith("WATCH")).length} WATCH lines`] : seen;
    const observed = `exit ${exit}\n${lines.join("\n")}\nVERDICT ${verdict}`;
    const strayMiss = left > 0 && !(p.strays ? p.strays[side] : false) ? [`${left} stray process(es) left`] : [];
    const misses = missed ? [missed] : [...strayMiss, ...p.expect[side].filter((x) => (x instanceof RegExp ? !x.test(observed) : x.not.test(observed))).map((x) => (x instanceof RegExp ? `wanted ${x}` : `wanted no ${x.not}`))];
    items.push({ kind: "plant", name: `${p.id} ${side}`, outcome: misses.length ? "fail" : "pass", why: misses.join("; ").slice(0, 300), detail: { observed: observed.slice(0, 1500), strays: left } });
    console.log(`${misses.length ? "BAD " : "ok  "} ${p.id} ${side}  exit ${exit}  ${(ms / 1000).toFixed(1)} s${left ? `  (${left} stray process(es) killed)` : ""}${misses.length ? `  ${misses.join("; ")}` : ""}\n    ${lines.join("\n    ")}${verdict ? `\n    VERDICT ${verdict.slice(0, 400)}` : ""}`);
    rmSync(work, { recursive: true, force: true });
  }
  const out = arg("--out");
  if (out) writeFileSync(out, JSON.stringify(items, null, 1));
  return items;
});
