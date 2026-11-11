// Conformance R11: runs every old lie that the old suite records red on a ported PAY case against the new suite, each on an edited copy of round-14
// (whitespace-insensitive edits, as the old suite applied them). Usage, from packages/flow-state-v3: SCRATCH=<dir> bun prototypes/conformance/compare-new-suite.ts [lie ...]
// Retires with the old suite (Conformance R11).
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const P = join(import.meta.dir, "..", "..");
const C = join(P, "prototypes/conformance");
const S = process.env.SCRATCH ?? join(process.env.TMPDIR ?? "/tmp", "compare-lies");
const { applyEdits } = await import(join(C, "verdicts/snapshot.ts"));

const fLines = readFileSync(join(C, "falsify.ts"), "utf8").split("\n");
const js = new Bun.Transpiler({ loader: "ts" }).transformSync(
  "(function(){\n" + fLines.slice(288, 483).join("\n") + "\nreturn ALL;\n})()",
);
const ALL: any[] = (0, eval)(js);

const red: Record<string, string[]> = {};
for (const f of readdirSync(join(C, "lie-cases")))
  if (f.endsWith(".json"))
    Object.assign(red, JSON.parse(readFileSync(join(C, "lie-cases", f), "utf8")));

const portedOf = (ids: string[]) =>
  [...new Set(ids)].filter((x) => {
    const m = /^PAY-(\d+)/.exec(x);
    const n = m ? Number(m[1]) : 0;
    return n >= 1 && n <= 22 && n !== 11 && n !== 17;
  });

const only = process.argv.slice(2);
const lies = ALL.filter((x) => portedOf(red[x[0]] ?? []).length > 0 && (only.length === 0 || only.includes(x[0])));
const out: string[] = [];

for (const lie of lies) {
  const [id, , edits] = lie as [string, string, Array<[string, string, string]>];
  const root = join(S, id);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(join(root, "prototypes"), { recursive: true });
  cpSync(join(P, "prototypes/round-14"), join(root, "prototypes/round-14"), { recursive: true });
  cpSync(C, join(root, "prototypes/conformance"), { recursive: true });
  symlinkSync(join(P, "..", "..", "node_modules"), join(root, "node_modules"));
  let applied = true;
  for (const [file, find, rep] of edits) {
    const f = join(root, "prototypes/round-14", file);
    const next = applyEdits(readFileSync(f, "utf8"), find, rep);
    if (next === undefined) applied = false;
    else writeFileSync(f, next);
  }
  if (!applied) {
    out.push(`${id}\tNO-APPLY`);
    rmSync(root, { recursive: true, force: true });
    continue;
  }
  const run = spawnSync(
    "bun",
    ["conformance/runner/main.ts", "suite", "--runtime", join(root, "prototypes/round-14"), "--parallel", "4"],
    { cwd: P, encoding: "utf8", timeout: 200_000, stdio: ["ignore", "pipe", "pipe"] },
  );
  const lines = (run.stdout ?? "").split("\n");
  const fails = lines.filter((l) => l.startsWith("FAIL"));
  const portedRed = fails.filter((l) => /^FAIL PAY-/.test(l));
  const byOracle = portedRed.filter((l) => !/  case: /.test(l));
  out.push(
    `${id}\tred ${fails.length}\tported ${portedRed.length}\tby oracle ${byOracle.length}\t${(portedRed[0] ?? fails[0] ?? "").slice(0, 220)}`,
  );
  rmSync(root, { recursive: true, force: true });
}

console.log(out.join("\n"));
