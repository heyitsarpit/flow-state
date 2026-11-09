// D132: a green must be able to go red. Every gate, on runtimes and copies known to be broken. Any that stays green fails this. bun falsify.ts --runtime ../round-10/adapter.ts [--quick]
// The other side, the same gates green on the real runtime, is run here too, at the same small depth, so a red below is about the breakage.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { stated } from "./verdicts/state.ts";

const SEARCH_EXPECT: Readonly<Record<string, string>> = {};
const SEARCH_STATES: Readonly<Record<string, string>> = { odd: "8000", session: "8000", chain: "12000" };
const SEARCH_REACH: Readonly<Record<string, { states: number; perDepth: readonly number[] }>> = {
  odd: { states: 7269, perDepth: [1, 22, 200, 1260, 5786] },
  session: { states: 6967, perDepth: [1, 17, 153, 1023, 5773] }, // OD53 (11) and migration round 2's dropAt rule (7,328 with round 2's sessions.ts undone; 6,896 before OD53)
  chain: { states: 9700, perDepth: [1, 12, 111, 995, 8581] },
};

await stated("falsify", async (scope) => {
const { MACHINE_MB, SCRIPT, SEARCH, SUITE } = await import("./limits.ts");
const { describe, outcome } = await import("./verdicts/read.ts");
const { final, job } = await import("./verdicts/runner.ts");
const { applyEdits, check, copyOf } = await import("./verdicts/snapshot.ts");
const { spawnRun } = await import("./verdicts/spawn.ts");
const { isScored } = await import("./verdicts/verdict.ts");
type Item = import("./verdicts/verdict.ts").Item;
type Reading = import("./verdicts/read.ts").Reading;
const here = import.meta.dir;
const argIdx = process.argv.indexOf("--runtime");
const runtimeArg = argIdx < 0 ? "../round-13/adapter.ts" : process.argv[argIdx + 1]!;
const runtime = resolve(here, runtimeArg);
const roundDir = dirname(runtime);
const tree = basename(roundDir);
const quick = process.argv.includes("--quick");
// Each part fits a 5-minute command. No `--part`: all of them.
const partArg = process.argv.indexOf("--part");
const part = (x: string) => partArg < 0 || process.argv[partArg + 1] === x;
const pi = process.argv.indexOf("--parallel");
const parallel = Math.min(8, Math.max(1, pi < 0 ? 1 : Number(process.argv[pi + 1]) || 1));
const bad: string[] = [];
const items: Item[] = [];
// A check reads finished runs only. A run the machine ended (a time kill, a memory kill near its limit, a signal, a broken contract) states
// nothing: the check is unknown, never a catch.
const say = (ok: boolean, what: string, detail = "", from: readonly Reading[] = []) => {
  const lost = from.filter((r) => r.answer === "none");
  if (lost.length) {
    console.log(`UNKN ${what}  ${describe(lost[0]!)}`);
    items.push({ kind: "check", name: what, outcome: "unknown", why: describe(lost[0]!) });
    return;
  }
  console.log(`${ok ? "ok  " : "BAD "} ${what}${detail ? `  ${detail}` : ""}`);
  if (!ok) bad.push(what);
  items.push({ kind: "check", name: what, outcome: ok ? "pass" : "fail", why: ok ? "" : detail.slice(0, 300) });
};
const runner = scope.runner({ slots: parallel, mb: Math.min(MACHINE_MB, parallel * SUITE.limits.mb), budgetS: null });
const run = async (gate: string, cmd: string[], env: Record<string, string> = {}, cwd = here, b = SUITE) =>
  final(await runner.run(job(`${gate} ${cmd.slice(1, 4).join(" ")}`, { gate, cmd, cwd, env, limits: b.limits, contract: "gate" }, b.size)));
const scored = (r: Reading) => (r.answer === "stated" ? r.verdict.items.filter(isScored) : []);
const cases = (r: Reading) => scored(r).filter((x) => x.kind === "case");
const outputs = new Map<Reading, Set<string>>();
const passedNames = (r: Reading) => {
  let bad = outputs.get(r);
  if (!bad) outputs.set(r, (bad = new Set(scored(r).filter((x) => x.kind === "output" && x.outcome !== "pass").map((x) => x.name))));
  return cases(r).filter((x) => x.outcome === "pass" && !bad.has(x.name)).map((x) => x.name);
};
const failLines = (r: Reading) => cases(r).filter((x) => x.outcome === "fail").map((x) => `${x.name}\t${x.why}`);
const tally = (r: Reading) => (r.answer === "stated" ? `${passedNames(r).length}/${cases(r).length} pass` : r.answer === "bound" ? "killed by memory" : "no verdict");
const red = (r: Reading) => r.answer === "bound" || (r.answer === "stated" && outcome(r) === "fail");
const lockOf = (r: Reading) => scored(r).find((x) => x.kind === "lock");
const unloggedIn = (r: Reading) => ((lockOf(r)?.detail as { unlogged?: readonly string[] } | undefined)?.unlogged ?? []) as readonly string[];
const searchOf = (r: Reading) => scored(r).find((x) => x.kind === "search")?.detail as { verdict?: string; failure?: string; deadActions?: readonly string[] } | undefined;

// ── The watchdog itself.
if (part("watch")) {
  const stop = new AbortController().signal;
  const launch = (cmd: string[], mb: number, seconds: number) => ({ gate: "watch", cmd, cwd: here, env: {}, limits: { mb, seconds }, contract: "tool" as const, run: "watch", referenceMb: null, pool: { slots: 1, mb }, alone: false });
  const a = await spawnRun(launch(["sh", "-c", `bun -e "const a=[];for(let i=0;i<40;i++)a.push(new Uint8Array(32e6).fill(1));await Bun.sleep(9000)" & wait`], 300, 30), { echo: false, stop });
  say(a.kind === "ended" && a.killed && a.decided === "rss", "watch: a grandchild's memory counts", a.kind === "ended" ? `killed ${a.decided}` : a.message);
  const b = await spawnRun(launch(["sh", "-c", "sleep 79 & wait"], 300, 1), { echo: false, stop });
  const left = Bun.spawnSync(["pgrep", "-fx", "sleep 79"], { stdin: "ignore" }).exitCode === 0;
  say(b.kind === "ended" && b.decided === "time" && !left, "watch: a kill ends the tree", left ? "left: sleep 79" : "");
  await spawnRun(launch(["sh", "-c", "sleep 78 & exit 0"], 300, 5), { echo: false, stop });
  const left2 = Bun.spawnSync(["pgrep", "-fx", "sleep 78"], { stdin: "ignore" }).exitCode === 0;
  say(!left2, "watch: an orphan after a normal exit is ended");
}

// ── The suite on broken runtimes.
const suite = (rt: string, env: Record<string, string> = {}, extra: string[] = []) =>
  run("suite", ["bun", "main.ts", "--round", "99", "--no-catalog", "--runtime", rt, ...extra], env);
// Stage J: `--part suite` is twelve suite runs, about 7 minutes. `suite1` (null, three broken), `suite2` (four broken) and `suite3` (the
// no-output oracles and `--only` of nothing) each fit a 5-minute command; `suite` is still all three.
const BROKEN = ["constantHash", "lyingFatal", "noEvidence", "noWaits", "bogusIssue", "lyingReplay", "junkDiskKey"];
const suitePart = (n: 1 | 2 | 3) => part("suite") || part(`suite${n}`);
if (suitePart(1)) {
  const n = await suite("./null-adapter.ts");
  const passed = passedNames(n);
  say(n.answer === "stated" && outcome(n) === "fail", "suite: red on null, with a verdict", tally(n), [n]);
  say(n.answer === "stated" && passed.length === 0, "suite: no case passes on no runtime", passed.join(" "), [n]);
}
for (const [i, k] of (quick ? BROKEN.slice(0, 2) : BROKEN).entries()) {
  if (!suitePart(i < 3 ? 1 : 2)) continue;
  const r = await suite("./broken-adapter.ts", { FLOW_BROKEN: k, FLOW_BROKEN_BASE: runtime });
  say(r.answer === "stated" && outcome(r) === "fail" && passedNames(r).length !== cases(r).length, `suite: red on ${k}`, tally(r), [r]);
}
if (suitePart(3)) {
  // A named oracle must see these too, not only the output: run with no output compare, and count.
  // The stated exceptions. A search keeps its own oracle. Three cases boot nothing: the seal refuses, and that is what they pin.
  const SEARCHES_OWN = ["SEARCH-ODD-SMALL", "SEARCH-ODD-ALL"];
  const NO_BOOT = ["REV7-M2/two-machines-under-one-id-is-an-error", "REV8-PINS/D77-a-closure-the-seal-does-not-know-is-an-error", "R10-RUNTIME/a-state-named-self-is-refused-at-the-seal"];
  for (const [k, allowed] of [["bogusIssue", [...SEARCHES_OWN, ...NO_BOOT]], ["lyingReplay", SEARCHES_OWN]] as const) {
    const r = await suite("./broken-adapter.ts", { FLOW_BROKEN: k, FLOW_BROKEN_BASE: runtime }, ["--no-output"]);
    const extra = passedNames(r).filter((p) => !(allowed as readonly string[]).includes(p));
    say(r.answer === "stated" && extra.length === 0, `oracles: every case sees ${k} (D130)`, extra.join(" "), [r]);
  }
}
if (suitePart(3)) {
  const r = await suite("./broken-adapter.ts", { FLOW_BROKEN: "x", FLOW_BROKEN_BASE: join(here, "null-adapter.ts") }, ["--only", "NOPE-99"]);
  say(red(r), "suite: --only of nothing is red", "", [r]);
}

// ── Searches: by their state budget and the verdict each states on the real runtime. Red on no runtime and on a constant hash means
// `failed` or `vacuous`, not merely not green.
const SEARCHES = ["pay", "like", "chain", "crash", "cross", "frag", "odd", "session", "repairing", "listen.version", "listen.none", "listen.version.noload", "listen.none.noload", "fragstore.row", "flush.bare.tight", "flush.serialize.directed", "flush.bare.capture"];
const EXPECT: Record<string, string> = Object.fromEntries(SEARCHES.map((w) => [w, SEARCH_EXPECT[w] ?? "completed"]));
const search = (w: string, rt: string, env: Record<string, string> = {}) =>
  run("search", ["bun", "search/run.ts", "--which", w, "--runtime", rt, "--depth", "4", "--states", SEARCH_STATES[w] ?? "4000", "--expect", EXPECT[w]!], env, here, SEARCH);
const redSearch = (r: Reading) => ["failed", "vacuous"].includes(searchOf(r)?.verdict ?? "");
if (part("search")) for (const w of quick ? SEARCHES.slice(0, 3) : SEARCHES) {
  const nul = await search(w, "../null-adapter.ts");
  say(redSearch(nul), `search ${w}: not green on null`, searchOf(nul)?.verdict ?? tally(nul), [nul]);
  const con = await search(w, "../broken-adapter.ts", { FLOW_BROKEN: "constantHash", FLOW_BROKEN_BASE: runtime });
  say(redSearch(con), `search ${w}: not green on a constant hash`, searchOf(con)?.verdict ?? tally(con), [con]);
  const real = await search(w, runtime);
  const dead = searchOf(real)?.deadActions?.join(" ");
  const reach = SEARCH_REACH[w];
  const got = searchOf(real) as { states?: number; perDepth?: readonly number[] } | undefined;
  const reached = reach === undefined || (got?.states === reach.states && JSON.stringify(got?.perDepth) === JSON.stringify(reach.perDepth));
  say(real.answer === "stated" && outcome(real) === "pass" && reached, `search ${w}: green on the real runtime`, `${searchOf(real)?.verdict ?? tally(real)}${dead ? ` dead: ${dead}` : ""}${reached ? "" : `, reached ${got?.states} states ${JSON.stringify(got?.perDepth)}, pinned ${JSON.stringify(reach)}`}`, [real]);
}

// ── Gates by tampering a copy: compare, the lock, the log. Each copy is of one snapshot taken here.
const snap = scope.snapshot([here, roundDir]);
let conf = "";
let round = "";
let closeCopy = () => {};
const reset = () => {
  closeCopy();
  const c = copyOf(snap, tree, []);
  if (c._tag === "Failure") throw new Error(c.failure);
  conf = c.success.tree("conformance");
  round = c.success.tree(tree);
  closeCopy = c.success.close;
};
const edit = (file: string, f: (s: string) => string) => {
  const t = readFileSync(file, "utf8");
  const n = f(t);
  if (n === t) throw new Error(`falsify: edit did nothing: ${file}`);
  writeFileSync(file, n);
};
const scratchSuite = (only: string) => run("suite", ["bun", "main.ts", "--round", "99", "--no-catalog", "--only", only, "--runtime", `../${tree}/adapter.ts`], {}, conf);
const checkWhy = (r: Reading) => scored(r).map((x) => x.why).join("\n");
try {
  if (part("tamper")) {
  reset();
  // Round 11 (D205): typed Pay lives in `conformance/typed/`, beside every typed fixture.
  edit(join(conf, "typed/pay.ts"), (s) => s.replace("target: S.CARD", "target: S.IDLE"));
  const t = await run("typed/compare.ts", ["bun", join(round, "typed/compare.ts")], {}, conf, SCRIPT);
  say(red(t), "typed compare: red on a changed target", "", [t]);
  // Round 11, review H2: the typed fixtures the suite boots are under the lock. A one-token change to one is red by the lock.
  reset();
  edit(join(conf, "typed/round7.ts"), (s) => s.replace("Go: { target: St.W,", "Go: { target: St.B,"));
  const ty = await scratchSuite("PAY-01");
  say(red(ty) && unloggedIn(ty).includes("file:typed/round7.ts"), "lock: a one-token change to a typed fixture is red", "", [ty]);

  // H4: weaken a case, paste the hash the run prints, into the lock. No log line.
  reset();
  edit(join(conf, "scenarios/pay.scenario.ts"), (s) => s.replace('c.eq("charges", c.r.truth().charges, 0);', ""));
  const h = await run("suite", ["bun", "main.ts", "--round", "99", "--no-catalog", "--only", "PAY-01", "--hashes", "--runtime", `../${tree}/adapter.ts`], {}, conf);
  let lock = readFileSync(join(conf, "expected.lock"), "utf8");
  const pasted = Object.entries(((lockOf(h)?.detail as { hashes?: Record<string, string> } | undefined)?.hashes ?? {}) as Record<string, string>);
  for (const [id, hh] of pasted) lock = lock.replace(new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} .*$`, "m"), () => `${id} ${hh}`);
  writeFileSync(join(conf, "expected.lock"), lock);
  const after = await scratchSuite("PAY-01");
  say(pasted.length > 0 && red(after) && unloggedIn(after).length > 0, "lock: a pasted hash with no log line is red", "", [h, after]);

  // H5: a removed newline lets a comment swallow an oracle.
  reset();
  // Found by the oracle it swallows, not by the comment's words, which change.
  edit(join(conf, "scenarios/ctx.ts"), (s) => s.replace(/(\/\/[^\n]*)\n(\s*if \(!q\.idle\) throw)/, "$1 $2"));
  const j = await scratchSuite("PAY-01");
  say(red(j) && unloggedIn(j).length > 0, "lock: a comment swallowing an oracle is red", "", [j]);

  // A bulk reason: the same reason on more than three lines.
  reset();
  const ids = ["PAY-01", "PAY-02", "PAY-03", "PAY-04"];
  edit(join(conf, "expected-changes.log"), (s) => s + ids.map((i) => `${i} hash:000000000000 | same words\n`).join(""));
  const k = await scratchSuite("PAY-01");
  say(red(k), "log: a line whose hash is not the current one is red", "", [k]);
  // Re-check M2''' (stage F): the reference model is under the lock. The re-check's one-token tamper is red by the lock.
  reset();
  edit(join(conf, "reference/model.ts"), (s) => s.replace('if (o.fragment === undefined) return "yes";', 'if (o.fragment === undefined) return "unknown";'));
  const rf = await scratchSuite("PAY-01");
  say(red(rf) && unloggedIn(rf).includes("file:reference/model.ts"), "lock: a one-token change to reference/model.ts is red", "", [rf]);
  // Re-audit H2: D91's type pins. A directive removed and its refusal widened with `as any` compiles; the check and the lock must both see it.
  const typesCheck = () => run("checks/types-check.ts", ["bun", join(round, "checks/types-check.ts")], {}, conf, SCRIPT);
  reset();
  edit(join(round, "typed/type-tests.ts"), (s) => s.replace(/\/\/ @ts-expect-error a key names a field that is not the input's\n(.*)key: \["b"\],/, '$1key: ["b"] as any,'));
  const widened = await typesCheck();
  say(red(widened), "types: a pin removed with its refusal widened is red", "", [widened]);
  const w = await scratchSuite("PAY-01");
  say(red(w) && unloggedIn(w).includes("round:typed/type-tests.ts"), "lock: a type-only change to typed/ is red", "", [w]);
  reset();
  edit(join(round, "typed/type-tests.ts"), (s) => s.replace("// @ts-expect-error a key names a field that is not the input's\n", ""));
  const d = await typesCheck();
  say(red(d) && /tsc exit/.test(checkWhy(d)), "types: a refusal with no directive fails tsc", "", [d]);
  // Re-check M1', D156: the directive's words moved into a comment that only mentions them, and its refusal widened. The count is kept; the words are not.
  reset();
  edit(join(round, "typed/type-tests.ts"), (s) => s.replace(/\/\/ @ts-expect-error a key names a field that is not the input's\n(.*)key: \["b"\],/, '// see the @ts-expect-error notes below\n$1key: ["b"] as any,'));
  const moved = await typesCheck();
  say(red(moved) && /no @ts-expect-error directive pins: a key names/.test(checkWhy(moved)), "types: a directive turned into a mention is red, by its words", "", [moved]);
  // Re-check L1: a typo under a kept directive. The directive and its words stay; its line now errors for the typo, not its refusal.
  reset();
  edit(join(round, "typed/type-tests.ts"), (s) => s.replace('key: ["b"], concurrency: "reject"', 'key: ["a"], concurrency: "rejct"'));
  const typo = await typesCheck();
  say(red(typo) && /errors for something else/.test(checkWhy(typo)), "types: a typo under a kept directive is red, by its error", "", [typo]);
  reset();
  const tc = await typesCheck();
  say(tc.answer === "stated" && outcome(tc) === "pass", "control: the types check is green untampered", outcome(tc) === "pass" ? "" : describe(tc), [tc]);
  // A green control in the same copy, so the reds above are about the tamper.
  reset();
  const ctl = await scratchSuite("PAY-01");
  say(ctl.answer === "stated" && outcome(ctl) === "pass", "control: the copy is green untampered", outcome(ctl) === "pass" ? "" : describe(ctl), [ctl]);
  }
  // ── Re-audit H1, M3: named oracles alone (`--no-output`) must kill these, each in at least `min` cases.
  if (part("mutants")) {
  const { MUTANTS } = (await import(join(roundDir, "mutants-r10.ts"))) as { MUTANTS: ReadonlyArray<{ id: string; edits: ReadonlyArray<readonly [string, string, string]> }> };
  const laundered = MUTANTS.find((m) => m.id === "g125.laundered-as-evidence")!;
  const NAMED: ReadonlyArray<readonly [string, ReadonlyArray<readonly [string, string, string]>, number]> = [
    [laundered.id, laundered.edits, 2],
    ["step.timer-fence-off", [["step.ts", "if (!t || t.gen !== i.gen) return", "if (!t) return"]], 1],
    ["step.dispose-reads-not-aborted", [["step.ts", "    tx.commands.push({ k: \"interrupt\", attempt: k, send: r.gen });\n    note(tx, \"Superseded\", { op: r.op, attempt: k, send: r.gen });\n  }\n  tx.w = { ...tx.w, reads: {} };", "    note(tx, \"Superseded\", { op: r.op, attempt: k, send: r.gen });\n  }\n  tx.w = { ...tx.w, reads: {} };"]], 1],
    // Stage I (re-check 10h T1): the runtime's own branch for a memory with no restore. The suite no longer adds one, so the branch runs.
    // Round 12 (D214): that branch is gone, since every sealed memory has a restore; the class now sits on `legacy.ts`'s identity restore for hand data.
    ["h.restore-absent-lost", [["../conformance/legacy.ts", "restore: m.restore ?? { run: (stored: object) => stored,", "restore: m.restore ?? { run: () => ({}),"]], 1],
  ];
  for (const [id, edits, min] of NAMED) {
    reset();
    // As mutate.ts reads a find: whitespace-insensitive, so `vp fmt` does not rot the list.
    for (const [f, find, rep] of edits) edit(join(round, f), (s) => applyEdits(s, find, rep) ?? s);
    const r = await run("suite", ["bun", "main.ts", "--round", "99", "--no-catalog", "--no-output", "--runtime", `../${tree}/adapter.ts`], {}, conf);
    const named = cases(r).filter((x) => x.outcome === "fail").map((x) => x.name);
    say(r.answer === "stated" && named.length >= min, `mutant ${id}: killed by named oracles in ${min}+ case(s)`, `${named.length}: ${named.slice(0, 4).join(" ")}`, [r]);
  }
  // Phase 1 E round 3: a search oracle has its own wrong runtime, red by that oracle's words, so the oracle is shown able to fail.
  const { MUTANTS: S1B } = (await import(join(roundDir, "mutants-audit-s1b.ts"))) as { MUTANTS: ReadonlyArray<{ id: string; edits: ReadonlyArray<readonly [string, string, string]> }> };
  const SEARCH_KILLS: ReadonlyArray<readonly [string, string, ReadonlyArray<readonly [string, string, string]>, string]> = [
    ["like", "drain.old-base-wins", [["entities.ts", "base: how === \"replace\" ? fields : { ...r.base, ...fields },", "base: how === \"replace\" ? fields : { ...fields, ...r.base },"]], "drain: "],
    // Audit 2: the drain no longer skips a row the runtime calls uncertain. This runtime keeps a given-up mark uncertain after its read.
    ["like", "drain.uncertain-forever", [["entities.ts", "const uncertain = marks.some((m) => !m.quiet) || r.doubt !== undefined;", "const uncertain = marks.length > 0 || r.doubt !== undefined;"]], "drain: r"],
    // Audit 3: the drain skipped a row the runtime reports absent. This runtime keeps a given-up mark uncertain and hides every uncertain row.
    ["like", "drain.row-hidden", [["entities.ts", "const uncertain = marks.some((m) => !m.quiet) || r.doubt !== undefined;", "const uncertain = marks.length > 0 || r.doubt !== undefined;"], ["entities.ts", "if (r.base === undefined && !predicted && !uncertain && r.queue.length === 0) return undefined;", "if ((r.base === undefined && !predicted && !uncertain && r.queue.length === 0) || uncertain) return undefined;"]], "drain: r1 has no row"],
    // Audit 3b: the drain compared a row's value only when it had one. This runtime reports an uncertain record as a settled row with no data.
    ["like", "drain.row-empty", [["entities.ts", "const uncertain = marks.some((m) => !m.quiet) || r.doubt !== undefined;", "const uncertain = marks.length > 0 || r.doubt !== undefined;"], ["entities.ts", "  return { data, predicted, uncertain, unconfirmed };", "  return uncertain ? { predicted: false, uncertain: false, unconfirmed: [] } : { data, predicted, uncertain, unconfirmed };"]], "drain: r1 shows undefined"],
    ["like", "s13.older-sent-after-newer", [["lane.ts", "    for (const x of l.w) supersede(tx, a.op, x);\n    setLane(tx, { ...tx.w.lanes[l.id]!, w: [made.attempt] });", "    setLane(tx, { ...tx.w.lanes[l.id]!, w: [made.attempt, ...l.w] });"]], "S13: "],
    // Streams round 2: rule 70's oracle no longer switches off at the runtime's first `ReleaseOverdue` (audit S1's lie: no wait, and the word at every close).
    ["session", "lie:s1.overdue-excuse", [["sessions.ts", "Object.values(s.closing).some((c) => c.actor === actor && c.slot === slot);", "false;"], ["sessions.ts", '  cx.command({ k: "close", conn: x.conn });\n  cx.arm(`overdue/', '  cx.command({ k: "close", conn: x.conn });\n  cx.note("ReleaseOverdue", { op: x.op });\n  cx.arm(`overdue/']], "rule 70: "],
    // Rule 71's disk check reads every entry: this runtime saves a bookmark one past the value it delivered.
    ["session", "r71.bookmark-ahead", [["sessions.ts", "writeMark(cx, x, { at: at ?? b?.at, filled: b?.filled ?? false }); // T3", "writeMark(cx, x, { at: (at as any)?.seq !== undefined ? { ...(at as object), seq: (at as any).seq + 1 } : (at ?? b?.at), filled: b?.filled ?? false }); // T3"]], "rule 71: "],
    // Audit S1b's three lies that passed SEARCH-SESSION: rule 70 now keys by the contract's key, rule 71 reads the `from` each connection was
    // asked to resume from (not the runtime's saved layout), and another epoch must be one a reset the suite pushed named.
    ...([["lie:s1b.r70-input-nonce", "rule 70: "],["lie:s1b.r71-hidden-mark", "rule 71: "], ["lie:s1b.r71-any-epoch", "rule 71: "]] as const).map(([id, words]) => ["session", id, S1B.find((m) => m.id === id)!.edits, words] as const),
    // The Repairing oracle trusted the runtime's `inFlight`/`queued`, and `idle`'s deadline always counted as a wake. This runtime never asks for
    // the next page after `more` and says a delivery is in flight.
    ["repairing", "lie:s1c.repair-wedge-says-inflight", [["sessions.ts", "return pump(s, { ...y, emptyRun, wantNext: { next: a.next } }, spec, cx);", "return pump(s, { ...y, emptyRun }, spec, cx);"], ["sessions.ts", "inFlight: x.inFlight !== undefined,", 'inFlight: x.inFlight !== undefined || x.st === "Repairing",']], "Repairing with no read"],
  ];
  for (const [w, id, edits, words] of SEARCH_KILLS) {
    reset();
    for (const [f, find, rep] of edits) edit(join(round, f), (s) => applyEdits(s, find, rep) ?? s);
    const r = await run("search", ["bun", "search/run.ts", "--which", w, "--runtime", join(round, "adapter.ts"), "--depth", "4", "--states", SEARCH_STATES[w] ?? "4000", "--expect", "completed"], {}, conf, SEARCH);
    const why = String((searchOf(r) as { failure?: string } | undefined)?.failure ?? "");
    say(r.answer === "stated" && searchOf(r)?.verdict === "failed" && why.startsWith(words), `search mutant ${id}: ${w} red by its \`${words.trim()}\` oracle`, why || tally(r), [r]);
  }
  }
  // ── D155: lying runtimes, a standing part. For each self-report an oracle reads (convergence-10's inventory), a runtime that says it falsely
  // must go red by the named oracle, with no output compare. From the re-check of stage C (`conformance-audit/recheck10c-scripts/run-mut.ts`).
  if (part("lies")) {
    const G125 = "const a = getActor(tx.w.actors, item.actor); const lane = tx.w.lanes[laneId];";
    const other = (extra: string) => `${G125} if (item.ending.ch !== "success" && [...tx.w.mail].some((x) => x.actor !== item.actor)) { ${extra} return note(tx, "evidenceOnly", { op: item.op, attempt: item.attempt ?? "" }); }`;
    const when = (cond: string, extra: string) => `${G125} if (a && ${cond}) { ${extra} return note(tx, "evidenceOnly", { op: item.op, attempt: item.attempt ?? "" }); }`;
    const REL = 'note(tx, "Released", { op: item.op, attempt: item.attempt ?? "" });';
    const LIKE2NC = 'item.ending.ch !== "success" && item.op === "like" && String(item.attempt).endsWith("-2") && (item.ending as any).value?.why !== "Cancelled"';
    // [id, self-report lied about, edits, the named oracle's mark in a FAIL line]
    const LIES: ReadonlyArray<readonly [string, string, ReadonlyArray<readonly [string, string, string]>, string]> = [
      ["lie.evidence-only", "evidenceOnly", [["turn.ts", G125, other("")]], "(j)"],
      ["lie.released", "Released", [["turn.ts", G125, other(REL)]], "(j)"],
      ["lie.lane-cell", "lane.release.* cell", [["turn.ts", G125, other('note(tx, "lane", { cell: "lane.release.busy", op: item.op, attempt: item.attempt ?? "" });')]], "(j)"],
      ["lie.lane-cell-noatt", "lane.release.* cell, no attempt", [["turn.ts", G125, other('note(tx, "lane", { cell: "lane.release.busy", op: item.op });')]], "(j)"],
      ["lie.like2nc-released", "Released, narrowest", [["turn.ts", G125, when(LIKE2NC, REL)]], "(j)"],
      ["lie.save-released", "Released, keyed rows", [["turn.ts", G125, when('item.ending.ch !== "success" && item.op === "save"', REL)]], "(j)"],
      ["lie.settled-superseded", "Superseded, a settled head", [["lane.ts", "  settleHead(tx, next, final);", '  note(tx, "Superseded", { op: next.op, attempt: next.head?.id }); setLane(tx, next);']], "(j)"],
      // Round 15b: oracle (h) took any cancel alternative on the ending's event as the cause, whatever its guard. R15Late's Unsure cancels only while
      // `cancelling`; this runtime releases the hold at admission all the same, a key the server may hold with no head on disk.
      ["lie.held-released-unguarded", "Released, a hold whose handler's cancel is guarded out", [["lane.ts", 'hold(tx, l) { setLane(tx, { ...l!, head: { ...l!.head!, phase: { t: "held" } } }); },', 'hold(tx, l) { setLane(tx, { ...l!, head: { ...l!.head!, phase: { t: "held" } } }); if (l!.machine === "Lab/R15Late") release(tx, tx.w.lanes[l!.id]!); },']], "(h)"],
      // Phase 1 (R11): oracle (h)'s turn-end exemption took the runtime's `HeldThisTurn` note as the cause. This runtime notes it and releases an
      // unknown re-sent in its own turn (the key may be at the server, and the re-send is gone with no head on disk).
      ["lie.turn-end-after-a-resend", "lane.turnEnd.HeldThisTurn, a re-sent unknown", [["lane.ts", "l.head.id !== attempt || l.head.phase.t !== \"held\" ||", "l.head.id !== attempt ||"]], "(h)"],
      // Audit 1b: the self-release cause took the runtime's `lane.cancel.Held` cell as proof the handler's cancel ran. This runtime releases every
      // restored hold after its restored delivery and says that cell, whether or not a cancel ran (the auditor's `lie:1b.self-release-faked`).
      // Audit 3: `runtimeDisposed` was never cleared at a reload, so a later process's `DisposeStart` turned the ledger off. This runtime drops a held
      // head's restored ending at boot and says `DisposeStart` instead (the auditor's `lie:a3.boot-says-disposed`).
      ["lie.boot-says-disposed", "DisposeStart at a boot, a restored ending dropped", [["durable.ts", "mail(tx, l, h, ending, true, !h.held);", 'if (h.held) note(tx, "DisposeStart", {}); else mail(tx, l, h, ending, true, !h.held);']], "(j)"],
      // Audit 3b: `ledgerOff` outlived the disposal's process. This runtime drops a held head's restored ending at boot and says nothing.
      ["lie.boot-drops-held", "a held head's restored ending dropped at boot, after an earlier disposal", [["durable.ts", "mail(tx, l, h, ending, true, !h.held);", "if (!h.held) mail(tx, l, h, ending, true, !h.held);"]], "(j)"],
      ["lie.self-release-faked", "lane.cancel.Held, a restored hold no cancel released", [["turn.ts", 'if (ran && item.ending.ch === "unknown") endHeldThisTurn(tx, item.attempt);', 'if (ran && item.ending.ch === "unknown") { endHeldThisTurn(tx, item.attempt); const sl = tx.w.lanes[tx.w.byAttempt[item.attempt ?? ""] ?? ""]; if (item.restored && sl?.head?.id === item.attempt && sl.head.phase.t === "held") cell(tx, "cancel", sl, argsOf(sl)); }']], "(h)"],
      // Phase 1 (R11): `replacedUnderCancel` read an op's policy by its name across every fixture. Beside R15Switch's `search` (cancel), this runtime
      // replaces P1Latest's `search` (latest) head on the wire as `cancel` would: the replaced Attempt's ending reaches nobody.
      ["lie.latest-as-cancel-by-name", "interruptedBy, a latest op named as a cancel op", [["lane.ts", "    if (policy === \"cancel\") return replaceHead(tx, l!, a);", "    if (policy === \"cancel\" || a.machine === \"Lab/P1Latest\") return replaceHead(tx, l!, a);"]], "(j)"],
      // Audit 1 (item 5): `replacedUnderCancel` took the runtime's `mint` evidence of a newer Attempt as the cause. This runtime says a newer `search`
      // (cancel) was minted and makes the delivered success evidence; no newer Attempt was ever sent, which the suite sees at the fake.
      ["lie.fake-newer-mint-under-cancel", "mint, a newer Attempt never sent", [["turn.ts", G125, when('item.op === "search" && item.ending.ch === "success"', 'note(tx, "mint", { op: item.op, attempt: `${String(item.attempt)}-newer`, mint: 1e9 });')]], "(j)"],
      ["lie.serialize-as-latest", "Superseded, a serialize queue", [["lane.ts", 'if (policy === "latest") { for (const x of l.w) supersede(tx, a.op, x);', 'if (policy === "latest" || policy === "serialize") { for (const x of l.w) supersede(tx, a.op, x);']], "(j) superseded"],
      ["lie.dispose-start", "DisposeStart, no dispose", [["turn.ts", G125, other('note(tx, "DisposeStart", {});')]], "(j) DisposeStart"],
      ["lie.settled-released", "Released, a settled head (checkMints)", [["lane.ts", "  settleHead(tx, next, final);", '  note(tx, "Released", { op: next.op, attempt: next.head?.id }); setLane(tx, next);']], ""], // (j) runs first and sees it; `checkMints` behind it
      ["lie.letgo-all-parked-on-cancel", "ParkedLetGo", [["lane.ts", 'for (const p of l.parked) if (p.kept) note(tx, "KeptLetGo", { op: l.op, attempt: p.attempt ?? "" }); return withParked(tx, l, l.parked.filter((p) => !p.kept));', 'for (const p of l.parked) note(tx, p.kept ? "KeptLetGo" : "ParkedLetGo", { op: l.op, attempt: p.attempt ?? "" }); return withParked(tx, l, []);']], ""],
    ];
    // Stage E: every lie of the stage D re-check (`conformance-audit/recheck10d-scripts/run-mut.ts`), as it wrote them.
    const at = (cond: string, body: string) => `${G125} if (a && ${cond}) { ${body} }`;
    const EO = 'return note(tx, "evidenceOnly", { op: item.op, attempt: item.attempt ?? "" });';
    const SAVE = 'item.ending.ch !== "success" && item.op === "save"';
    const FAIL = 'item.ending.ch !== "success"';
    const SAMEMAIL = '[...tx.w.mail].some((x: any) => x.actor === item.actor && !(x.k === "ending" && x.attempt === item.attempt))';
    const DELIV = 'note(tx, "delivered", { op: item.op, attempt: item.attempt ?? "", event: "x" }); return;';
    const UNMAP = 'note(tx, "delivered", { op: item.op, attempt: item.attempt ?? "", event: "x" }); return issue(tx, { code: "UnmappedEnding", origin: `${a.machine} operations.${item.op}`, input: item.ending });';
    const PARK = "return parkEnding(tx, item, lane, subject, a.machine);";
    const MINT = 'note(tx, "mint", { op: a.op, attempt: attempt.id, mint: attempt.mint });';
    const NOTEEND = "export const noteEnding = (tx: Tx, a: { op: string; attempt?: string; send?: string }, e: Ending) =>";
    const PROBE = 'issue(tx, { code: "ProbeFired", origin: "probe", input: item.op });';
    type Edits = ReadonlyArray<readonly [string, string, string]>;
    // A lie whose trigger fires in no case is vacuous: it is run, and if it stays green its probe (the same trigger, saying so) must fire nowhere.
    const vacuous = new Map<string, Edits>([
      ["d154.moved-save-released", [["turn.ts", G125, at(`${SAVE} && ${SAMEMAIL}`, PROBE)]]],
      // Stage I: `d154.event-fail-released` and `d154.event-like-released` are retired. Their trigger (a failure ending taken while its owner
      // has a `send` in mail) needs a host yield between the ending's enqueue and its turn with a send injected to that owner; the pump drains
      // an input's mail before it returns, and no case injects one there. A lie that cannot fire proves nothing (re-check 10h). Owed in revisit.
    ]);
    const LIES10D: ReadonlyArray<readonly [string, string, Edits, string]> = [
      ["h1.like2nc-released", "Released (10d)", [["turn.ts", G125, at(LIKE2NC, REL + EO)]], "(j)"],
      ["h1.like2nc-plain", "evidenceOnly (10d)", [["turn.ts", G125, at(LIKE2NC, EO)]], "(j)"],
      ["h1.save-released", "Released, save (10d)", [["turn.ts", G125, at(SAVE, REL + EO)]], "(j)"],
      ["h1.second-released", "Released, second sends (10d)", [["turn.ts", G125, at(`${FAIL} && String(item.attempt).endsWith("-2")`, REL + EO)]], "(j)"],
      ["h1.unknown-released", "Released, unknowns (10d)", [["turn.ts", G125, at('item.ending.ch === "unknown"', REL + EO)]], "(j)"],
      ["h1.lanecell-noatt-like2nc", "lane cell, no attempt (10d)", [["turn.ts", G125, at(LIKE2NC, 'note(tx, "lane", { cell: "lane.release.busy", op: item.op });' + EO)]], "(j)"],
      ["d154.moved-fail-released", "owner moved, every failure (M1'')", [["turn.ts", G125, at(`${FAIL} && ${SAMEMAIL}`, REL + EO)]], "(j)"],
      ["d154.moved-like-released", "owner moved, SURV-03 (M1'')", [["turn.ts", G125, at(`${FAIL} && item.op === "like" && ${SAMEMAIL}`, REL + EO)]], "(j)"],
      ["d154.moved-save-released", "owner moved, save", [["turn.ts", G125, at(`${SAVE} && ${SAMEMAIL}`, REL + EO)]], "(j)"],
      ["a1.ghost-like2", "A1 a ghost turn", [["lane.ts", MINT, `if (a.op === "like" && String(attempt.id).endsWith("-2")) note(tx, "turn", { actor: "ghost/none", event: "x", from: "a", to: "a" }); ${MINT}`], ["turn.ts", G125, at(LIKE2NC, EO)]], "(j)"],
      ["a1.ghost-save", "A1 a ghost turn, save", [["lane.ts", MINT, `if (a.op === "save") note(tx, "turn", { actor: "ghost/none", event: "x", from: "a", to: "a" }); ${MINT}`], ["turn.ts", G125, at(SAVE, EO)]], "(j)"],
      ["a2.deliv-like2nc", "A2 delivered", [["turn.ts", G125, at(LIKE2NC, DELIV)]], "(j)"],
      ["a2.deliv-save", "A2 delivered, save", [["turn.ts", G125, at(SAVE, DELIV)]], "(j)"],
      ["a2.deliv-fail-samemail", "A2 delivered, owner has mail", [["turn.ts", G125, at(`${FAIL} && ${SAMEMAIL}`, DELIV)]], "(j)"],
      ["a3.park-like2nc", "A3 parked on a live bound owner (H1'')", [["turn.ts", G125, at(LIKE2NC, PARK)]], "(j)"],
      ["a3.park-save", "A3 parked, save", [["turn.ts", G125, at(SAVE, PARK)]], "(j)"],
      ["a4.refused-fence", "A4 retry dropped, fence", [["turn.ts", "enqueue(tx, { ...rest, redelivered: true });", 'note(tx, "fence", {});']], "(j)"],
      ["a4.refused-denied", "A4 retry dropped, Denied", [["turn.ts", "enqueue(tx, { ...rest, redelivered: true });", 'note(tx, "Denied", { event: tag });']], "(j)"],
      ["a5.unmapped-like2nc", "A5 UnmappedEnding", [["turn.ts", G125, at(LIKE2NC, UNMAP)]], ""],
      ["a5.unmapped-save", "A5 UnmappedEnding, save", [["turn.ts", G125, at(SAVE, UNMAP)]], ""],
      ["a6.abandoned-like2", "A6 AbandonedFiber", [["world.ts", NOTEEND, `${NOTEEND} (a.op === "like" && String(a.attempt).endsWith("-2") && e.ch !== "success") ? note(tx, "AbandonedFiber", { op: a.op, attempt: a.attempt, send: a.send }) :`], ["turn.ts", G125, at('item.ending.ch !== "success" && item.op === "like" && String(item.attempt).endsWith("-2")', "return;")]], ""],
      ["a6.abandoned-save", "A6 AbandonedFiber, save", [["world.ts", NOTEEND, `${NOTEEND} (a.op === "save" && e.ch !== "success") ? note(tx, "AbandonedFiber", { op: a.op, attempt: a.attempt, send: a.send }) :`], ["turn.ts", G125, at(SAVE, "return;")]], ""],
    ];
    // Stage F: the stage E re-check's lies (`conformance-audit/re-check-round-10e.md`), as it wrote them, and one only (ref) can see.
    const FRAG = "tx.machines[a.machine]?.ops[item.op]?.fragment !== undefined";
    const KEYED = `Object.values(tx.machines[a.machine]!.nodes).some((n: any) => [...(n.placements ?? []), ...(n.subroutine ? [n.subroutine] : [])].some((p: any) => p.fragment === tx.machines[a.machine]!.ops[item.op]?.fragment && (p.each || p.resetOn)))`;
    const FAN = `(() => { let n = 0; walkIncs(a.root, (i: any) => { if (i.frag === tx.machines[a.machine]!.ops[item.op]?.fragment && !i.frozen) n++; }); return n >= 2; })()`;
    const FIRST = `(() => { let s: any; walkIncs(a.root, (i: any) => { if (i.frag === tx.machines[a.machine]!.ops[item.op]?.fragment && !i.frozen) s ??= i.subject; }); return s ?? subject; })()`;
    const BIND = "const path = bindingOf(tx, a, item.op, subject);";
    const LIES10F: ReadonlyArray<readonly [string, string, Edits, string]> = [
      ["e2.subject-fan-fail-att", "the copy: a failure to the first of 2+ copies (H1''')", [["turn.ts", BIND, `const path = item.attempt && ${FAIL} && ${FAN} ? bindingOf(tx, a, item.op, ${FIRST}) : bindingOf(tx, a, item.op, subject);`]], "(j) delivered to the wrong recipient"],
      ["e2.subject-fan-att", "the copy: every ending to the first of 2+ copies", [["turn.ts", BIND, `const path = item.attempt && ${FAN} ? bindingOf(tx, a, item.op, ${FIRST}) : bindingOf(tx, a, item.op, subject);`]], "(j) delivered to the wrong recipient"],
      ["e1.park-keyed", "parked, keyed copies (M1''')", [["turn.ts", G125, at(`${FRAG} && ${KEYED}`, PARK)]], "(j) parked"],
      ["e1.park-keyed-fan-att", "parked, keyed, 2+ copies, attempts (M1''')", [["turn.ts", G125, at(`item.attempt && ${FRAG} && ${KEYED} && ${FAN}`, PARK)]], "(j) parked"],
      ["a3p.park-decline", "a decline parked on its live owner (M1''')", [["turn.ts", G125, at("!item.attempt", PARK)]], "(j) a decline parked"],
      ["a4p.refused-turn", "A4' a false turn pays a refusal", [["turn.ts", "enqueue(tx, { ...rest, redelivered: true });", 'note(tx, "turn", { actor: item.actor, event: tag, from: "a", to: "a" });']], "(j) refused once"],
      ["ref.binding-first-copy", "the runtime's `binding` ignores the subject; delivery is right", [["adapter.ts", "return r && bindingIn(byId, r, op, subject);", "return r && bindingIn(byId, r, op, []) !== undefined ? bindingIn(byId, r, op, []) : r && (() => { let s: any; walkIncs(r.root, (i: any) => { if (i.frag === byId[r.machine]!.ops[op]?.fragment && !i.frozen) s ??= i.subject; }); return s ? bindingIn(byId, r, op, s) : bindingIn(byId, r, op, subject); })();"], ["adapter.ts", 'import { bindingIn } from "./turn.ts";', 'import { bindingIn } from "./turn.ts"; import { walkIncs } from "./inc.ts";']], "(ref) binding with subject"],
    ];
    // Stage G: the stage F re-check's lies (`conformance-audit/recheck10f-scripts/run-mut.ts`). Each is red by the observed recipient, not
    // by anything the runtime says of the delivery: the wrong actor with `at: []` said truthfully, and the wrong copy with the right `at`.
    const WA = (cond: string) => `const a0 = getActor(tx.w.actors, item.actor); const other = a0 && item.attempt && ${cond} ? (tx.w.actors as any).flat().filter(Boolean).flatMap((b: any) => Object.values(b)).find((x: any) => x.machine === a0.machine && x.key !== a0.key) : undefined; const a = other ?? a0; const lane = tx.w.lanes[laneId];`;
    const RUNT = "runTurn(tx, a, path, ev, start, late, item);";
    const FIRSTPATH = `(() => { let s: any; walkIncs(a.root, (i: any, p: any) => { if (i.frag === tx.machines[a.machine]!.ops[item.op]?.fragment && !i.frozen) s ??= p; }); return s ?? path; })()`;
    const FAN3 = `(() => { let n = 0; walkIncs(a.root, (i: any) => { if (i.frag === tx.machines[a.machine]!.ops[item.op]?.fragment && !i.frozen) n++; }); return n >= 3; })()`;
    // A decline parked on one actor, let go when ANOTHER actor of the batch takes a turn (re-check: a decline's let-go by any actor's move).
    const WALK = "const w = newWalk(tx, a, item, late);";
    const LETGO_OTHERS = `for (const l of Object.values(tx.w.lanes) as any[]) if (l && l.actor !== a.key && l.parked.some((p: any) => !p.attempt)) { for (const p of l.parked) if (!p.attempt) note(tx, "ParkedLetGo", { op: l.op, attempt: "" }); setLane(tx, { ...l, parked: l.parked.filter((p: any) => p.attempt) }); } ${WALK}`;
    const LIES10G: ReadonlyArray<readonly [string, string, Edits, string]> = [
      ["e8.wa-unknown", "the actor: an unknown ending runs in another live actor of the machine (H1'''')", [["turn.ts", G125, WA('item.ending.ch === "unknown"')]], "(j) delivered to the wrong recipient"],
      ["e8.wa-failure", "the actor: a failure ending runs in another live actor (H1'''' twin)", [["turn.ts", G125, WA('item.ending.ch === "failure"')]], "(j) delivered to the wrong recipient"],
      ["e5.at-intent-fail", "the copy: a failure runs in the first of 2+ copies, `at` names the right one (M1'''')", [["turn.ts", RUNT, `runTurn(tx, a, item.attempt && ${FAIL} && ${FAN} ? ${FIRSTPATH} : path, ev, start, late, item);`]], "(j) delivered to the wrong recipient"],
      ["e5.at-intent-fail-3", "the copy: the same, with 3+ copies", [["turn.ts", RUNT, `runTurn(tx, a, item.attempt && ${FAIL} && ${FAN3} ? ${FIRSTPATH} : path, ev, start, late, item);`]], "(j) delivered to the wrong recipient"],
      ["g.decline-letgo-other-actor", "a parked decline let go on another actor's turn", [["turn.ts", WALK, LETGO_OTHERS]], "(j) parked, and no wait says so"],
    ];
    // Stage H: the stage G re-check's lies (`conformance-audit/re-check-round-10g.md`), as it wrote them, and the stolen send it reasoned about.
    // An ending that ALSO runs in another actor or copy (one `delivered` said), in an actor whose memory equals the owner's, or in an actor
    // the suite itself sent work to in the same batch. Each is red by conservation: a handler run nothing accounts for.
    const ACTORS = "(tx.w.actors as any).flat().filter(Boolean).flatMap((b: any) => Object.values(b))";
    const WAX = (when: string, cond: string) => `const a0 = getActor(tx.w.actors, item.actor); const other = a0 && item.attempt && ${when} ? ${ACTORS}.find((x: any) => x.machine === a0.machine && x.key !== a0.key && ${cond}) : undefined; const a = other ?? a0; const lane = tx.w.lanes[laneId];`;
    const DUPFIND = "if (!path) return parkEnding(tx, item, lane, subject, a.machine); deliver(tx, a, path, item);";
    const MEMEQ = "JSON.stringify(x.root.memory) === JSON.stringify(a0.root.memory)";
    const LIES10H: ReadonlyArray<readonly [string, string, Edits, string]> = [
      ["q3.dup-other", "an ending runs in its owner and again in another live actor (H1⁵)", [["turn.ts", DUPFIND, `${DUPFIND} { const o = item.attempt ? ${ACTORS}.find((x: any) => x.machine === a.machine && x.key !== a.key) : undefined; const p2 = o && bindingOf(tx, o, item.op, subject); if (o && p2) deliver(tx, o, p2, { ...item, redelivered: true, kept: false } as any); }`]], "(j) a handler run nothing accounts for"],
      ["q3.dup-copy", "an ending runs in its copy and again in another copy (H1⁵)", [["turn.ts", RUNT, `${RUNT} { let s: any; if (item.attempt && path.length > 0) { const t = kidAt(a.root, path); walkIncs(a.root, (i: any, p: any) => { if (t && p.length > 0 && !samePath(p, path) && i.frag === t.frag && !i.frozen) s ??= p; }); } if (s) { const a2 = getActor(tx.w.actors, item.actor); if (a2 && kidAt(a2.root, s)) runTurn(tx, a2, s, ev, start, late, item); } }`]], "(j) a handler run nothing accounts for"],
      ["q1.wa-eq-any", "an ending runs in another actor whose memory equals the owner's (equal views)", [["turn.ts", G125, WAX("true", MEMEQ)]], "(j) delivered to the wrong recipient"],
      ["q5.send-stolen", "an ending runs in another actor the suite sent mail to in the same batch", [["turn.ts", G125, WAX("true", '[...tx.w.mail].some((m: any) => m.k === "send" && m.actor === x.key)')]], "(j) delivered to the wrong recipient"],
    ];
    // Stage I: the stage H re-check's boot lies (`conformance-audit/re-check-round-10h.md`). A restored ending run, at a boot, in another live
    // actor of its machine, in another unfrozen copy of its fragment, or in its owner and another actor. Each is placed by its serial after
    // `port.boot` returns, like any other batch.
    const SIB = `(() => { const t = kidAt(a.root, path); let s: any; if (t && path.length > 0) walkIncs(a.root, (i: any, p: any) => { if (p.length > 0 && !samePath(p, path) && i.frag === t.frag && !i.frozen) s ??= p; }); return s; })()`;
    const ROUTE = "const { start, late } = routeFrom(tx, a, item, inc);";
    const LIES10I: ReadonlyArray<readonly [string, string, Edits, string]> = [
      ["h.boot-other", "a restored ending runs, at a boot, in another live actor (H1⁶)", [["turn.ts", G125, WAX("item.restored", "true")]], "(j) delivered to the wrong recipient"],
      ["h.boot-copy", "a restored ending runs, at a boot, in another unfrozen copy (H1⁶)", [["turn.ts", RUNT, `runTurn(tx, a, item.attempt && item.restored ? (${SIB} ?? path) : path, ev, start, late, item);`]], "(j) delivered to the wrong recipient"],
      ["h.boot-dup", "a restored ending runs in its owner and in another actor (H1⁶)", [["turn.ts", DUPFIND, `${DUPFIND} { const o = item.attempt && item.restored ? ${ACTORS}.find((x: any) => x.machine === a.machine && x.key !== a.key) : undefined; const p2 = o && bindingOf(tx, o, item.op, subject); if (o && p2) deliver(tx, o, p2, { ...item, redelivered: true, kept: false } as any); }`]], "(j) a handler run nothing accounts for"],
      // Stage J: the stage I re-check's state lies (`re-check-round-10i.md`, S1). A restored ending in its own actor and copy, from a state
      // it is not in: the node its owner sent from, or any node outside the leaf's chain that handles the event. Red by the ear's state check.
      ["h.boot-stale", "a restored ending is routed from the node its owner sent from, not the current leaf (S1)", [["turn.ts", ROUTE, "const fr0 = fragOf(machineOf(tx, a), inc); const { start, late } = item.restored && item.owner?.node && fr0.nodes[item.owner.node] ? { start: item.owner.node, late: false } : routeFrom(tx, a, item, inc);"]], "a state its recipient"],
      ["h.boot-state", "a restored ending runs the handler of a node outside the leaf's chain (S1)", [["turn.ts", ROUTE, `const wr = (() => { if (!item.restored) return undefined; const fr = fragOf(machineOf(tx, a), inc); const anc = new Set(up(fr, inc.leaf)); return Object.keys(fr.nodes).find((n) => !anc.has(n) && fr.nodes[n]!.on[ev.tag] !== undefined); })(); const { start, late } = wr !== undefined ? { start: wr, late: false } : routeFrom(tx, a, item, inc);`]], "a state its recipient"],
    ];
    // Stage K: the stage J re-check's lies (`re-check-round-10j.md`), as it wrote them. A restored row put back in the state its owner sent
    // from, published and routed by that (S1′), and inputs that waited on a slow load stepped before the restored endings. Red by the one
    // ledger's anchor to the record on disk, and by its judging a restored ending at the boot (`ending-check-design.md`, D9 and D11).
    const END = "tx.w = { ...tx.w, nextMint: maxMint + 1 };";
    const AT_SEND = `${END} for (const m of [...(tx.w.mail as any)] as any[]) { if (m.k !== "ending" || !m.restored || !m.owner?.node) continue; const r = getActor(tx.w.actors, m.actor); if (!r) continue; let hit = false; const fix = (i: any): any => i.id === m.owner.inc ? (i.leaf !== m.owner.node ? ((hit = true), { ...i, leaf: m.owner.node }) : i) : { ...i, kids: Object.fromEntries(Object.entries(i.kids).map(([k, v]) => [k, fix(v)])) }; const root = fix(r.root); if (hit) { tx.w = { ...tx.w, actors: setActor(tx.w.actors, m.actor, { ...r, root }) }; } }`;
    const BOOTIN = "realInput({ k: \"boot\", records: [...records], persistence });";
    const LIES10K: ReadonlyArray<readonly [string, string, Edits, string]> = [
      ["h.restore-at-send", "a restored row is put back in the state its owner sent from, and published and routed by it (S1′)", [["durable.ts", END, AT_SEND]], "(j) restored in"],
      ["h.boot-order", "inputs that waited on a slow load step before the restored endings", [["driver.ts", BOOTIN, "inbox.push({ k: \"boot\", records: [...records], persistence } as any, ...waitingBoot.splice(0)); pump();"]], "before the restored endings"],
    ];
    // Stage L: the review of stage K's lies (`conformance-audit/review-k-scripts/run-mut.ts`), as it wrote them. Each is the runtime's
    // silence taken as an excuse (R6) or a cause that named its recipient but not its event or start (R7). Red by (j) alone.
    const atSend: Edits = [["durable.ts", END, AT_SEND]];
    const EV = "guarded(() => cfg.onEvidence(out.evidence));";
    const evLate: Edits = [
      ["driver.ts", EV, `{ const H = ((globalThis as any).__heldEv ??= []); if (i.k === "boot") H.push(...out.evidence); else { const ev = [...H.splice(0), ...out.evidence]; guarded(() => cfg.onEvidence(ev)); } }`],
      ["driver.ts", "} finally { running = false; } notify();", "} finally { running = false; } { const H = (globalThis as any).__heldEv; if (H?.length) { const ev = H.splice(0); guarded(() => cfg.onEvidence(ev)); } } notify();"],
    ];
    const noBootEv: Edits = [["step.ts", 'note(tx, "boot", {});', ""]];
    const MAPPED = "const mapped = mappedFor(m, item);";
    // `k.stream-other` (a session's delivery in another actor that streams too) is stated limit L10 in `ending-check-design.md`, not here.
    const LIES10L: ReadonlyArray<readonly [string, string, Edits, string]> = [
      ["k.no-leaves+at-send", "the codec reads no leaf, and a row is restored in its asking state (H1)", [["adapter.ts", "leaves: (kv, actor) => {", "leaves: (kv, actor) => { if (kv) return undefined;"], ...atSend], "(j) the codec reads no leaf"],
      ["k.held-silent", "a held head's Restored is neither said nor delivered (H2)", [["durable.ts", "noteEnding(tx, { op: l.op, attempt: h.id }, ending); const phase: Phase", "if (!h.held) noteEnding(tx, { op: l.op, attempt: h.id }, ending); const phase: Phase"], ["durable.ts", "restoredHook(tx, l, h, ending); mail(tx, l, h, ending, true, !h.held);", "restoredHook(tx, l, h, ending); if (!h.held) mail(tx, l, h, ending, true, !h.held);"]], "(j) on disk at the reload, and the boot said no ending"],
      ["k.drop-row", "a row with a restored ending is silently not restored (H3)", [["durable.ts", 'import { getActor, setActor, noActors, type Actors } from "./actors.ts";', 'import { getActor, setActor, noActors, deleteActor, type Actors } from "./actors.ts";'], ["durable.ts", END, `${END} for (const m of [...(tx.w.mail as any)] as any[]) if (m.k === "ending" && m.restored && getActor(tx.w.actors, m.actor)) tx.w = { ...tx.w, actors: deleteActor(tx.w.actors, m.actor) };`]], "(j) not restored"],
      ["k.drop-copy", "the copy a restored ending belongs to is dropped at restore (H3)", [["durable.ts", END, `${END} for (const m of [...(tx.w.mail as any)] as any[]) { if (m.k !== "ending" || !m.restored || !m.owner?.inc) continue; const r = getActor(tx.w.actors, m.actor); if (!r || r.root.id === m.owner.inc) continue; const cut = (i: any): any => ({ ...i, kids: Object.fromEntries(Object.entries(i.kids).filter(([, v]: any) => v.id !== m.owner.inc).map(([k, v]: any) => [k, cut(v)])) }); tx.w = { ...tx.w, actors: setActor(tx.w.actors, m.actor, { ...r, root: cut(r.root) }) }; }`]], "(j) a copy on disk was not restored"],
      ["k.vanish-live", "an actor silently vanishes when a failure lands (H3)", [["turn.ts", 'import { getActor, setActor, type Actors } from "./actors.ts";', 'import { getActor, setActor, deleteActor, type Actors } from "./actors.ts";'], ["turn.ts", G125, `if (item.ending.ch === "failure" && getActor(tx.w.actors, item.actor)) tx.w = { ...tx.w, actors: deleteActor(tx.w.actors, item.actor) }; ${G125}`]], "(j)"],
      // Round 14 fix pass (M6): restored. Retiring it because the suite stayed green was a coverage gap: an ending does reach an identity that is
      // only a record, when a boot restores the lanes of a record that ended before the reload (rule 44 parks it). R14-FIX-01 and 02 catch it.
      ["k.ghost-life", "an ended actor's ending runs in its retired record (H5, M6)", [["turn.ts", G125, "const a = getActor(tx.w.actors, item.actor) ?? (own(tx.w.retired, item.actor) as any); const lane = tx.w.lanes[laneId];"]], "not woken"],
      ["k.late-as-current", "every ending routed current from the active leaf (H6)", [["turn.ts", ROUTE, "const { start, late } = { start: undefined as string | undefined, late: false };"]], "(j)"],
      ["k.restored-from-root", "a restored ending routed late from the root (H6)", [["turn.ts", ROUTE, "const { start, late } = item.restored ? { start: fragOf(machineOf(tx, a), inc).root as string | undefined, late: true } : routeFrom(tx, a, item, inc);"]], "(j)"],
      ["k.claim-unhandled", "a failure said delivered and Unhandled, run nowhere (H7)", [["turn.ts", "if (!item.redelivered) countFailure(tx, item);", 'if (!item.redelivered) countFailure(tx, item); if (item.ending.ch === "failure" && item.attempt) return note(tx, "Unhandled", { event: mapped.event });']], "(j) delivered, and no handler ran"],
      ["k.ev-late+at-send", "the boot's evidence after its restored turns, and a row restored in its asking state (M1)", [...evLate, ...atSend], "(j) restored in"],
      ["k.no-boot-ev+at-send", "no boot evidence, and a row restored in its asking state (M2)", [...noBootEv, ...atSend], "(j)"],
      ["k.no-boot-ev+boot-order", "no boot evidence, and waiting inputs before the restored endings (M2)", [...noBootEv, ["driver.ts", BOOTIN, "inbox.push({ k: \"boot\", records: [...records], persistence } as any, ...waitingBoot.splice(0)); pump();"]], "(j)"],
      ["k.restored-as-success", "a restored unknown runs the success event (M3)", [["turn.ts", MAPPED, "const mapped = item.restored && item.ending.ch === \"unknown\" && m.ops[item.op]?.outcomes.success ? m.ops[item.op]!.outcomes.success : mappedFor(m, item);"]], "(j) delivered"],
      ["k.failure-as-success", "a failure runs the success event (M3)", [["turn.ts", MAPPED, "const mapped = item.ending.ch === \"failure\" && m.ops[item.op]?.outcomes.success ? m.ops[item.op]!.outcomes.success : mappedFor(m, item);"]], "(j) delivered"],
      ["k.send-ahead", "a send that waited on a slow load steps ahead of the restored endings (M4)", [["driver.ts", BOOTIN, 'inbox.push({ k: "boot", records: [...records], persistence } as any, ...waitingBoot.filter((x: any) => x.k === "send")); { const rest = waitingBoot.filter((x: any) => x.k !== "send"); waitingBoot.splice(0, waitingBoot.length, ...rest); } pump();'], ["step.ts", 'else enqueue(tx, { k: "send", actor: input.actor, event: input.event });', 'else if ((tx.w.mail as any).restored > 0 && [...tx.w.mail].some((x: any) => x.restored && x.actor === input.actor)) tx.w = { ...tx.w, mail: (tx.w.mail as any).constructor.of([{ k: "send", actor: input.actor, event: input.event }, ...tx.w.mail]), rota: [input.actor, ...tx.w.rota.filter((x: string) => x !== input.actor)] }; else enqueue(tx, { k: "send", actor: input.actor, event: input.event });']], "moved before its restored endings"],
      ["k.parked-every-boot-silent", "a delivered parked ending's record is never deleted, so each boot delivers it again (M6)", [["durable.ts", "if (!l) { put(actor, id, undefined); }", 'if (!l) { if (!/"parked":\\[\\{/.test(saved[id] ?? "")) put(actor, id, undefined); }']], "(rule 17)"],
      ["k.parked-reversed", "parked endings restored in reverse saved order (M7)", [["durable.ts", "for (const p of l.parked ?? []) {", "for (const p of [...(l.parked ?? [])].reverse()) {"]], "(j) parked endings out of their saved order"],
      ["k.supersede-head", "under latest, the sent head is said Superseded too (L1)", [["lane.ts", "if (policy === \"latest\") { for (const x of l.w) supersede(tx, a.op, x);", "if (policy === \"latest\") { if (l.head && l.head.phase.t !== \"settled\") supersede(tx, a.op, l.head); for (const x of l.w) supersede(tx, a.op, x);"]], "(j) superseded after it was sent"],
      // The gate-close check (`conformance-audit/gate-close-check.md`): H7 for a late ending. Rule 14's late route lost, and the runtime
      // says Unhandled, a legitimate word when no handler exists. Red only since the free-handler check runs for a late start too.
      ["g.late-unhandled", "a late ending said delivered and Unhandled, run nowhere (H7, late)", [["turn.ts", `${ROUTE} ${RUNT}`, `${ROUTE} if (late) { note(tx, "Unhandled", { event: ev.tag }); return; } ${RUNT}`]], "(j) delivered, and no handler ran"],
    ];
    // The memos of `drive.ts` (copies by published world) and of the replay (pairs found equal) hold only while no world
    // is written in place. A turn's patch written into the published memory (an object: the write throws), and an actor put into the
    // published table's row (an array: its fingerprint moves). Red by the guard, whatever the memos say.
    const LIES_INPLACE: ReadonlyArray<readonly [string, string, Edits, string]> = [
      ["w.patch-in-place", "a turn's patch written into the published memory in place", [["turn.ts", "w.root = withKid(w.root, path, (i) => ({ ...i, memory: { ...i.memory, ...patch } }));", "Object.assign(inc.memory as object, patch);"]], "Attempted to assign to readonly property"],
      ["w.row-in-place", "an actor put into the published table's row in place", [["actors.ts", "const row = (t[h & 63] ?? empty).slice();", "const row = (t[h & 63] as Array<Bucket | null> | null) ?? empty.slice();"]], "writtenInPlace"],
    ];
    const ALL = [...LIES, ...LIES10D, ...LIES10F, ...LIES10G, ...LIES10H, ...LIES10I, ...LIES10K, ...LIES10L, ...LIES_INPLACE];
    // `--slice i/n`: the i-th of n parts (each fits a 5-minute command).
    const sl = process.argv.indexOf("--slice");
    const [si, sn] = sl < 0 ? [1, 1] : process.argv[sl + 1]!.split("/").map(Number) as [number, number];
    // `--lie a,b`: only these (a rerun of named lies; a full gate run uses `--slice`).
    const li = process.argv.indexOf("--lie");
    const only = li < 0 ? undefined : new Set(process.argv[li + 1]!.split(","));
    const chosen = quick ? ALL.slice(0, 3) : only ? ALL.filter(([id]) => only.has(id)) : ALL.filter((_, i) => i % sn === si - 1);
    if (chosen.length === 0) say(false, `lies: the slice ${si}/${sn} holds no lie`); // an empty part is no pass
    // Round 13: two modes. `--full` (a round's final commit) runs each lie over the whole suite, as before, and records the cases that went red by its
    // named oracle in `lie-cases/` (one file per lie, written as each lie ends). The default, **targeted**, runs each lie only on its
    // recorded cases: the claim checked is the same ("red by its oracle"), on fewer cases. A lie with no record, or one whose recorded cases no longer go red,
    // runs the whole suite instead, so a stale record costs time and never passes a lie. `--parallel N` (N <= 8) runs N lies at once, each in its own copy.
    const full = process.argv.includes("--full");
    const RECORDS = join(here, "lie-cases");
    const record: Record<string, readonly string[]> = {};
    if (existsSync(RECORDS)) for (const f of readdirSync(RECORDS).filter((x) => x.endsWith(".json")).sort()) Object.assign(record, JSON.parse(readFileSync(join(RECORDS, f), "utf8")));
    const recorded: Record<string, readonly string[]> = {};
    // One file per lie: parallel slices and parallel lies never write one file.
    const save = () => {
      if (!full || process.argv.indexOf("--lie") >= 0 || process.argv.indexOf("--cases") >= 0) return;
      mkdirSync(RECORDS, { recursive: true });
      for (const [k, v] of Object.entries(recorded)) writeFileSync(join(RECORDS, `${k}.json`), `${JSON.stringify({ [k]: v })}\n`);
    };
    const named = async (edits: Edits, cases?: readonly string[]) => {
      // `--cases A,B`: only these cases (a diagnosis, never a gate run). Prints their FAIL lines too.
      const ci = process.argv.indexOf("--cases");
      const only = ci >= 0 ? process.argv[ci + 1]! : cases?.join(",");
      const r = final(
        await runner.run({
          name: "lie",
          size: SUITE.size,
          open: async () => {
            const c = copyOf(snap, tree, edits);
            if (c._tag === "Failure") throw new Error(c.failure);
            const cwd = c.success.tree("conformance");
            return { spec: { gate: "suite", cmd: ["bun", "main.ts", "--round", "99", "--no-catalog", "--no-output", ...(only ? ["--only", only] : []), "--runtime", `../${tree}/adapter.ts`], cwd, env: {}, limits: SUITE.limits, contract: "gate" }, close: c.success.close };
          },
        }),
      );
      if (ci >= 0 || process.env["FALSIFY_LIST"]) console.log(failLines(r).map((l) => `FAIL  ${l}`.slice(0, 300)).join("\n"));
      return { r, fails: failLines(r) };
    };
    const caseOf = (l: string) => l.split("\t")[0]!.trim().split("/")[0]!;
    const caseName = (l: string) => l.split("\t")[0]!.trim();
    type Said = readonly [ok: boolean, what: string, detail: string, from: readonly Reading[]];
    const one = async ([id, about, edits, mark]: (typeof chosen)[number]): Promise<Said> => {
      const rot = check(snap, tree, id, edits);
      if (rot) return [false, `lie ${id} (${about}): ${rot.problem}`, rot.why, []];
      const cases = full ? undefined : record[id];
      let { r, fails } = await named(edits, cases?.length ? cases : undefined);
      let by = fails.filter((l) => l.includes(mark));
      let how = cases?.length ? `targeted, ${cases.length} case(s)` : "full";
      if (cases?.length && by.length === 0 && r.answer !== "none") {
        ({ r, fails } = await named(edits)); // a stale record: the whole suite decides
        by = fails.filter((l) => l.includes(mark));
        how = "full, the record was stale";
      }
      if (r.answer === "stated" && by.length === 0 && fails.length === 0 && vacuous.has(id)) {
        const p = await named(vacuous.get(id)!);
        const fired = p.fails.filter((l) => l.includes("ProbeFired"));
        return [p.r.answer === "stated" && fired.length === 0, `lie ${id} (${about}): vacuous, its trigger fires in no case`, fired.slice(0, 3).map(caseName).join(" "), [p.r]];
      }
      if (r.answer === "stated" && how.startsWith("full") && by.length) {
        recorded[id] = [...new Set(by.map(caseOf))];
        save(); // after each lie, so a killed slice keeps what it learnt
      }
      return [r.answer === "stated" && by.length > 0, `lie ${id} (${about}): red by ${mark || "a named oracle"} [${how}]`, `${by.length} of ${fails.length}: ${by.slice(0, 3).map(caseName).join(" ")}`, [r]];
    };
    const said = await Promise.all(chosen.map((x) => one(x)));
    for (const s of said) say(...s);
  }
} finally {
  closeCopy();
}
console.log(`\nFALSIFY  ${bad.length ? `${bad.length} gate(s) stayed green or broke: ${bad.join("; ")}` : "every gate fails on what it should"}`);
return items.length ? items : [{ kind: "check", name: "falsify", outcome: "fail" as const, why: "no part ran" }];
});
