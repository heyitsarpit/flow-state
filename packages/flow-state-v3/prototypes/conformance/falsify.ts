// D132: a green must be able to go red. Every gate, on runtimes and copies known to be broken. Any that stays green fails this. bun falsify.ts --runtime ../round-10/adapter.ts [--quick]
// The other side, the same gates green on the real runtime, is run here too, at the same small depth, so a red below is about the breakage.
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { watched } from "./watch.ts";

const here = import.meta.dir;
const argIdx = process.argv.indexOf("--runtime");
const runtimeArg = argIdx < 0 ? "../round-10/adapter.ts" : process.argv[argIdx + 1]!;
const runtime = resolve(here, runtimeArg);
const roundDir = dirname(runtime);
const quick = process.argv.includes("--quick");
// Each part fits a 5-minute command. No `--part`: all of them.
const partArg = process.argv.indexOf("--part");
const part = (x: string) => partArg < 0 || process.argv[partArg + 1] === x;
const bad: string[] = [];
const say = (ok: boolean, what: string, detail = "") => {
  console.log(`${ok ? "ok  " : "BAD "} ${what}${detail ? `  ${detail}` : ""}`);
  if (!ok) bad.push(what);
};
const run = (cmd: string[], env: Record<string, string> = {}, cwd = here) => watched(cmd, { rssMb: 1700, seconds: 200, capture: true, env, cwd });

// ── The watchdog itself.
if (part("watch")) {
  const a = await watched(["sh", "-c", `bun -e "const a=[];for(let i=0;i<40;i++)a.push(new Uint8Array(32e6).fill(1));await Bun.sleep(9000)" & wait`], { rssMb: 300, seconds: 30, capture: true });
  say(a.killed === "rss", "watch: a grandchild's memory counts", `peak ${a.peakMb} MB, killed ${a.killed}`);
  const b = await watched(["sh", "-c", "sleep 79 & wait"], { rssMb: 300, seconds: 1, capture: true });
  const left = Bun.spawnSync(["pgrep", "-fx", "sleep 79"]).stdout.toString().trim();
  say(b.killed === "time" && left === "", "watch: a kill ends the tree", left ? `left: ${left}` : "");
  const c = await watched(["sh", "-c", "sleep 78 & exit 0"], { rssMb: 300, seconds: 5, capture: true });
  const left2 = Bun.spawnSync(["pgrep", "-fx", "sleep 78"]).stdout.toString().trim();
  say(left2 === "", "watch: an orphan after a normal exit is ended", `leftovers ${c.leftovers}`);
}

// ── The suite on broken runtimes.
const suite = (rt: string, env: Record<string, string> = {}, extra: string[] = []) =>
  run(["bun", "main.ts", "--round", "99", "--no-catalog", "--runtime", rt, ...extra], env);
const summary = (out: string) => /SUMMARY\s+(\d+)\/(\d+)/.exec(out);
if (part("suite")) {
  const n = await suite("./null-adapter.ts");
  const m = summary(n.stdout);
  const passed = n.stdout.split("\n").filter((l) => l.startsWith("PASS")).map((l) => l.slice(4).split("\t")[0]!.trim());
  say(n.code !== 0 && m !== null, "suite: red on null, with a verdict", m ? `${m[1]}/${m[2]} pass` : "no SUMMARY");
  say(passed.length === 0, "suite: no case passes on no runtime", passed.join(" "));
}
const BROKEN = ["constantHash", "lyingFatal", "noEvidence", "noWaits", "bogusIssue", "lyingReplay", "junkDiskKey"];
if (part("suite")) for (const k of quick ? BROKEN.slice(0, 2) : BROKEN) {
  const r = await suite("./broken-adapter.ts", { FLOW_BROKEN: k, FLOW_BROKEN_BASE: runtime });
  const m = summary(r.stdout);
  say(r.code !== 0 && m !== null && m[1] !== m[2], `suite: red on ${k}`, m ? `${m[1]}/${m[2]} pass` : "no SUMMARY");
}
if (part("suite")) {
  // A named oracle must see these too, not only the output: run with no output compare, and count.
  // The stated exceptions. A search keeps its own oracle. Three cases boot nothing: the seal refuses, and that is what they pin.
  const SEARCHES_OWN = ["SEARCH-ODD-SMALL", "SEARCH-ODD-ALL"];
  const NO_BOOT = ["REV7-M2/two-machines-under-one-id-is-an-error", "REV8-PINS/D77-a-closure-the-seal-does-not-know-is-an-error", "R10-RUNTIME/a-state-named-self-is-refused-at-the-seal"];
  for (const [k, allowed] of [["bogusIssue", [...SEARCHES_OWN, ...NO_BOOT]], ["lyingReplay", SEARCHES_OWN]] as const) {
    const r = await suite("./broken-adapter.ts", { FLOW_BROKEN: k, FLOW_BROKEN_BASE: runtime }, ["--no-output"]);
    const passed = r.stdout.split("\n").filter((l) => l.startsWith("PASS")).map((l) => l.slice(4).split("\t")[0]!.trim());
    const extra = passed.filter((p) => !(allowed as readonly string[]).includes(p));
    say(summary(r.stdout) !== null && extra.length === 0, `oracles: every case sees ${k} (D130)`, extra.join(" "));
  }
}
if (part("suite")) {
  const r = await suite("./broken-adapter.ts", { FLOW_BROKEN: "x", FLOW_BROKEN_BASE: join(here, "null-adapter.ts") }, ["--only", "NOPE-99"]);
  say(r.code !== 0, "suite: --only of nothing is red");
}

