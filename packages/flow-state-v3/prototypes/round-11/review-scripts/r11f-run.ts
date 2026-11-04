// In-place mutant runner for the review worktree: apply one edit (mutate.ts's whitespace-free match), run the plain suite as mutate-one does, and for a
// survivor the round's checks, typed compare, date check and CLI pins; then restore the file. Prints one line per mutant. Writes no file of its own.
// bun r11f-run.ts <worktree prototypes dir> <id,id,...>
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MUTANTS } from "./r11f-mutants.ts";

const root = process.argv[2]!;
const ids = (process.argv[3] ?? "").split(",").filter(Boolean);
const round = join(root, "round-11");
const run = (args: string[], ms: number) => {
  const p = Bun.spawnSync(["bun", ...args], { cwd: join(root, "conformance"), timeout: ms, stdin: "ignore" });
  return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
};
for (const id of ids) {
  const mu = MUTANTS.find((x) => x.id === id);
  if (!mu) {
    console.log(`NOSUCH  ${id}`);
    continue;
  }
  const saved: Array<[string, string]> = [];
  try {
    for (const [file, find, replace] of mu.edits) {
      const p = join(round, file);
      const text = readFileSync(p, "utf8");
      const pattern = new RegExp(find.split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*"));
      if (!pattern.test(text)) throw new Error(`does not apply: ${find.slice(0, 60)}`);
      saved.push([p, text]);
      const next = text.replace(pattern, () => replace);
      new Bun.Transpiler({ loader: "ts" }).scan(next);
      writeFileSync(p, next);
    }
    const t0 = Date.now();
    if (process.argv.includes("--full")) {
      const r = run(["mutate-one.ts", "--runtime", "../round-11/adapter.ts"], 280_000);
      console.log(`FULL           ${id.padEnd(30)} ${((Date.now() - t0) / 1000).toFixed(0)}s ${r.out.trim().split("\n").at(-1)}`);
      continue;
    }
    const s = run(["main.ts", "--round", "99", "--no-catalog", "--runtime", "../round-11/adapter.ts"], 200_000);
    const fails = s.out.split("\n").filter((l) => l.startsWith("FAIL"));
    const named = fails.filter((l) => !l.split("\t")[1]?.startsWith("output:")).map((l) => l.slice(4).split("\t")[0]!.trim());
    const output = fails.filter((l) => l.split("\t")[1]?.startsWith("output:")).map((l) => l.slice(4).split("\t")[0]!.trim());
    const summary = s.out.split("\n").find((l) => l.startsWith("SUMMARY")) ?? `no SUMMARY: ${(s.err || s.out).slice(-300).replace(/\n/g, " | ")}`;
    let extra = "";
    if (!named.length && summary.startsWith("SUMMARY")) {
      const gates = [
        ...["front-check", "types-check", "mailq-check", "score-check"].map((f) => join(round, "checks", `${f}.ts`)),
        join(round, "typed/compare.ts"),
        join(round, "typed/date-check.ts"),
        join(round, "cli/main.ts"),
      ];
      const hit: string[] = [];
      for (const g of gates) {
        const r = run([g], 150_000);
        if (r.code !== 0) hit.push(`${g.split("/").slice(-2).join("/")}: ${(r.out.split("\n").find((l) => /FAIL|differ/i.test(l)) ?? `exit ${r.code}`).slice(0, 140)}`);
      }
      extra = hit.length ? `checks: ${hit.join(" ;; ")}` : "checks: none";
    }
    const verdict = named.length ? "KILLED" : !summary.startsWith("SUMMARY") ? "CRASH" : extra !== "checks: none" ? "KILLED-check" : output.length ? "KILLED-output" : "SURVIVED";
    console.log(`${verdict.padEnd(14)} ${id.padEnd(30)} named ${named.length} output ${output.length} ${((Date.now() - t0) / 1000).toFixed(0)}s | ${named.slice(0, 4).join(" ")} | ${output.slice(0, 3).join(" ")} | ${extra} | ${summary.slice(0, 160)}`);
  } catch (e) {
    console.log(`INVALID        ${id.padEnd(30)} ${String(e).slice(0, 200)}`);
  } finally {
    for (const [p, text] of saved) writeFileSync(p, text);
  }
}
