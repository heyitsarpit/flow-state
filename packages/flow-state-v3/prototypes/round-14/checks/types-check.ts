// Re-audit H2: D91's compile-time pins are a gate. `tsc` on `typed/tsconfig.json`: every `@ts-expect-error` must be an error, and the
// typed front end must compile. Re-check M1', D156: each directive is found as TypeScript finds one, by comment token (a comment that only
// mentions the words is no directive), and each is pinned by its own text, so "which refusal" is part of the gate, not only "how many".
import { existsSync, readFileSync, symlinkSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { checkItems, stated } from "../../conformance/verdicts/state.ts";

await stated("checks/types-check.ts", async (scope) => {
const { job } = await import("../../conformance/verdicts/runner.ts");
const { programOutput } = await import("../../conformance/verdicts/spawn.ts");
const { firstLines, tscDiagnostics } = await import("../../conformance/verdicts/programs.ts");
const { PROGRAM } = await import("../../conformance/limits.ts");
const runner = scope.runner({ slots: 1, mb: PROGRAM.size.peakMb, budgetS: null });
const tscRun = async (args: readonly string[]) => {
  const r = await runner.program(job("tsc", { gate: "tsc", cmd: [tsc, ...args], cwd: import.meta.dir, env: {}, limits: PROGRAM.limits, contract: "program" }, PROGRAM.size));
  const p = r.kind === "ended" && !r.killed && r.signal === null ? programOutput(r) : null;
  return p ?? { unknown: `tsc did not end by itself: ${r.kind === "ended" ? (r.decided ?? r.signal) : r.message}` };
};
const unknownItem = (why: string) => [{ kind: "check", name: "types", outcome: "unknown" as const, why }];
const typed = join(import.meta.dir, "../typed");
let dir = import.meta.dir;
while (!existsSync(join(dir, "node_modules/.bin/tsc")) && dirname(dir) !== dir) dir = dirname(dir);
let tsc = join(dir, "node_modules/.bin/tsc");
// Re-check L2 (stage F): a fresh worktree has no `node_modules`; then the main checkout's, by git's common dir, as `falsify.ts` finds it.
// Re-check L1 (stage G): and its modules too. `tsc` resolves `effect` by walking up from each importing file, so the worktree's root gets a
// `node_modules` link to the main checkout's for this run, the same packages `tsc` itself came from, and loses it at exit.
let linked: string | undefined;
if (!existsSync(tsc)) {
  const common = Bun.spawnSync(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: import.meta.dir, stdin: "ignore" }).stdout.toString().trim();
  if (common) tsc = join(dirname(common), "node_modules/.bin/tsc");
  const top = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"], { cwd: import.meta.dir, stdin: "ignore" }).stdout.toString().trim();
  if (common && top && existsSync(tsc) && !existsSync(join(top, "node_modules"))) {
    symlinkSync(join(dirname(common), "node_modules"), join(top, "node_modules"));
    linked = join(top, "node_modules");
    process.on("exit", () => {
      if (linked) unlinkSync(linked);
    });
  }
}
if (!existsSync(tsc)) {
  console.log("FAIL  types: no tsc found");
  return checkItems("types", ["no tsc found"]);
}
const p = await tscRun(["-p", join(typed, "tsconfig.json")]);
if ("unknown" in p) return unknownItem(p.unknown);
const bad: string[] = [];
if (p.exit !== 0) bad.push(`tsc exit ${p.exit}: ${firstLines(p, 3).join(" | ")}`);
// The pins this round states, by their words. A refusal removed with its directive compiles; a missing text here does not.
const PINS = [
  "a key names a field that is not the input's",
  "`NoSuchTag` is no failure this commit has",
  "an event with a payload cannot be mapped with no `.from`",
  "`text` is not on `Saved`",
  "memory has no `m`",
  "no such state",
  "a commit's input is the contract's",
  "a key is the contract's key fields",
  "a contract that does not name its commit's service has no `outcomes`", // round 12, D213
  "a boot that does not give a machine's service", // round 12, D213
  "a select reads its handler's event: `Saved` has no `text`", // round 12, the compile prototype's typed selectors
  "a boot that does not give a placed fragment's service", // round 12, mid review H1
  "a services list that is not a tuple has no `outcomes`", // round 12, mid review L1
  "a boot that does not give a nested fragment's service", // round 13, round 12 review L1
  "a boot that does not give a node trait's service", // round 13, round 12 review L1
  "a boot that does not give a subroutine's service", // round 13, round 12 review L1
  "the commit context has no `signal` (OD29 E step 2)", // round 14
  "a value-named ref takes no input at ensure: the value is the input", // round 14, rule 74
  "a value missing an input field names no actor", // round 14, rule 74
  "a fresh literal with an extra field: Flow keeps only the input fields", // round 14, rule 74
  "a singleton's name is a literal; a runtime string is a type error (OD30 Q4)", // round 14, rule 74
  "identity fields encode to strings (OD30 Q6): a number field has no value form", // round 14, rule 74
  "a machine with no input can only be a singleton", // round 14, rule 74
  "a machine with input fields is named only by value (D4)", // round 14, D4
  "a singleton takes no input at ensure (D4)", // round 14, D4
  "`allow` is cut from v1 (U5)", // round 15
  "a ref carries no persist: persistence is the machine's, on its definition (U15, U19)", // round 15
];
// What TypeScript itself takes for a directive: a single-line comment token whose text matches its own rule, `^\/\/\/?\s*@ts-expect-error`.
// The installed TypeScript is 7 (native), with no JS scanner to call, so this is a scanner of comment and string tokens, not a text search:
// a `//` inside a string, a template or a block comment is no comment, and a comment that only mentions the words is no directive.
// That each directive is used (its line errors) is `tsc`'s own check above.
const directives = (text: string): string[] => {
  const found: string[] = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i]!;
    const d = text[i + 1];
    if (c === "/" && d === "/") {
      const end = text.indexOf("\n", i);
      const tok = text.slice(i, end < 0 ? n : end);
      const m = /^\/\/\/?\s*@ts-expect-error\b\s*(.*)$/.exec(tok);
      if (m) found.push(m[1]!.trim());
      i = end < 0 ? n : end;
    } else if (c === "/" && d === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end < 0 ? n : end + 2;
    } else if (c === '"' || c === "'" || c === "`") {
      i++;
      while (i < n && text[i] !== c) i += text[i] === "\\" ? 2 : 1; // a template's `${}` holds no directive in this file; stated
      i++;
    } else i++;
  }
  return found;
};
const got = directives(readFileSync(join(typed, "type-tests.ts"), "utf8"));
for (const want of PINS) if (!got.includes(want)) bad.push(`no @ts-expect-error directive pins: ${want}`);
for (const g of got) if (!PINS.includes(g)) bad.push(`a directive this check does not state: ${g || "(no words)"}`);
if (got.length !== PINS.length) bad.push(`type-tests.ts holds ${got.length} directives, ${PINS.length} stated`);
// Re-check L1 (stage E): a directive's words say which refusal; the line under it must error for THAT refusal, not for a typo. So the
// directives are stripped (lines kept) in a copy beside the file, `tsc` runs on it once, and each line under a directive must hold exactly
// the error pinned here, by code and words, and no other.
const ERRORS: Record<string, readonly [string, string]> = {
  "a key names a field that is not the input's": ["TS2322", `Type '"b"' is not assignable to type '"a"'`],
  "`NoSuchTag` is no failure this commit has": ["TS2353", "'NoSuchTag' does not exist in type"],
  "an event with a payload cannot be mapped with no `.from`": ["TS2322", `Type 'EventToken<"Saved"`],
  "`text` is not on `Saved`": ["TS2339", "Property 'text' does not exist"],
  "memory has no `m`": ["TS2322", "Type '() => { m: number; }' is not assignable"],
  "no such state": ["TS2339", "Property 'C' does not exist on type '{ readonly A: Tok; }"], // round 12: the ordered state list's type
  "a commit's input is the contract's": ["TS2322", "Type 'number' is not assignable to type 'string'"],
  "a key is the contract's key fields": ["TS2741", "Property 'docId' is missing in type '{ text: string; }'"],
  "a contract that does not name its commit's service has no `outcomes`": ["TS2339", "Property 'outcomes' does not exist"],
  "a boot that does not give a machine's service": ["TS2345", "Argument of type 'Context<Other>' is not assignable"],
  "a select reads its handler's event: `Saved` has no `text`": ["TS2339", "Property 'text' does not exist on type '{ readonly revision: number; }'"],
  "a boot that does not give a placed fragment's service": ["TS2345", "Argument of type 'Context<Other>' is not assignable"],
  "a services list that is not a tuple has no `outcomes`": ["TS2339", "Property 'outcomes' does not exist"],
  "a boot that does not give a nested fragment's service": ["TS2345", "Argument of type 'Context<Other>' is not assignable"],
  "a boot that does not give a node trait's service": ["TS2345", "Argument of type 'Context<Other>' is not assignable"],
  "a boot that does not give a subroutine's service": ["TS2345", "Argument of type 'Context<Other>' is not assignable"],
  "the commit context has no `signal` (OD29 E step 2)": ["TS2339", "Property 'signal' does not exist on type 'CommitCtx'"], // round 14
  "a value-named ref takes no input at ensure: the value is the input": ["TS2554", "Expected 1 arguments, but got 2"], // round 14, rule 74
  // Round 14, rule 74: `actorRef`'s two forms are overloads, so tsc's first line is the same for each refusal; which form refused is in its later lines.
  "a value missing an input field names no actor": ["TS2769", "No overload matches this call"],
  "a fresh literal with an extra field: Flow keeps only the input fields": ["TS2769", "No overload matches this call"],
  "a singleton's name is a literal; a runtime string is a type error (OD30 Q4)": ["TS2769", "No overload matches this call"],
  "identity fields encode to strings (OD30 Q6): a number field has no value form": ["TS2769", "No overload matches this call"],
  "a machine with no input can only be a singleton": ["TS2769", "No overload matches this call"],
  "a machine with input fields is named only by value (D4)": ["TS2769", "No overload matches this call"],
  "a singleton takes no input at ensure (D4)": ["TS2554", "Expected 1 arguments, but got 2"],
  "`allow` is cut from v1 (U5)": ["TS2322", `Type '"allow"' is not assignable`],
  "a ref carries no persist: persistence is the machine's, on its definition (U15, U19)": ["TS2554", "Expected 2 arguments, but got 3"],
};
{
  const src = readFileSync(join(typed, "type-tests.ts"), "utf8").split("\n");
  const under = new Map<number, string>(); // 1-based line under each directive -> its words
  src.forEach((l, i) => {
    const m = /^\s*\/\/\/?\s*@ts-expect-error\b\s*(.*)$/.exec(l);
    if (m) under.set(i + 2, m[1]!.trim());
  });
  const stripped = src.map((l, i) => (under.has(i + 2) ? l.replace(/\/\/.*$/, "//") : l)).join("\n");
  const tag = `zz-pins-${process.pid}`;
  const { writeFileSync, rmSync } = await import("node:fs");
  writeFileSync(join(typed, `${tag}.ts`), stripped);
  writeFileSync(join(typed, `${tag}.json`), JSON.stringify({ extends: "./tsconfig.json", files: [`${tag}.ts`] }));
  try {
    const q = await tscRun(["-p", join(typed, `${tag}.json`)]);
    if ("unknown" in q) return unknownItem(q.unknown);
    const errs = tscDiagnostics(q);
    for (const [line, words] of under) {
      const want = ERRORS[words];
      const here = errs.filter((m) => m.line === line);
      if (!want) bad.push(`no error pinned for the directive: ${words}`);
      else if (here.length !== 1 || here[0]!.code !== want[0] || !here[0]!.message.includes(want[1])) bad.push(`the line under "${words}" errors for something else: ${here.map((m) => `${m.code} ${m.message.slice(0, 90)}`).join(" | ") || "no error"}`);
    }
  } finally {
    rmSync(join(typed, `${tag}.ts`), { force: true });
    rmSync(join(typed, `${tag}.json`), { force: true });
  }
}
for (const b of bad) console.log(`FAIL  types: ${b}`);
console.log(bad.length ? "TYPES FAIL" : `TYPES PASS  tsc clean, ${got.length} directives, each by its words`);
return checkItems("types", bad);
});