// ── Searches: exit 1 on no runtime and on a constant hash, 0 on the real one.
const SEARCHES = ["pay", "like", "chain", "crash", "cross", "frag", "odd", "session", "repairing", "listen.load", "fragstore.row", "flush.bare.tight", "flush.serialize.directed", "flush.bare.capture"];
const search = (w: string, rt: string, env: Record<string, string> = {}, depth = "4") =>
  run(["bun", "search/run.ts", "--which", w, "--runtime", rt, "--depth", depth, "--states", "4000", "--seconds", "60"], env);
if (part("search")) for (const w of quick ? SEARCHES.slice(0, 3) : SEARCHES) {
  const nul = await search(w, "../null-adapter.ts");
  say(nul.code !== 0, `search ${w}: not green on null`, /"verdict": "(\w+)"/.exec(nul.stdout)?.[1] ?? "crash");
  const con = await search(w, "../broken-adapter.ts", { FLOW_BROKEN: "constantHash", FLOW_BROKEN_BASE: runtime });
  say(con.code !== 0, `search ${w}: not green on a constant hash`, /"verdict": "(\w+)"/.exec(con.stdout)?.[1] ?? "crash");
  const real = await search(w, runtime);
  const dead = /"deadActions": \[([^\]]*)\]/.exec(real.stdout)?.[1]?.replace(/\s+/g, " ");
  // Known to fail, for entities: H2's class, on rounds 7 to 9 (RESULTS). It must go on failing for that reason until entities answer it.
  if (w === "listen.load") say(real.code !== 0 && real.stdout.includes("silently wrong"), "search listen.load: fails as known, H2's class");
  else say(real.code === 0, `search ${w}: green on the real runtime`, `${/"verdict": "(\w+)"/.exec(real.stdout)?.[1] ?? real.stdout.slice(-200)}${dead ? ` dead:${dead}` : ""}`);
}

