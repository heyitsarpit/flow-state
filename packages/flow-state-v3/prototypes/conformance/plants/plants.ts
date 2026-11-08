// The verdict plants that stand (VERDICTS-PROPOSAL-2.md 11.2): the reader on built runs, one per way a run ends; the runner on small live
// children; the work bound; the search expectation; the child breaking its own contract. Each plant is one item. bun plants/plants.ts
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stated } from "../verdicts/state.ts";

await stated("plants", async (scope) => {
  const { read, outcome } = await import("../verdicts/read.ts");
  const { aloneLimit, final, job, parentLimitHolds } = await import("../verdicts/runner.ts");
  const { applyEdits, check, copyOf, snapshot, dropSnapshot } = await import("../verdicts/snapshot.ts");
  const { isTop, killed } = await import("../verdicts/spawn.ts");
  const { encode, expect, outcomeOf, sameCases, theVerdict } = await import("../verdicts/verdict.ts");
  const { mutantItem } = await import("../mutate.ts");
  const { WORK_PER_CALL } = await import("../limits.ts");
  type Item = import("../verdicts/verdict.ts").Item;
  type Ended = import("../verdicts/spawn.ts").Ended;
  type Launch = import("../verdicts/spawn.ts").Launch;
  type Reading = import("../verdicts/read.ts").Reading;
  const items: Item[] = [];
  const plant = (name: string, ok: boolean, why: string) => {
    items.push({ kind: "plant", name, outcome: ok ? "pass" : "fail", why: ok ? "" : why });
    console.log(`${ok ? "ok  " : "BAD "} ${name}${ok ? "" : `  ${why}`}`);
  };
  const tmp = mkdtempSync(join(tmpdir(), "flow-plants-"));
  try {
    // ── The reader, on built runs: section 2's table.
    const launch = (o: Partial<Launch> = {}): Launch => ({ gate: "g", cmd: [], cwd: tmp, env: {}, limits: { mb: 300, seconds: 2 }, contract: "gate", run: "top.1", referenceMb: 100, pool: { slots: 1, mb: 100 }, alone: false, ...o });
    const stream = (s: string, marks?: number) => ({ head: s, tail: "", lastLine: "", dropped: 0, marks: marks ?? s.split("\n").filter((l) => l.startsWith("VERDICT ")).length, abandoned: false });
    const ended = (o: Partial<Ended> & { out?: string }): Ended => ({ kind: "ended", launch: launch(), exit: 0, signal: null, decided: null, killed: false, peakMb: 50, ms: 10, stdout: stream(o.out ?? ""), stderr: stream(""), leftovers: 0, unreaped: false, blindTicks: 0, ticks: 1, ...o });
    const v = (items: Item[], run = "top.1", gate = "g") => `human\n${encode({ gate, run, items })}\n`;
    const pass: Item = { kind: "case", name: "a", outcome: "pass", why: "" };
    const fail: Item = { kind: "case", name: "a", outcome: "fail", why: "x" };
    const unk: Item = { kind: "case", name: "b", outcome: "unknown", why: "?" };
    const cause = (r: Reading) => (r.answer === "none" ? r.cause.kind : r.answer);
    const rows: Array<[string, Reading, string]> = [
      ["stated pass", read(ended({ out: v([pass]) })), "stated"],
      ["stated fail", read(ended({ out: v([fail]), exit: 1 })), "stated"],
      ["exit disagrees", read(ended({ out: v([pass]), exit: 1 })), "disagree"],
      ["no VERDICT", read(ended({ out: "PASS a\n" })), "silent"],
      ["VERDICT not at line start", read(ended({ out: ` ${encode({ gate: "g", run: "top.1", items: [pass] })}\n` })), "silent"],
      ["garbled VERDICT", read(ended({ out: "VERDICT {not json\n" })), "garbled"],
      ["VERDICT not last", read(ended({ out: `${v([pass])}more\n` })), "garbled"],
      ["two VERDICT lines, fail then pass", read(ended({ out: `${v([fail])}${v([pass])}` })), "duplicate"],
      ["a VERDICT of another run", read(ended({ out: v([pass], "top.9") })), "foreign"],
      ["a VERDICT of another gate", read(ended({ out: v([pass], "top.1", "other") })), "foreign"],
      ["unstarted", read({ kind: "unstarted", launch: launch(), message: "ENOENT" }), "unstarted"],
      ["time kill", read(ended({ decided: "time", killed: true, signal: "SIGKILL", exit: null })), "time"],
      ["budget kill", read(ended({ decided: "budget", killed: true, signal: "SIGKILL", exit: null })), "budget"],
      ["memory kill, limit 3 x reference", read(ended({ decided: "rss", killed: true, signal: "SIGKILL", exit: null })), "bound"],
      ["memory kill, limit 1.2 x reference (no launch is built so; R2)",read(ended({ launch: launch({ referenceMb: 250 }), decided: "rss", killed: true, signal: "SIGKILL", exit: null })), "memory-near"],
      ["memory kill, no reference", read(ended({ launch: launch({ referenceMb: null }), decided: "rss", killed: true, signal: "SIGKILL", exit: null })), "memory-near"],
      ["a signal the watchdog did not send", read(ended({ signal: "SIGTERM", exit: null })), "signal"],
      ["decided, but the child exited first (the race)", read(ended({ decided: "time", killed: false, exit: 0, out: v([pass]) })), "stated"],
      ["sh exiting 137 by itself", read(ended({ exit: 137, out: "" })), "silent"],
      ["a tool exiting 2", read(ended({ launch: launch({ contract: "tool" }), exit: 2 })), "stated"],
    ];
    for (const [name, r, want] of rows) plant(`read: ${name} -> ${want}`, cause(r) === want, `read as ${cause(r)}`);
    plant("read: a tool exiting 2 is a fail", outcome(rows.at(-1)![1]) === "fail", "not fail");
    let refused = false;
    try {
      read(ended({ launch: launch({ contract: "program" }) }));
    } catch {
      refused = true;
    }
    plant("read: a program under test is never read", refused, "read it");
    plant("killed: decided, sent to a live child, and a signal status", killed("time", true, "SIGKILL") && !killed("time", true, null) && !killed(null, false, "SIGKILL") && !killed("rss", false, "SIGKILL"), "wrong");
    const dupMiddle = read({ ...ended({ out: v([pass]) }), stdout: { ...stream(v([pass])), marks: 2, dropped: 5_000_000 } });
    plant("read: a second VERDICT in the dropped middle is still a duplicate (counted as it passed)", cause(dupMiddle) === "duplicate", cause(dupMiddle));
    plant("read: a kill at close is its own cause", cause(read(ended({ decided: "closed", killed: true, signal: "SIGKILL", exit: null }))) === "closed", "not closed");
    plant("outcomeOf: [unknown, fail] is fail; [] is fail; [pass, unknown] is unknown", outcomeOf([unk, fail]) === "fail" && outcomeOf([]) === "unknown" && outcomeOf([pass, unk]) === "unknown", "wrong");
    plant("outcomeOf: a threw item is judged whatever kinds are asked", outcomeOf([pass, { kind: "threw", name: "threw", outcome: "fail", why: "" }], ["case"]) === "fail", "not judged");
    const stOk = read(ended({ out: v([pass]) }));
    const stFail = read(ended({ out: v([fail]), exit: 1 }));
    const none = read(ended({ decided: "time", killed: true, signal: "SIGKILL", exit: null }));
    const bound = read(ended({ decided: "rss", killed: true, signal: "SIGKILL", exit: null }));
    plant("expect: none is unknown", expect("g", "x", none, "pass").outcome === "unknown", "not unknown");
    plant("expect: a memory bound answers want fail, not want pass", expect("g", "x", bound, "fail").outcome === "pass" && expect("g", "x", bound, "pass").outcome === "fail", "wrong");
    plant("expect: the failing names travel in detail.failed", JSON.stringify((expect("g", "x", stFail, "pass").detail as { failed: string[] }).failed) === '["a"]', "lost");
    plant("expect: nothing of the judged kinds scored is unknown, never a pass, whatever is wanted (R1)", expect("g", "x", stOk, "fail", { kinds: ["output"] }).outcome === "unknown" && expect("g", "x", stOk, "pass", { kinds: ["output"] }).outcome === "unknown", "scored vacuously");
    plant("read: an abandoned stdout is unknown, a VERDICT may be lost", cause(read({ ...ended({ out: v([pass]) }), stdout: { ...stream(v([pass])), abandoned: true } })) === "abandoned", "read it");
    plant("read: a run whose every poll had no process table is unknown (no memory limit held)", cause(read(ended({ out: v([pass]), ticks: 5, blindTicks: 5 }))) === "blind", "read it");
    plant("read: a VERDICT with no items is unknown, exit 2 (R1)", outcome(read(ended({ out: v([]), exit: 2 }))) === "unknown", "not unknown");
    const { resourceErrno } = await import("../verdicts/core.ts");
    plant("errno: a resource errno is found through cause and AggregateError", resourceErrno(new Error("x", { cause: Object.assign(new Error("y"), { code: "EMFILE" }) })) === "EMFILE" && resourceErrno(new AggregateError([Object.assign(new Error("z"), { code: "ENOSPC" })])) === "ENOSPC" && resourceErrno(new Error("plain")) === undefined, "missed");
    plant("expect: a control short of its planned cases fails",expect("g", "x", stOk, "pass", { holds: sameCases(["a", "c"]) }).outcome === "fail", "partial control passed");
    plant("aloneLimit: 3 x aloneS, at least 30, at most the first limit", aloneLimit(290, { slots: 1, peakMb: 0, aloneS: 19 }) === 57 && aloneLimit(290, { slots: 1, peakMb: 0, aloneS: 2 }) === 30 && aloneLimit(40, { slots: 1, peakMb: 0, aloneS: 100 }) === 40, "wrong");
    plant("parent limit: the sum of running children and the next, plus its own", parentLimitHolds(10000, [2700, 2700], 3200) && !parentLimitHolds(3000, [2700], 2700) && parentLimitHolds(null, [9e9], 1), "wrong");
    plant("theVerdict: one line, last, ours", theVerdict(v([pass]), { gate: "g", run: "top.1" })._tag === "Success", "refused its own");
    // ── mutate.ts's reading of a mutant (#12, #20, D132).
    const m = { id: "m", kills: ["X"], edits: [] };
    const claimless = { id: "m", kills: [], edits: [] };
    const itemOf = async (mm: typeof m, r: Reading) => {
      const i = await mutantItem(mm, r);
      return "outcome" in i ? i.outcome : "noted";
    };
    plant("mutant: killed by memory at 2 x the control's peak", (await itemOf(m, bound)) === "pass", "not killed");
    plant("mutant: unknown is unknown, never killed", (await itemOf(m, none)) === "unknown", "counted");
    plant("mutant: a survivor that claims kills fails the run", (await itemOf(m, stOk)) === "fail", "passed");
    plant("mutant: a survivor that claims nothing is noted", (await itemOf(claimless, stOk)) === "noted", "scored");
    plant("mutant: a stated fail is a kill", (await itemOf(m, stFail)) === "pass", "not killed");
    // ── Snapshots (f16) and list rot (f12).
    const src = join(tmp, "src", "tree");
    const other = join(tmp, "src", "conformance");
    for (const d of [src, other]) Bun.spawnSync(["mkdir", "-p", d], { stdin: "ignore" });
    writeFileSync(join(src, "a.ts"), "export const a = 1;\n");
    writeFileSync(join(other, "b.ts"), "export const b = 1;\n");
    const s = snapshot([other, src]);
    writeFileSync(join(src, "a.ts"), "export const a = 2;\n");
    const c = copyOf(s, "tree", []);
    plant("snapshot: an edit after the snapshot does not reach a copy", c._tag === "Success" && (await Bun.file(join(c.success.tree("tree"), "a.ts")).text()).includes("= 1"), "the copy saw it");
    if (c._tag === "Success") c.success.close();
    plant("snapshot: an edit that does not apply is named up front", check(s, "tree", "rot", [["a.ts", "const zzz", "x"]])?.problem === "does not apply", "not found");
    plant("snapshot: an edit that does not parse is named up front", check(s, "tree", "bad", [["a.ts", "export const a = 1;", "export const = ;"]])?.problem === "does not parse", "not found");
    plant("applyEdits: whitespace-insensitive, first match", applyEdits("a  =\n 1; a = 1;", "a = 1;", "b") === "b a = 1;", "wrong");
    dropSnapshot(s);
    // ── The work bound (#1, f8), in process: a runtime that is never idle, and a timer that re-arms itself at now.
    const { makeHarness } = await import("../drive.ts");
    const { notesFixture } = await import("../typed/lab-machines.ts");
    const { port } = (await import("../../round-14/adapter.ts")) as import("../harness.ts").RuntimeModule;
    const N = { actor: "Notes", id: "a" };
    const spinning = (how: "pending" | "timer"): string => {
      const p = {
        ...port,
        boot: (a: Parameters<typeof port.boot>[0]) => {
          const i = port.boot(a);
          if (how === "timer") {
            const tick = () => void a.host.setTimer(a.host.now(), tick);
            tick();
            return i;
          }
          return { ...i, pending: () => true };
        },
      };
      const h = makeHarness(p)();
      const t0 = performance.now(); // evidence only: the bound must be met quickly
      try {
        h.start({ machines: [notesFixture], seed: 1 });
        h.do({ ensure: N });
        h.do({ advance: 10 });
        return "no throw";
      } catch (e) {
        return `${(e as Error).message}|${Math.round(performance.now() - t0)}`;
      }
    };
    for (const how of ["pending", "timer"] as const) {
      const [msg, ms] = spinning(how).split("|");
      plant(`work bound: ${how === "pending" ? "a runtime never idle" : "a timer re-armed at now"} fails in one call`, msg === `harness: did not quiesce in ${WORK_PER_CALL} work units in one call`, `${msg}`);
      console.log(`     (evidence: ${ms} ms)`);
    }
    // ── Live children under a small runner.
    const runner = scope.runner({ slots: 2, mb: 1200, budgetS: null });
    const script = (name: string, body: string) => {
      const f = join(tmp, `${name}.ts`);
      writeFileSync(f, body);
      return f;
    };
    const STATE = join(import.meta.dir, "../verdicts/state.ts");
    const child = (name: string, body: string, limits = { mb: 600, seconds: 20 }, ref = 100) =>
      runner.run(job(name, { gate: name, cmd: ["bun", script(name, body)], cwd: tmp, env: {}, limits, contract: "gate" }, { slots: 1, peakMb: ref, aloneS: 1 }));
    const ok = `import { stated } from ${JSON.stringify(STATE)};\nawait stated(NAME, async () => { BODY; return [{ kind: "case", name: "a", outcome: "pass", why: "" }]; });\n`;
    const gate = (name: string, body: string) => ok.replace("NAME", JSON.stringify(name)).replace("BODY", body);
    const cases: Array<[string, string, (r: Reading) => boolean, string]> = [
      ["stderr-1mb", gate("stderr-1mb", `await new Promise((r) => process.stderr.write("x".repeat(1 << 20), r))`), (r) => outcome(r) === "pass", "a 1 MB stderr child finishes and is read (f10)"],
      ["stdout-20mb", gate("stdout-20mb", `for (let i = 0; i < 20; i++) await new Promise((r) => process.stdout.write("y".repeat((1 << 20) - 1) + "\\n", r))`), (r) => outcome(r) === "pass" && r.run.kind === "ended" && r.run.stdout.dropped > 0, "a 20 MB stdout child is read by its last line, the overflow counted (#9)"],
      ["silent", `process.exit(0);\n`, (r) => cause(r) === "silent", "exit 0 with no VERDICT is unknown (#16)"],
      ["disagree", `console.log(${JSON.stringify(encode({ gate: "disagree", run: "RUN", items: [pass] }))}.replace("RUN", process.env.FLOW_RUN));\nprocess.exit(1);\n`, (r) => cause(r) === "disagree", "a pass VERDICT with exit 1 is unknown (#16)"],
      ["forged", `console.log(${JSON.stringify(encode({ gate: "forged", run: "top.99", items: [pass] }))});\n${gate("forged", "")}`, (r) => cause(r) === "duplicate", "a leaked VERDICT beside the child's own is unknown (#18)"],
      ["foreign", `console.log(${JSON.stringify(encode({ gate: "foreign", run: "top.99", items: [pass] }))});\n`, (r) => cause(r) === "foreign", "another run's VERDICT is unknown (#18)"],
      ["on-stderr", `console.error(${JSON.stringify(encode({ gate: "on-stderr", run: "RUN", items: [pass] }))}.replace("RUN", process.env.FLOW_RUN));\n`, (r) => cause(r) === "silent", "a VERDICT on stderr is never read (#16)"],
      ["sigterm", `process.kill(process.pid, "SIGTERM");\nawait Bun.sleep(5000);\n`, (r) => cause(r) === "signal", "a child ended by a signal the watchdog did not send is unknown (#16)"],
      ["throws-at-load", `import { stated } from ${JSON.stringify(STATE)};\nawait stated("throws-at-load", async () => { await import(${JSON.stringify(script("broken-module", 'throw new Error("plant");\n'))}); return []; });\n`, (r) => outcome(r) === "fail" && r.answer === "stated" && r.verdict.items.some((i) => i.kind === "threw"), "a throw while loading the code under test is threw, a fail (#3)"],
      ["emfile", gate("emfile", `throw Object.assign(new Error("too many"), { code: "EMFILE" })`), (r) => outcome(r) === "unknown" && r.answer === "stated", "a resource errno is the machine's, unknown (#22)"],
    ];
    const live = await Promise.all(cases.map(([name, body]) => child(name, body)));
    for (const [k, [name, , holds, what]] of cases.entries()) {
      const r = final(live[k]!);
      plant(`live: ${what}`, holds(r), `${name}: ${cause(r)} ${outcome(r)}`);
    }
    const sleeper = await child("sleeper", "await Bun.sleep(60_000);\n", { mb: 600, seconds: 2 });
    plant("live: a time kill is unknown, still unknown alone, and rerun only at the top (f2)", outcome(final(sleeper)) === "unknown" && cause(final(sleeper)) === "time" && (sleeper.alone !== null) === isTop(), `${cause(final(sleeper))}, alone ${sleeper.alone !== null}`);
    const alloc = `const a = []; for (let i = 0; i < 24; i++) a.push(new Uint8Array(32e6).fill(1)); await Bun.sleep(5000);\n`;
    const far = final(await child("alloc-far", alloc, { mb: 300, seconds: 20 }, 100));
    const near = final(await child("alloc-near", alloc, { mb: 300, seconds: 20 }, 250));
    plant("live: a memory kill at 3 x the reference is the program's, a fail (f6, f11)", far.answer === "bound" && outcome(far) === "fail", cause(far));
    plant("live: a memory kill near the reference is unknown (#10)", cause(near) === "memory-near", cause(near));
    const missing = await runner.run(job("missing", { gate: "missing", cmd: ["/nonexistent/flow-plant"], cwd: tmp, env: {}, limits: { mb: 100, seconds: 5 }, contract: "gate" }, { slots: 1, peakMb: 10, aloneS: 1 }));
    const opened = await runner.run({ name: "open-throws", size: { slots: 1, peakMb: 10, aloneS: 1 }, open: async () => { throw new Error("edit does not apply"); } });
    plant("live: a missing binary and a throwing open are unstarted, unknown, and free their slots (f12)", cause(final(missing)) === "unstarted" && cause(final(opened)) === "unstarted", `${cause(final(missing))} ${cause(final(opened))}`);
    const ev = runner.events();
    const starts = ev.filter((e) => e.at === "start").length;
    const ends = ev.filter((e) => e.at === "end").length;
    plant("live: every attempt that started ended", starts === ends && starts > 0, `${starts} starts, ${ends} ends`);
    // ── The search verdict is expected, not merely not failed (#11, f9).
    const s26 = final(await runner.run(job("search budget", { gate: "search", cmd: ["bun", "search/run.ts", "--which", "frag", "--runtime", "../../round-14/adapter.ts", "--depth", "9", "--states", "50", "--expect", "completed"], cwd: join(import.meta.dir, ".."), env: {}, limits: { mb: 1200, seconds: 120 }, contract: "gate" }, { slots: 1, peakMb: 300, aloneS: 2 })));
    const sv = s26.answer === "stated" ? (s26.verdict.items[0]?.detail as { verdict?: string } | undefined)?.verdict : undefined;
    plant("search: a budget hit where completed is expected fails", outcome(s26) === "fail" && sv === "inconclusive", `${outcome(s26)} ${sv}`);
    // ── Alone attempts never overlap, across two top processes (#23): each top runs one unknown job, and writes its events.
    const stamp = script("stamp", `if (process.env.FLOW_ALONE === "1") await Bun.write(process.argv[2], String(Date.now()));\nawait Bun.sleep(5000);\n`);
    const topScript = script("top", `import { makeRunner, job } from ${JSON.stringify(join(import.meta.dir, "../verdicts/runner.ts"))};\nconst r = makeRunner({ slots: 1, mb: 100, budgetS: null });\nconst d = await r.run(job("u", { gate: "u", cmd: ["bun", ${JSON.stringify(stamp)}, process.argv[2] + ".alone"], cwd: ${JSON.stringify(tmp)}, env: {}, limits: { mb: 300, seconds: 1 }, contract: "gate" }, { slots: 1, peakMb: 10, aloneS: 1 }));\nawait r.close();\nawait Bun.write(process.argv[2], JSON.stringify({ alone: d.alone !== null }));\n`);
    const tops = await Promise.all(
      ["a", "b"].map((n) =>
        runner.program(job(`top ${n}`, { gate: "top", cmd: ["bun", topScript, join(tmp, `top-${n}.json`)], cwd: tmp, env: { FLOW_NESTED: "", FLOW_RUN: "", FLOW_POOL: "", FLOW_LIMIT_MB: "", FLOW_ALONE: "", FLOW_VERDICTS_DIR: join(tmp, "lock") }, limits: { mb: 600, seconds: 60 }, contract: "program" }, { slots: 1, peakMb: 10, aloneS: 1 })),
      ),
    );
    void tops;
    const both = await Promise.all(["a", "b"].map(async (n) => JSON.parse(await Bun.file(join(tmp, `top-${n}.json`)).text()) as { alone: boolean }));
    const aloneAt = await Promise.all(["a", "b"].map(async (n) => Number(await Bun.file(join(tmp, `top-${n}.json.alone`)).text())));
    const apart = Math.abs(aloneAt[0]! - aloneAt[1]!);
    plant("live: two top processes rerun alone one after the other, never together (the machine-wide lock)", both.every((b) => b.alone) && apart >= 1000, `alone ${both.map((b) => b.alone).join(",")}, alone starts ${apart} ms apart`);
    // ── Standing forms of B1, B5 and B17: the planted edit in a copy of this tree, the smallest child that shows it.
    const { SUITE } = await import("../limits.ts");
    const conf = join(import.meta.dir, "..");
    const roundDir = join(conf, "../round-14");
    const snap = scope.snapshot([conf, roundDir]);
    const inCopy = async (name: string, edits: readonly (readonly [string, string, string])[], args: readonly string[], env: Record<string, string> = {}, mb = SUITE.limits.mb) => {
      const c = copyOf(snap, "round-14", edits);
      if (c._tag === "Failure") return null;
      try {
        return final(await runner.run(job(name, { gate: "suite", cmd: ["bun", "main.ts", "--round", "99", "--no-catalog", "--runtime", "../round-14/adapter.ts", ...args], cwd: c.success.tree("conformance"), env, limits: { ...SUITE.limits, mb }, contract: "gate" }, { slots: 1, peakMb: 0, aloneS: 5 })));
      } finally {
        c.success.close();
      }
    };
    const b1Swap = await inCopy("B1 standing (swap in the copy)", [["typed/swaps.ts", "[typedPayFixture, payFixture],", "[typedPayFixture, payFullFixture],"]], ["--swap", "../round-14/typed/swaps.ts", "--only", "PAY-01"]);
    plant("B1 standing: a swap suite red on the unmutated runtime is a fail in mutate-one's swap gate, not ok", b1Swap !== null && expect("gate", "swap", b1Swap, "pass", { kinds: ["case"] }).outcome === "fail", b1Swap ? cause(b1Swap) : "edit did not apply");
    const b5 = await inCopy("B5 standing", [["../conformance/scenarios/lifetime.scenario.ts", 'cites: ["rule:73", "C108"], run(c0) {', `cites: ["rule:73", "C108"], run(c0) { const __a: Uint8Array[] = ((globalThis as any).__plantA = []); for (let __i = 0; __i < 40; __i++) __a.push(new Uint8Array(32e6).fill(1)); Bun.sleepSync(500);`]], ["--no-output", "--only", "LIFE-09,LIFE-10,LIFE-11"], {}, 900);
    plant("B5 standing: a control killed by memory halfway is never a pass", b5 !== null && expect("control", "control", b5, "pass", { kinds: ["case"], holds: sameCases(["LIFE-09", "LIFE-10", "LIFE-11"]) }).outcome !== "pass", b5 ? cause(b5) : "edit did not apply");
    const b17 = await inCopy("B17 standing", [["adapter.ts", "if (same !== (JSON.stringify(canon(x)) === JSON.stringify(canon(y)))) {", "if (true) {"]], ["--only", "PAY-01"], { FLOW_CANON_CHECK: "1" });
    plant("B17 standing: the canon check's difference makes the canon suite red", b17 !== null && b17.answer === "stated" && outcome(b17, ["case"]) === "fail", b17 ? cause(b17) : "edit did not apply");
    // ── S1, one reader: the structural check, as a child.
    const s1 = final(await runner.run(job("reader-check", { gate: "reader-check", cmd: ["bun", join(import.meta.dir, "reader-check.ts")], cwd: tmp, env: {}, limits: { mb: 600, seconds: 60 }, contract: "gate" }, { slots: 1, peakMb: 100, aloneS: 1 })));
    plant("S1: nothing outside verdicts/ reads a child's output, ends itself, or loads what it tests before stated", outcome(s1) === "pass", s1.answer === "stated" ? s1.verdict.items.map((i) => ("why" in i ? i.why : "")).filter(Boolean).slice(0, 3).join("; ") : cause(s1));
    // ── The budget bounds every queued attempt, also while another top holds the alone lock (review of 76328de4, 1).
    const budgetScript = script("budget", `import { writeFileSync, mkdirSync } from "node:fs";\nimport { makeRunner, job, final } from ${JSON.stringify(join(import.meta.dir, "../verdicts/runner.ts"))};\nimport { describe } from ${JSON.stringify(join(import.meta.dir, "../verdicts/read.ts"))};\nif (process.argv[3] === "blocked") { mkdirSync(process.env.FLOW_VERDICTS_DIR, { recursive: true }); writeFileSync(process.env.FLOW_VERDICTS_DIR + "/alone.lock", String(process.ppid)); }\nconst r = makeRunner({ slots: 1, mb: 100, budgetS: 2 });\nconst j = (n) => r.run(job(n, { gate: n, cmd: ["sleep", "1.5"], cwd: ${JSON.stringify(tmp)}, env: {}, limits: { mb: 100, seconds: 10 }, contract: "gate" }, { slots: 1, peakMb: 10, aloneS: 1 }));\nconst done = await Promise.all(["a", "b", "c"].map(j));\nawait r.close();\nawait Bun.write(process.argv[2], JSON.stringify(done.map((d) => describe(final(d)))));\n`);
    for (const how of ["free", "blocked"] as const) {
      const f = join(tmp, `budget-${how}.json`);
      const b = await runner.program(job(`budget ${how}`, { gate: "budget", cmd: ["bun", budgetScript, f, how], cwd: tmp, env: { FLOW_NESTED: "", FLOW_RUN: "", FLOW_POOL: "", FLOW_LIMIT_MB: "", FLOW_ALONE: "", FLOW_VERDICTS_DIR: join(tmp, `lock-${how}`) }, limits: { mb: 600, seconds: 30 }, contract: "program" }, { slots: 1, peakMb: 10, aloneS: 1 }));
      const got = b.kind === "ended" && b.exit === 0 ? (JSON.parse(await Bun.file(f).text()) as string[]) : [];
      const want = how === "free" ? /^unknown: budget|unknown: unstarted: no budget left/ : /unknown: unstarted: no budget left/;
      plant(`budget: every queued attempt ends at the budget (${how === "free" ? "running and queued" : "while another top holds the lock"})`, got.length === 3 && got.slice(how === "free" ? 1 : 0).every((x) => want.test(x)), JSON.stringify(got));
    }
    // ── A process that escaped the tree and holds the pipes cannot hang the reading (review of 76328de4, 2).
    const pidFile = join(tmp, "escaped.pid");
    const escaped = final(await child("escaped", gate("escaped", `await Bun.spawn(["sh", "-c", "sleep 31.7 & echo $! > " + ${JSON.stringify(pidFile)}], { stdin: "ignore", stdout: "inherit", stderr: "inherit", detached: true }).exited`)));
    plant("live: a process holding the pipes after the child ends is abandoned after the grace (unknown) or ended as a leftover (read)", escaped.run.kind === "ended" && ((escaped.run.stdout.abandoned && cause(escaped) === "abandoned") || (escaped.run.leftovers > 0 && outcome(escaped) === "pass")), `${cause(escaped)} ${escaped.run.kind === "ended" ? `abandoned ${escaped.run.stdout.abandoned} leftovers ${escaped.run.leftovers}` : ""}`);
    const strayPid = Number(await Bun.file(pidFile).text().catch(() => "0"));
    if (strayPid > 0 && Bun.spawnSync(["ps", "-p", String(strayPid), "-o", "command="], { stdin: "ignore" }).stdout.toString().trim() === "sleep 31.7")
      try {
        process.kill(strayPid, 9);
      } catch {}
    // ── An interrupted top kills its trees and still states (#23).
    const intr = await runner.run(
      job("interrupted", { gate: "interrupted", cmd: ["bun", script("interrupted", `import { stated } from ${JSON.stringify(STATE)};\nawait stated("interrupted", async (scope) => { const { job } = await import(${JSON.stringify(join(import.meta.dir, "../verdicts/runner.ts"))}); const r = scope.runner({ slots: 1, mb: 100, budgetS: null }); setTimeout(() => process.kill(process.pid, "SIGINT"), 700); await r.run(job("s", { gate: "s", cmd: ["sleep", "61.25"], cwd: ${JSON.stringify(tmp)}, env: {}, limits: { mb: 100, seconds: 30 }, contract: "gate" }, { slots: 1, peakMb: 10, aloneS: 1 })); return []; });\n`)], cwd: tmp, env: {}, limits: { mb: 600, seconds: 20 }, contract: "gate" }, { slots: 1, peakMb: 100, aloneS: 1 }),
    );
    const leftSleep = Bun.spawnSync(["pgrep", "-f", "sleep 61.25"], { stdin: "ignore" }).exitCode === 0;
    const ir = final(intr);
    plant("live: SIGINT states unknown (interrupted) and leaves no tree", ir.answer === "stated" && outcome(ir) === "unknown" && !leftSleep, `${cause(ir)} ${outcome(ir)} left ${leftSleep}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return items;
});
