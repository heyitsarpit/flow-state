// D132: a green must be able to go red. Every gate, on runtimes and copies known to be broken. Any that stays green fails this. bun falsify.ts --runtime ../round-10/adapter.ts [--quick]
// The other side, the same gates green on the real runtime, is run here too, at the same small depth, so a red below is about the breakage.
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
symlinkSync(resolve(here, "../../../../node_modules"), join(scratch, "node_modules"));
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
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
console.log(`\nFALSIFY  ${bad.length ? `${bad.length} gate(s) stayed green or broke: ${bad.join("; ")}` : "every gate fails on what it should"}`);
process.exit(bad.length ? 1 : 0);