// ── Gates by tampering a copy: compare, the lock, the log.
const scratch = mkdtempSync(join(tmpdir(), "flow-falsify-"));
// Re-check (stage E): the copies need `node_modules` with `tsc`. Up from here first; a fresh worktree has none, so then the main checkout's,
// by git's common dir. With neither, say so plainly instead of three "no tsc found" BADs.
const nodeModules = (() => {
  for (let d = here; dirname(d) !== d; d = dirname(d)) if (existsSync(join(d, "node_modules/.bin/tsc"))) return join(d, "node_modules");
  const common = Bun.spawnSync(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: here, stdin: "ignore" }).stdout.toString().trim();
  const main = common && join(dirname(common), "node_modules");
  if (main && existsSync(join(main, ".bin/tsc"))) return main;
  return undefined;
})();
if (nodeModules) symlinkSync(nodeModules, join(scratch, "node_modules"));
else if (part("tamper")) say(false, "tamper: no node_modules with tsc above this checkout or in its main checkout; run `nub install`");
const conf = join(scratch, "conformance");
const round = join(scratch, basename(roundDir));
const reset = () => {
  rmSync(conf, { recursive: true, force: true });
  rmSync(round, { recursive: true, force: true });
  cpSync(here, conf, { recursive: true });
  cpSync(roundDir, round, { recursive: true });
};
const edit = (file: string, f: (s: string) => string) => {
  const t = readFileSync(file, "utf8");
  const n = f(t);
  if (n === t) throw new Error(`falsify: edit did nothing: ${file}`);
  writeFileSync(file, n);
};
const scratchSuite = (only: string) => run(["bun", "main.ts", "--round", "99", "--no-catalog", "--only", only, "--runtime", `../${basename(roundDir)}/adapter.ts`], {}, conf);
try {
  if (part("tamper")) {
  reset();
  edit(join(round, "typed/pay.typed.ts"), (s) => s.replace("target: S.CARD", "target: S.IDLE"));
  const t = await run(["bun", join(round, "typed/compare.ts")], {}, conf);
  say(t.code !== 0, "typed compare: red on a changed target");

  // H4: weaken a case, paste the hash the run prints, into the lock. No log line.
  reset();
  edit(join(conf, "scenarios/pay.scenario.ts"), (s) => s.replace('c.eq("charges", c.r.truth().charges, 0);', ""));
  const h = await run(["bun", "main.ts", "--round", "99", "--no-catalog", "--only", "PAY-01", "--hashes", "--runtime", `../${basename(roundDir)}/adapter.ts`], {}, conf);
  let lock = readFileSync(join(conf, "expected.lock"), "utf8");
  for (const l of h.stdout.split("\n").filter((x) => x.startsWith("HASH "))) {
    const [, id, hh] = /^HASH (\S+) hash:(\S+)/.exec(l)!;
    lock = lock.replace(new RegExp(`^${id!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} .*$`, "m"), () => `${id} ${hh}`);
  }
  writeFileSync(join(conf, "expected.lock"), lock);
  const after = await scratchSuite("PAY-01");
  say(after.code !== 0 && /unlogged expectation changes: (?!none)/.test(after.stdout), "lock: a pasted hash with no log line is red");

  // H5: a removed newline lets a comment swallow an oracle.
  reset();
  // Found by the oracle it swallows, not by the comment's words, which change.
  edit(join(conf, "scenarios/ctx.ts"), (s) => s.replace(/(\/\/[^\n]*)\n(\s*if \(!q\.idle\) throw)/, "$1 $2"));
  const j = await scratchSuite("PAY-01");
  say(j.code !== 0 && /unlogged expectation changes: (?!none)/.test(j.stdout), "lock: a comment swallowing an oracle is red");

  // A bulk reason: the same reason on more than three lines.
  reset();
  const ids = ["PAY-01", "PAY-02", "PAY-03", "PAY-04"];
  edit(join(conf, "expected-changes.log"), (s) => s + ids.map((i) => `${i} hash:000000000000 | same words\n`).join(""));
  const k = await scratchSuite("PAY-01");
  say(k.code !== 0, "log: a line whose hash is not the current one is red");
  // Re-audit H2: D91's type pins. A directive removed and its refusal widened with `as any` compiles; the check and the lock must both see it.
  const typesCheck = () => run(["bun", join(round, "checks/types-check.ts")], {}, conf);
  reset();
  edit(join(round, "typed/type-tests.ts"), (s) => s.replace(/\/\/ @ts-expect-error a key names a field that is not the input's\n(.*)key: \["b"\],/, '$1key: ["b"] as any,'));
  say((await typesCheck()).code !== 0, "types: a pin removed with its refusal widened is red");
  const w = await scratchSuite("PAY-01");
  say(w.code !== 0 && /unlogged expectation changes: [^;]*round:typed\/type-tests\.ts/.test(w.stdout), "lock: a type-only change to typed/ is red");
  reset();
  edit(join(round, "typed/type-tests.ts"), (s) => s.replace("// @ts-expect-error a key names a field that is not the input's\n", ""));
  const d = await typesCheck();
  say(d.code !== 0 && /tsc exit/.test(d.stdout), "types: a refusal with no directive fails tsc");
  // Re-check M1', D156: the directive's words moved into a comment that only mentions them, and its refusal widened. The count is kept; the words are not.
  reset();
  edit(join(round, "typed/type-tests.ts"), (s) => s.replace(/\/\/ @ts-expect-error a key names a field that is not the input's\n(.*)key: \["b"\],/, '// see the @ts-expect-error notes below\n$1key: ["b"] as any,'));
  const moved = await typesCheck();
  say(moved.code !== 0 && /no @ts-expect-error directive pins: a key names/.test(moved.stdout), "types: a directive turned into a mention is red, by its words");
  // Re-check L1: a typo under a kept directive. The directive and its words stay; its line now errors for the typo, not its refusal.
  reset();
  edit(join(round, "typed/type-tests.ts"), (s) => s.replace('key: ["b"], concurrency: "reject"', 'key: ["a"], concurrency: "rejct"'));
  const typo = await typesCheck();
  say(typo.code !== 0 && /errors for something else/.test(typo.stdout), "types: a typo under a kept directive is red, by its error");
  reset();
  const tc = await typesCheck();
  say(tc.code === 0, "control: the types check is green untampered", tc.code === 0 ? "" : tc.stdout.slice(-300));
  // A green control in the same copy, so the reds above are about the tamper.
  reset();
  const ctl = await scratchSuite("PAY-01");
  say(ctl.code === 0, "control: the copy is green untampered", ctl.code === 0 ? "" : ctl.stdout.slice(-300));
  }
  // ── Re-audit H1, M3: named oracles alone (`--no-output`) must kill these, each in at least `min` cases.
  if (part("mutants")) {
  const { MUTANTS } = (await import(join(roundDir, "mutants-r10.ts"))) as { MUTANTS: ReadonlyArray<{ id: string; edits: ReadonlyArray<readonly [string, string, string]> }> };
  const laundered = MUTANTS.find((m) => m.id === "g125.laundered-as-evidence")!;
  const NAMED: ReadonlyArray<readonly [string, ReadonlyArray<readonly [string, string, string]>, number]> = [
    [laundered.id, laundered.edits, 2],
    ["step.timer-fence-off", [["step.ts", "if (!t || t.gen !== i.gen) return", "if (!t) return"]], 1],
    ["step.dispose-reads-not-aborted", [["step.ts", "    tx.commands.push({ k: \"interrupt\", attempt: k, send: r.gen });\n    note(tx, \"Superseded\", { op: r.op, attempt: k, send: r.gen });\n  }\n  tx.w = { ...tx.w, reads: {} };", "    note(tx, \"Superseded\", { op: r.op, attempt: k, send: r.gen });\n  }\n  tx.w = { ...tx.w, reads: {} };"]], 1],
  ];
  for (const [id, edits, min] of NAMED) {
    reset();
    // As mutate.ts reads a find: whitespace-insensitive, so `vp fmt` does not rot the list.
    const flex = (find: string) => new RegExp(find.trim().split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*"));
    for (const [f, find, rep] of edits) edit(join(round, f), (s) => s.replace(flex(find), () => rep));
    const r = await run(["bun", "main.ts", "--round", "99", "--no-catalog", "--no-output", "--runtime", `../${basename(roundDir)}/adapter.ts`], {}, conf);
    const named = r.stdout.split("\n").filter((l) => l.startsWith("FAIL") && !l.split("\t")[1]?.startsWith("output:")).map((l) => l.slice(4).split("\t")[0]!.trim());
    say(summary(r.stdout) !== null && named.length >= min, `mutant ${id}: killed by named oracles in ${min}+ case(s)`, `${named.length}: ${named.slice(0, 4).join(" ")}`);
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
    const SAMESEND = '[...tx.w.mail].some((x: any) => x.actor === item.actor && x.k === "send")';
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
      ["d154.event-fail-released", [["turn.ts", G125, at(`${FAIL} && ${SAMESEND}`, PROBE)]]],
      ["d154.event-like-released", [["turn.ts", G125, at(`${FAIL} && item.op === "like" && ${SAMESEND}`, PROBE)]]],
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
      ["d154.event-fail-released", "cancel by event", [["turn.ts", G125, at(`${FAIL} && ${SAMESEND}`, REL + EO)]], "(j)"],
      ["d154.event-like-released", "cancel by event, like", [["turn.ts", G125, at(`${FAIL} && item.op === "like" && ${SAMESEND}`, REL + EO)]], "(j)"],
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
    const flex = (find: string) => new RegExp(find.trim().split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*"));
    const ALL = [...LIES, ...LIES10D];
    // `--slice i/n`: the i-th of n parts (each fits a 5-minute command).
    const sl = process.argv.indexOf("--slice");
    const [si, sn] = sl < 0 ? [1, 1] : process.argv[sl + 1]!.split("/").map(Number) as [number, number];
    const chosen = quick ? ALL.slice(0, 3) : ALL.filter((_, i) => i % sn === si - 1);
    const named = async (edits: Edits) => {
      reset();
      for (const [f, find, rep] of edits) edit(join(round, f), (s) => s.replace(flex(find), () => rep));
      const r = await run(["bun", "main.ts", "--round", "99", "--no-catalog", "--no-output", "--runtime", `../${basename(roundDir)}/adapter.ts`], {}, conf);
      return { r, fails: r.stdout.split("\n").filter((l) => l.startsWith("FAIL") && !l.split("\t")[1]?.startsWith("output:")) };
    };
    for (const [id, about, edits, mark] of chosen) {
      const { r, fails } = await named(edits);
      const by = fails.filter((l) => l.includes(mark));
      if (by.length === 0 && fails.length === 0 && vacuous.has(id)) {
        const p = await named(vacuous.get(id)!);
        const fired = p.fails.filter((l) => l.includes("ProbeFired"));
        say(summary(p.r.stdout) !== null && fired.length === 0, `lie ${id} (${about}): vacuous, its trigger fires in no case`, fired.slice(0, 3).map((l) => l.slice(4).split("\t")[0]!.trim()).join(" "));
        continue;
      }
      say(summary(r.stdout) !== null && by.length > 0, `lie ${id} (${about}): red by ${mark || "a named oracle"}`, `${by.length} of ${fails.length}: ${by.slice(0, 3).map((l) => l.slice(4).split("\t")[0]!.trim()).join(" ")}`);
    }
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
console.log(`\nFALSIFY  ${bad.length ? `${bad.length} gate(s) stayed green or broke: ${bad.join("; ")}` : "every gate fails on what it should"}`);
process.exit(bad.length ? 1 : 0);
