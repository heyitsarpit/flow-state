// Fault injection: bun .../conformance/mutate.ts --runtime ../round-1
// Each mutant is a source edit in a scratch copy of the runtime, imported in this one process. No flag or hook exists
// in the runtime for it. An edit that no longer applies fails the run, so this list cannot rot silently.
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { RuntimeModule } from "./harness.ts";
import { runScenarios } from "./main.ts";
import { searchPay } from "./search/pay.search.ts";

type Mutant = {
  id: string;
  required?: boolean;
  edits: ReadonlyArray<[file: string, find: string, replace: string]>;
};

const MUTANTS: readonly Mutant[] = [
  {
    id: "drop-fence",
    required: true,
    edits: [["step.ts", "if (lane && h && h.wire && h.wire.gen === i.send) {", "if (lane && h) {"]],
  },
  {
    id: "retry-mints-new-id",
    required: true,
    edits: [
      [
        "lane.ts",
        "head: { ...l!.head, waits: { ack: false, capture: persisted }",
        "head: { ...l!.head, id: tx.env.id(), waits: { ack: false, capture: persisted }",
      ],
    ],
  },
  {
    id: "invoke-before-ack",
    required: true,
    edits: [
      [
        "persistence.ts",
        'blocksInvoke: (_s, a) => (a.waits.ack ? "ack" : a.waits.capture ? "capture" : false),',
        "blocksInvoke: () => false,",
      ],
    ],
  },
  {
    id: "restore-notsent-when-acked",
    required: true,
    edits: [["persistence.ts", 'l.state === "Held" || l.head.acked ?', 'l.state === "Held" ?']],
  },
  {
    id: "rule18-off",
    edits: [["lane.ts", 'ending.ch === "failure" && h.mayHaveApplied ?', "false ?"]],
  },
  {
    id: "timeout-no-interrupt",
    edits: [
      [
        "step.ts",
        'return void tx.commands.push({ k: "interrupt", attempt: t.attempt!, send })',
        "return",
      ],
    ],
  },
  {
    id: "timeout-never-armed",
    edits: [["lane.ts", "op.timeoutMs === undefined ? undefined", "true ? undefined"]],
  },
  {
    id: "timers-not-restored",
    edits: [["persistence.ts", "for (const t of timers) armTimer(tx, t)", ""]],
  },
  {
    id: "late-treated-as-current",
    edits: [
      [
        "step.ts",
        "const alive = a.activations[item.owner.node] === item.owner.activation",
        "const alive = true",
      ],
    ],
  },
  {
    id: "rule15-off",
    edits: [["step.ts", "if (late && leavesWork(tx, a, alt, item)) {", "if (false) {"]],
  },
  {
    id: "ending-cell-lost-on-refusal",
    edits: [
      ["step.ts", "const kept = { w: tx.w,", "const kept = { w: world0,"],
      [
        "step.ts",
        'if (item.k === "ending") admit(tx, item)',
        'const world0 = tx.w; if (item.k === "ending") admit(tx, item)',
      ],
    ],
  },
  {
    id: "storage-unbounded",
    edits: [["persistence.ts", "const STORAGE_MS = 10_000", "const STORAGE_MS = 1e12"]],
  },
  { id: "dispose-unbounded", edits: [["step.ts", "?? 5000)", "?? 1e12)"]] },
  {
    id: "resend-skips-capture",
    edits: [
      [
        "lane.ts",
        "waits: { ack: false, capture: persisted }",
        "waits: { ack: false, capture: false }",
      ],
    ],
  },
  {
    id: "id-not-from-env",
    edits: [["lane.ts", "id: tx.env.id(), mint:", "id: `r${Math.random()}`, mint:"]],
  },
  {
    id: "reinvoke-settled",
    edits: [
      [
        "step.ts",
        'l.state !== "InFlight" || l.head.wire || l.head.settled) continue',
        'l.state !== "InFlight" || l.head.wire) continue',
      ],
    ],
  },
  {
    id: "observer-loses-interrupts",
    edits: [
      [
        "driver.ts",
        "fibers.delete(key);",
        "fibers.delete(key); if (Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)) return;",
      ],
    ],
  },
  {
    id: "cancelled-reads-interrupted",
    edits: [["step.ts", 'cancelled ? "Cancelled" : "Interrupted"', '"Interrupted"']],
  },
  {
    id: "release-keeps-lane",
    edits: [
      [
        "lane.ts",
        'note(tx, "Released", { op: l!.op, attempt: l!.head.id }); deleteLane(tx, l!.id);',
        'note(tx, "Released", { op: l!.op, attempt: l!.head.id })',
      ],
    ],
  },
  {
    id: "unknown-resolves-lane",
    edits: [
      [
        "lane.ts",
        'if (a.ending?.ch !== "unknown") return deleteLane(tx, l!.id)',
        "return deleteLane(tx, l!.id)",
      ],
    ],
  },
  {
    id: "double-commit-mints",
    edits: [
      [
        "lane.ts",
        'commit: { Idle: "mint", InFlight: "rejected", Held: "rejected" }',
        'commit: { Idle: "mint", InFlight: "mint", Held: "mint" }',
      ],
    ],
  },
  {
    id: "dead-timer-fires",
    edits: [
      [
        "step.ts",
        'if (item.k === "fire" && !Object.values(a.activations).includes(item.activation)) {',
        "if (false) {",
      ],
      ["step.ts", "if (t.activation === exited) disarmTimer(tx, t.key)", ""],
    ],
  },
];

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(k);
  return i < 0 ? d : process.argv[i + 1]!;
};
const source = resolve(import.meta.dir, arg("--runtime", "../round-1"));
const scratchRoot = resolve(source, "..");
let survived = 0;
for (const m of MUTANTS) {
  const dir = join(scratchRoot, `.mut-${m.id}`);
  if (existsSync(dir)) rmSync(dir, { recursive: true });
  cpSync(source, dir, { recursive: true });
  for (const [file, find, replace] of m.edits) {
    const p = join(dir, file);
    const text = readFileSync(p, "utf8");
    // Whitespace-blind, so reformatting the runtime does not silently retire a mutant.
    const pattern = new RegExp(
      find
        .split(/\s+/)
        .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("\\s*"),
    );
    if (!pattern.test(text)) throw new Error(`${m.id}: edit does not apply to ${file}: ${find}`);
    writeFileSync(
      p,
      text.replace(pattern, () => replace),
    );
  }
  const mod = (await import(join(dir, "adapter.ts"))) as RuntimeModule;
  const results = runScenarios(mod.makeHarness);
  const killers = results
    .filter((r) => !r.ok)
    .map((r) => (r.variant ? `${r.id}/${r.variant}` : r.id));
  // The search runs for the four the catalog names, and for anything the scenarios missed.
  const s =
    m.required || killers.length === 0
      ? searchPay(mod.makeHarness, { cap: 30_000, depth: 5, deadlineMs: 15_000 })
      : ({ verdict: "skipped" } as { verdict: string; failure?: string });
  rmSync(dir, { recursive: true });
  const killed = killers.length > 0 || s.verdict === "failed";
  if (!killed) survived++;
  console.log(
    `${killed ? "KILLED  " : "SURVIVED"} ${m.id.padEnd(30)} scenarios: ${killers.join(" ") || "-"} | search: ${s.verdict === "failed" ? s.failure : "-"}`,
  );
}
console.log(`\n${MUTANTS.length - survived}/${MUTANTS.length} killed`);
