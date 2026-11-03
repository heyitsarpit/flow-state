// bun run-mut.ts <id> [<id>...] : copy round-10 to a sibling `mut-<id>`, apply edits, run the suite named-only and with output.
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const P = "/private/tmp/claude-501/-Users-arpit--claude-spares-spare-cCgI4U/575b2ea3-def0-491f-9ce0-84ae4fd1afbf/scratchpad/recheck10c/wt/packages/flow-state-v3/prototypes";
const flex = (find: string) => new RegExp(find.trim().split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*"));
const G125 = "const a = getActor(tx.w.actors, item.actor); const lane = tx.w.lanes[laneId];";
const LAUNDER = (extra: string) =>
  `const a = getActor(tx.w.actors, item.actor); const lane = tx.w.lanes[laneId]; if (item.ending.ch !== "success" && [...tx.w.mail].some((x) => x.actor !== item.actor)) { ${extra} return note(tx, "evidenceOnly", { op: item.op, attempt: item.attempt ?? "" }); }`;
const LAUNDER2 = (cond: string, extra: string) =>
  `const a = getActor(tx.w.actors, item.actor); const lane = tx.w.lanes[laneId]; if (a && ${cond}) { ${extra} return note(tx, "evidenceOnly", { op: item.op, attempt: item.attempt ?? "" }); }`;
const REL = 'note(tx, "Released", { op: item.op, attempt: item.attempt ?? "" });';
const M: Record<string, ReadonlyArray<readonly [string, string, string]>> = {
  "lie.serialize-as-latest": [["lane.ts", 'if (policy === "latest") { for (const x of l.w) supersede(tx, a.op, x);', 'if (policy === "latest" || policy === "serialize") { for (const x of l.w) supersede(tx, a.op, x);']],
  "lie.letgo-all-parked-on-cancel": [["lane.ts", "for (const p of l.parked) if (p.kept) note(tx, \"KeptLetGo\", { op: l.op, attempt: p.attempt ?? \"\" }); return withParked(tx, l, l.parked.filter((p) => !p.kept));", "for (const p of l.parked) note(tx, p.kept ? \"KeptLetGo\" : \"ParkedLetGo\", { op: l.op, attempt: p.attempt ?? \"\" }); return withParked(tx, l, []);"]],
  "lie.letgo-all-parked-on-cancel-b": [["lane.ts", "if (!l.parked.some((p) => p.kept)) return l; for (const p of l.parked) if (p.kept) note(tx, \"KeptLetGo\", { op: l.op, attempt: p.attempt ?? \"\" }); return withParked(tx, l, l.parked.filter((p) => !p.kept));", "if (!l.parked.length) return l; for (const p of l.parked) note(tx, p.kept ? \"KeptLetGo\" : \"ParkedLetGo\", { op: l.op, attempt: p.attempt ?? \"\" }); return withParked(tx, l, []);"]],
  "fence.reuse-gen": [["timers.ts", "const gen = nextGen(tx);", "const gen = (void nextGen(tx), 1);"]],
  "lie.like2-plain": [["turn.ts", G125, LAUNDER2('item.ending.ch !== "success" && item.op === "like" && String(item.attempt).endsWith("-2")', "")]],
  "lie.like2-released": [["turn.ts", G125, LAUNDER2('item.ending.ch !== "success" && item.op === "like" && String(item.attempt).endsWith("-2")', REL)]],
  "lie.like2nc-plain": [["turn.ts", G125, LAUNDER2('item.ending.ch !== "success" && item.op === "like" && String(item.attempt).endsWith("-2") && (item.ending as any).value?.why !== "Cancelled"', "")]],
  "lie.like2nc-released": [["turn.ts", G125, LAUNDER2('item.ending.ch !== "success" && item.op === "like" && String(item.attempt).endsWith("-2") && (item.ending as any).value?.why !== "Cancelled"', REL)]],
  "lie.save-plain": [["turn.ts", G125, LAUNDER2('item.ending.ch !== "success" && item.op === "save"', "")]],
  "lie.save-released": [["turn.ts", G125, LAUNDER2('item.ending.ch !== "success" && item.op === "save"', REL)]],
  "lie.unknown-plain": [["turn.ts", G125, LAUNDER2('item.ending.ch === "unknown"', "")]],
  "lie.unknown-released": [["turn.ts", G125, LAUNDER2('item.ending.ch === "unknown"', REL)]],
  "lie.second-plain": [["turn.ts", G125, LAUNDER2('item.ending.ch !== "success" && String(item.attempt).endsWith("-2")', "")]],
  "lie.second-released": [["turn.ts", G125, LAUNDER2('item.ending.ch !== "success" && String(item.attempt).endsWith("-2")', REL)]],
  "h1.g125": [["turn.ts", G125, LAUNDER("")]],
  "m3.timer-fence-off": [["step.ts", "if (!t || t.gen !== i.gen) return", "if (!t) return"]],
  "m3.dispose-reads": [["step.ts", 'tx.commands.push({ k: "interrupt", attempt: k, send: r.gen }); note(tx, "Superseded", { op: r.op, attempt: k, send: r.gen });', 'note(tx, "Superseded", { op: r.op, attempt: k, send: r.gen });']],
  // Lying runtimes: the launder of g125, with a sign the ledger reads at the runtime's word.
  "lie.released": [["turn.ts", G125, LAUNDER('note(tx, "Released", { op: item.op, attempt: item.attempt ?? "" });')]],
  "lie.lane-cell": [["turn.ts", G125, LAUNDER('note(tx, "lane", { cell: "lane.release.busy", op: item.op, attempt: item.attempt ?? "" });')]],
  "lie.lane-cell-noatt": [["turn.ts", G125, LAUNDER('note(tx, "lane", { cell: "lane.release.busy", op: item.op });')]],
  // checkMints: a settled head vanishes, said Superseded.
  "lie.settled-superseded": [["lane.ts", "  settleHead(tx, next, final);", '  note(tx, "Superseded", { op: next.op, attempt: next.head?.id }); setLane(tx, next);']],
  "lost.settled": [["lane.ts", "  settleHead(tx, next, final);", "  setLane(tx, next);"]],
  // Fence variants beyond the one the falsifier names.
  "fence.gen-ge": [["step.ts", "if (!t || t.gen !== i.gen) return", "if (!t || t.gen > i.gen) return"]],
  // A dispose that leaves only some reads open: the first.
  "dispose.first-read-kept": [["step.ts", 'tx.commands.push({ k: "interrupt", attempt: k, send: r.gen });', 'if (Object.keys(tx.w.reads).indexOf(k) > 0) tx.commands.push({ k: "interrupt", attempt: k, send: r.gen });']],
  // Release said Superseded and the ending never told.
  "lie.release-silent": [["lane.ts", '  note(tx, "Released", { op: l.op, attempt: h.id }); disarmTimer(tx, `storage/${h.id}`); clearStall(tx, h.id); tellEnded(tx, h.id, "released", h.sentAt);', '  note(tx, "Released", { op: l.op, attempt: h.id }); disarmTimer(tx, `storage/${h.id}`); clearStall(tx, h.id);']],
};
for (const id of process.argv.slice(2)) {
  const dir = join(P, `mut-${id}`);
  rmSync(dir, { recursive: true, force: true });
  cpSync(join(P, "round-10"), dir, { recursive: true });
  let applied = true;
  for (const [f, find, rep] of M[id]!) {
    const s = readFileSync(join(dir, f), "utf8");
    const t = s.replace(flex(find), () => rep);
    if (t === s) applied = false;
    writeFileSync(join(dir, f), t);
  }
  const res: Record<string, unknown> = { id, applied };
  for (const mode of ["named", "all"]) {
    const args = ["bun", "main.ts", "--round", "99", "--no-catalog", ...(mode === "named" ? ["--no-output"] : []), "--runtime", `../mut-${id}/adapter.ts`];
    const p = Bun.spawnSync(args, { cwd: join(P, "conformance"), stdin: "ignore", timeout: 120_000 });
    const out = p.stdout.toString();
    const fails = out.split("\n").filter((l) => l.startsWith("FAIL"));
    res[mode] = { summary: (out.match(/SUMMARY\s+(\S+)/) ?? [])[1] ?? "none", n: fails.length, j: fails.filter((l) => l.includes("(j)")).length, ids: fails.map((l) => l.slice(6).split("\t")[0].trim()).slice(0, 12), first: fails.slice(0, 3).map((l) => l.slice(0, 140)) };
    if (mode === "named" && !out.includes("SUMMARY")) res["err"] = p.stderr.toString().slice(-300);
  }
  console.log(JSON.stringify(res));
  rmSync(dir, { recursive: true, force: true });
}
