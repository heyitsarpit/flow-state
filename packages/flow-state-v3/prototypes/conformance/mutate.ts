// bun mutate.ts --runtime ../round-14 --list mutants.ts --out mutants.json [--parallel N] [--only a,b] [--search | --search-only] [--budget S]
// One mutate-one process per mutant, each in its own copy of one snapshot taken at the start (round 10), under the watchdog (review L3: a mutant
// reached 11.9 GB in round 1). An edit that no longer applies fails the run up front, so the list cannot rot silently; one that does not parse
// is noted (D113). The control runs first (D101): a gate that fails on the unmutated code would kill every mutant. Each mutant's verdict is
// mutate-one's stated one: killed by its first failing gate, killed by memory only when the limit is at least 1.5 times the control's peak,
// unknown for anything the machine decided (rerun once alone, at the top), and a survivor fails the run when it claims kills.
import { writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import type { Reading } from "./verdicts/read.ts";
import type { Item } from "./verdicts/verdict.ts";
import { stated } from "./verdicts/state.ts";

export type Mutant = {
  id: string;
  kills: readonly string[]; // the ids this mutant breaks: citations it can prove (D33)
  edits: ReadonlyArray<readonly [file: string, find: string, replace: string]>;
  unscored?: string; // a reviewed reason it cannot be scored (a CPU loop inside one step is a time kill, the machine's): listed, never counted
};

export const mutantItem = async (m: Mutant, r: Reading): Promise<Item> => {
  const { describe, outcome } = await import("./verdicts/read.ts");
  const { firstFail } = await import("./verdicts/verdict.ts");
  if (r.answer === "bound") return { kind: "mutant", name: m.id, outcome: "pass", why: "killed by memory", detail: { by: "rss", killers: [] } };
  if (r.answer === "none" || outcome(r) === "unknown") return { kind: "mutant", name: m.id, outcome: "unknown", why: describe(r) };
  const by = firstFail(r.verdict.items);
  if (by !== undefined)
    return { kind: "mutant", name: m.id, outcome: "pass", why: `killed by ${by.name}`, detail: { by: by.name, killers: ((by.detail as { failed?: string[] } | undefined)?.failed ?? []) as string[] } };
  if (m.kills.length === 0) return { kind: "mutant", name: m.id, note: "survived; claims nothing" };
  return { kind: "mutant", name: m.id, outcome: "fail", why: `survived; claims ${m.kills.join(",")}` };
};

if (import.meta.main)
  await stated("mutate", async (scope) => {
    const { MACHINE_MB, MUTANT, MUTANT_SEARCH } = await import("./limits.ts");
    const { describe, outcome } = await import("./verdicts/read.ts");
    const { final } = await import("./verdicts/runner.ts");
    const { check, copyOf } = await import("./verdicts/snapshot.ts");
    type Job = import("./verdicts/runner.ts").Job;
    type Edit = import("./verdicts/snapshot.ts").Edit;
    const arg = (k: string, d: string) => {
      const i = process.argv.indexOf(k);
      return i < 0 ? d : process.argv[i + 1]!;
    };
    const here = import.meta.dir;
    const source = resolve(here, arg("--runtime", "../round-6"));
    const listFile = resolve(source, arg("--list", "mutants.ts"));
    const out = resolve(source, arg("--out", "mutants.json"));
    const author = arg("--author", "builder");
    const only = arg("--only", "");
    const withSearch = process.argv.includes("--search");
    const searchOnly = process.argv.includes("--search-only");
    const extra = ["--serial", ...(withSearch ? ["--search"] : []), ...(searchOnly ? ["--search-only"] : [])];
    const parallel = Math.min(8, Math.max(1, Number(arg("--parallel", "1")) || 1));
    const budgetS = arg("--budget", "") ? Number(arg("--budget", "")) : null;
    const { MUTANTS } = (await import(listFile)) as { MUTANTS: readonly Mutant[] };
    const list = only ? MUTANTS.filter((m) => only.split(",").includes(m.id)) : MUTANTS;
    const snap = scope.snapshot([here, source]);
    const tree = basename(source);
    const scored = list.filter((m) => m.unscored === undefined);
    const problems = scored.map((m) => check(snap, tree, m.id, m.edits as readonly Edit[]));
    const rotted = problems.filter((p) => p?.problem === "does not apply");
    if (rotted.length) {
      for (const p of rotted) console.log(`ROTTED   ${p!.id.padEnd(36)} ${p!.why}`);
      return rotted.map((p) => ({ kind: "list", name: p!.id, outcome: "fail" as const, why: p!.why }));
    }
    const limits = withSearch || searchOnly ? MUTANT_SEARCH : MUTANT;
    const mutantJob = (id: string, edits: readonly Edit[], peakMb: number, aloneS: number): Job => ({
      name: id,
      size: { slots: 1, peakMb, aloneS, limitMb: limits.mb },
      open: async () => {
        const c = copyOf(snap, tree, edits);
        if (c._tag === "Failure") throw new Error(c.failure);
        const cwd = c.success.tree("conformance");
        return { spec: { gate: "mutate-one", cmd: ["bun", join(cwd, "mutate-one.ts"), "--runtime", `../${tree}/adapter.ts`, ...extra], cwd, env: {}, limits, contract: "gate" }, close: c.success.close };
      },
    });
    const runner = scope.runner({ slots: parallel, mb: Math.min(MACHINE_MB, parallel * limits.mb), budgetS });
    const control = final(await runner.run(mutantJob("control", [], 0, 0)));
    if (outcome(control) !== "pass") {
      console.log(`CONTROL FAILED: the unmutated code: ${describe(control)}`);
      return [{ kind: "control", name: "control", outcome: outcome(control) === "unknown" ? "unknown" : "fail", why: describe(control) }];
    }
    const ref = control.run.kind === "ended" ? control.run.peakMb : 0;
    const aloneS = control.run.kind === "ended" ? control.run.ms / 1000 : 60;
    console.log(`control: the unmutated code passes every gate (${Math.round(aloneS)} s, ${ref} MB)`);
    const runs = scored.map((m, i) => (problems[i] ? undefined : runner.run(mutantJob(m.id, m.edits as readonly Edit[], ref, aloneS))));
    const items: Item[] = [{ kind: "control", name: "control", outcome: "pass", why: "" }];
    const rows: unknown[] = [];
    for (const m of list.filter((x) => x.unscored !== undefined)) {
      items.push({ kind: "mutant", name: m.id, note: `unscored (reviewed): ${m.unscored}` });
      rows.push({ id: m.id, kills: m.kills, killed: false, killers: [], author, by: "unscored" });
      console.log(`UNSCORED ${m.id.padEnd(36)} ${m.unscored}`);
    }
    for (const [i, m] of scored.entries()) {
      const p = problems[i];
      if (p) {
        items.push({ kind: "mutant", name: m.id, note: `invalid (D113): ${p.why}` });
        rows.push({ id: m.id, kills: m.kills, killed: false, killers: [], author, by: "invalid", peakMb: 0 });
        console.log(`INVALID  ${m.id.padEnd(36)} does not parse: ${p.why}`);
        continue;
      }
      const d = await runs[i]!;
      const r = final(d);
      const it = await mutantItem(m, r);
      items.push(it);
      const killed = "outcome" in it && it.outcome === "pass";
      const unknown = "outcome" in it && it.outcome === "unknown";
      const det = (("detail" in it ? it.detail : undefined) ?? {}) as { by?: string; killers?: readonly string[] };
      const killers = det.killers ?? [];
      rows.push({ id: m.id, kills: m.kills, killed, killers, author, by: unknown ? `unknown:${describe(r)}` : (det.by ?? "survived"), ...(d.alone ? { alone: describe(d.first) } : {}), peakMb: r.run.kind === "ended" ? r.run.peakMb : 0 });
      const label = unknown ? "UNKNOWN " : killed ? "KILLED  " : "SURVIVED";
      console.log(`${label} ${m.id.padEnd(36)} ${d.alone ? `(again, alone, after ${describe(d.first)}) ` : ""}${killed ? `${det.by}: ${killers.length}: ${killers.slice(0, 4).join(" ")}${killers.length > 4 ? " ..." : ""}` : "why" in it ? it.why : it.note}`);
    }
    writeFileSync(out, JSON.stringify(rows, null, 1));
    const mutants = items.filter((x) => x.kind === "mutant");
    const scoredItems = mutants.filter((x) => "outcome" in x);
    const n = (o: string) => scoredItems.filter((x) => "outcome" in x && x.outcome === o).map((x) => x.name);
    const byRss = (rows as Array<{ id: string; by: string }>).filter((x) => x.by === "rss").map((x) => x.id);
    console.log(`\n${n("pass").length}/${scoredItems.length} killed (${author}); by memory: ${byRss.join(" ") || "none"}; survived, claiming kills: ${n("fail").join(" ") || "none"}; noted: ${mutants.length - scoredItems.length}${n("unknown").length ? `; unknown, so this run proves nothing for them: ${n("unknown").join(" ")}` : ""}`);
    return items;
  });
