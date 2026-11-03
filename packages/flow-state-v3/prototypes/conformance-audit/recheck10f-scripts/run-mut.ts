// bun run-mut.ts [--all] <id> [<id>...] : copy round-10 to a sibling `mut-<id>`, apply edits, run the suite named-only (and with output if --all).
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const P = "/private/tmp/claude-501/-Users-arpit--claude-spares-spare-cCgI4U/575b2ea3-def0-491f-9ce0-84ae4fd1afbf/scratchpad/recheck10f/wt/packages/flow-state-v3/prototypes";
const flex = (find: string) => new RegExp(find.trim().split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*"));
const G125 = "const a = getActor(tx.w.actors, item.actor); const lane = tx.w.lanes[laneId];";
const at = (cond: string, body: string) => `${G125} if (a && ${cond}) { ${body} }`;
const EO = 'return note(tx, "evidenceOnly", { op: item.op, attempt: item.attempt ?? "" });';
const REL = 'note(tx, "Released", { op: item.op, attempt: item.attempt ?? "" });';
const FAIL = 'item.ending.ch !== "success"';
const PARK = "return parkEnding(tx, item, lane, subject, a.machine);";
const PROBE = (n: string) => `issue(tx, { code: "ProbeFired", origin: "${n}", input: item.op });`;
const FRAG = "tx.machines[a.machine]?.ops[item.op]?.fragment !== undefined";
const KEYED = `Object.values(tx.machines[a.machine]!.nodes).some((n: any) => [...(n.placements ?? []), ...(n.subroutine ? [n.subroutine] : [])].some((p: any) => p.fragment === tx.machines[a.machine]!.ops[item.op]?.fragment && (p.each || p.resetOn)))`;
const FAN = `(() => { let n = 0; walkIncs(a.root, (i: any) => { if (i.frag === tx.machines[a.machine]!.ops[item.op]?.fragment && !i.frozen) n++; }); return n >= 2; })()`;
const firstSub = () => `(() => { let s: any; walkIncs(a.root, (i: any) => { if (i.frag === tx.machines[a.machine]!.ops[item.op]?.fragment && !i.frozen) s ??= i.subject; }); return s ?? subject; })()`;
const FIRSTPATH = `(() => { let s: any; walkIncs(a.root, (i: any, p: any) => { if (i.frag === tx.machines[a.machine]!.ops[item.op]?.fragment && !i.frozen) s ??= p; }); return s ?? path; })()`;
const LASTPATH = `(() => { let s: any; walkIncs(a.root, (i: any, p: any) => { if (i.frag === tx.machines[a.machine]!.ops[item.op]?.fragment && !i.frozen) s = p; }); return s ?? path; })()`;
const lastSub = () => `(() => { let s: any; walkIncs(a.root, (i: any) => { if (i.frag === tx.machines[a.machine]!.ops[item.op]?.fragment && !i.frozen) s = i.subject; }); return s ?? subject; })()`;
const WA = (cond: string, pick: string) => `const a0 = getActor(tx.w.actors, item.actor); const other = a0 && item.attempt && ${cond} ? (tx.w.actors as any).flat().filter(Boolean).flatMap((b: any) => Object.values(b)).${pick}((x: any) => x.machine === a0.machine && x.key !== a0.key) : undefined; const a = other ?? a0; const lane = tx.w.lanes[laneId];`;
const FAN3 = `(() => { let n = 0; walkIncs(a.root, (i: any) => { if (i.frag === tx.machines[a.machine]!.ops[item.op]?.fragment && !i.frozen) n++; }); return n >= 3; })()`;
// another turn of the same owner already ran in this step (a copy's own move or memory change in the batch)
const OTHERTURN = `tx.evidence.some((x: any) => x.kind === "turn" && x.actor === item.actor)`;
const REDO = "enqueue(tx, { ...rest, redelivered: true });";
const BIND = "const path = bindingOf(tx, a, item.op, subject);";
const RUNT = "runTurn(tx, a, path, ev, start, late, item);";
const SUBJ1 = "if (i.frag === frag && !i.frozen && sameSubject(i.subject, subject)) found ??= p;";
type E = ReadonlyArray<readonly [string, string, string]>;
const M: Record<string, E> = {
  ctrl: [],
  // H1''' and its family
  "e2.subject-fan-fail-att": [["turn.ts", BIND, `const path = item.attempt && ${FAIL} && ${FAN} ? bindingOf(tx, a, item.op, ${firstSub()}) : bindingOf(tx, a, item.op, subject);`]],
  "e2.subject-fan-att": [["turn.ts", BIND, `const path = item.attempt && ${FAN} ? bindingOf(tx, a, item.op, ${firstSub()}) : bindingOf(tx, a, item.op, subject);`]],
  "e2.subject-fan-fail": [["turn.ts", BIND, `const path = ${FAIL} && ${FAN} ? bindingOf(tx, a, item.op, ${firstSub()}) : bindingOf(tx, a, item.op, subject);`]],
  "e2.subject-first": [["turn.ts", SUBJ1, "if (i.frag === frag && !i.frozen) found ??= p;"]],
  "e2.subject-last": [["turn.ts", SUBJ1, "if (i.frag === frag && !i.frozen) found = p;"]],
  // M1'''
  "e1.park-keyed": [["turn.ts", G125, at(`${FRAG} && ${KEYED}`, PARK)]],
  "e1.park-keyed-fail": [["turn.ts", G125, at(`${FAIL} && ${FRAG} && ${KEYED}`, PARK)]],
  "e1.park-keyed-fan": [["turn.ts", G125, at(`${FRAG} && ${KEYED} && ${FAN}`, PARK)]],
  "e1.park-keyed-fan-att": [["turn.ts", G125, at(`item.attempt && ${FRAG} && ${KEYED} && ${FAN}`, PARK)]],
  "a3p.park-decline": [["turn.ts", G125, at("!item.attempt", PARK)]],
  "a4p.refused-turn": [["turn.ts", REDO, 'note(tx, "turn", { actor: item.actor, event: tag, from: "a", to: "a" });']],
  // 3. moveLetsGo / cancelsOn whole-actor: another copy's turn in the batch excuses a keyed copy's let-go
  "e4.moved-other-released": [["turn.ts", G125, at(`item.attempt && ${FAIL} && ${FRAG} && ${KEYED} && ${OTHERTURN}`, REL + EO)]],
  "e4.moved-other-plain": [["turn.ts", G125, at(`item.attempt && ${FAIL} && ${FRAG} && ${KEYED} && ${OTHERTURN}`, EO)]],
  "e4.moved-other-any": [["turn.ts", G125, at(`item.attempt && ${FRAG} && ${KEYED} && ${OTHERTURN}`, REL + EO)]],
  "probe.moved-other": [["turn.ts", G125, at(`item.attempt && ${FRAG} && ${KEYED} && ${OTHERTURN}`, PROBE("moved-other"))]],
  "probe.moved-other-fail": [["turn.ts", G125, at(`item.attempt && ${FAIL} && ${FRAG} && ${KEYED} && ${OTHERTURN}`, PROBE("moved-other-fail"))]],
  // 4. new: the turn runs in the first copy, the evidence names the right one (`at` is the intent, not the effect)
  "e5.at-intent-fail": [["turn.ts", RUNT, `runTurn(tx, a, item.attempt && ${FAIL} && ${FAN} ? ${FIRSTPATH} : path, ev, start, late, item);`]],
  "e5.at-intent-any": [["turn.ts", RUNT, `runTurn(tx, a, item.attempt && ${FAN} ? ${FIRSTPATH} : path, ev, start, late, item);`]],
  // 4. new: a restored ending (after reload) to the first of 2+ copies
  "e7.restored-first": [["turn.ts", BIND, `const path = item.restored && ${FAN} ? bindingOf(tx, a, item.op, ${firstSub()}) : bindingOf(tx, a, item.op, subject);`]],
  "probe.restored-fan": [["turn.ts", G125, at(`item.restored && ${FRAG} && ${FAN}`, PROBE("restored-fan"))]],
  // the turn runs in the LAST live copy, the evidence names the right one; and the honest-`at` twin
  "e5.at-intent-fail-last": [["turn.ts", RUNT, `runTurn(tx, a, item.attempt && ${FAIL} && ${FAN} ? ${LASTPATH} : path, ev, start, late, item);`]],
  "e5.at-intent-any-last": [["turn.ts", RUNT, `runTurn(tx, a, item.attempt && ${FAN} ? ${LASTPATH} : path, ev, start, late, item);`]],
  "e2.subject-fan-fail-att-last": [["turn.ts", BIND, `const path = item.attempt && ${FAIL} && ${FAN} ? bindingOf(tx, a, item.op, ${lastSub()}) : bindingOf(tx, a, item.op, subject);`]],
  "e3.keyed-released": [["turn.ts", G125, at(`${FAIL} && ${FRAG} && ${KEYED}`, REL + EO)]],
  "probe.keyed-fail": [["turn.ts", G125, at(`${FAIL} && ${FRAG} && ${KEYED}`, PROBE("keyed-fail"))]],
  "e8.wa-failure": [["turn.ts", G125, WA(`item.ending.ch === "failure"`, "find")]],
  "e8.wa-unknown": [["turn.ts", G125, WA(`item.ending.ch === "unknown"`, "find")]],
  "e8.wa-fail-last": [["turn.ts", G125, WA(FAIL, "findLast")]],
  "e8.wa-fail-frag": [["turn.ts", G125, WA(`${FAIL} && tx.machines[a0.machine]?.ops[item.op]?.fragment !== undefined`, "find")]],
  "probe.fan3-fail-att": [["turn.ts", G125, at(`item.attempt && ${FAIL} && ${FRAG} && ${FAN3}`, PROBE("fan3"))]],
  "e5.at-intent-fail-3": [["turn.ts", RUNT, `runTurn(tx, a, item.attempt && ${FAIL} && ${FAN3} ? ${FIRSTPATH} : path, ev, start, late, item);`]],
  "probe.wa-fail-frag": [["turn.ts", G125, `${G125} if (a && item.attempt && ${FAIL} && ${FRAG} && (tx.w.actors as any).flat().filter(Boolean).flatMap((b: any) => Object.values(b)).some((x: any) => x.machine === a.machine && x.key !== a.key)) { ${PROBE("wa-fail-frag")} }`]],
  "probe.wa-frag": [["turn.ts", G125, `${G125} if (a && item.attempt && ${FRAG} && (tx.w.actors as any).flat().filter(Boolean).flatMap((b: any) => Object.values(b)).some((x: any) => x.machine === a.machine && x.key !== a.key)) { ${PROBE("wa-frag")} }`]],
  "e8.wa-any-frag": [["turn.ts", G125, WA(`tx.machines[a0.machine]?.ops[item.op]?.fragment !== undefined`, "find")]],
  "probe.wa-unknown": [["turn.ts", G125, `${G125} if (a && item.attempt && item.ending.ch === "unknown" && (tx.w.actors as any).flat().filter(Boolean).flatMap((b: any) => Object.values(b)).some((x: any) => x.machine === a.machine && x.key !== a.key)) { ${PROBE("wa-unknown")} }`]],
  // 4. new: cross-actor. An attempt's ending runs in ANOTHER live actor of the same machine (entities fan out across actors)
  "e8.wrong-actor-fail": [["turn.ts", G125, `const a0 = getActor(tx.w.actors, item.actor); const other = a0 && item.attempt && ${FAIL} ? (tx.w.actors as any).flat().filter(Boolean).flatMap((b: any) => Object.values(b)).find((x: any) => x.machine === a0.machine && x.key !== a0.key) : undefined; const a = other ?? a0; const lane = tx.w.lanes[laneId];`]],
  "e8.wrong-actor-any": [["turn.ts", G125, `const a0 = getActor(tx.w.actors, item.actor); const other = a0 && item.attempt ? (tx.w.actors as any).flat().filter(Boolean).flatMap((b: any) => Object.values(b)).find((x: any) => x.machine === a0.machine && x.key !== a0.key) : undefined; const a = other ?? a0; const lane = tx.w.lanes[laneId];`]],
  "probe.other-actor-fail": [["turn.ts", G125, `${G125} if (a && item.attempt && ${FAIL} && (tx.w.actors as any).flat().filter(Boolean).flatMap((b: any) => Object.values(b)).some((x: any) => x.machine === a.machine && x.key !== a.key)) { ${PROBE("other-actor-fail")} }`]],
  "probe.restored-frag":[["turn.ts", G125, at(`item.restored && ${FRAG}`, PROBE("restored-frag"))]],
};
const all = process.argv.includes("--all");
for (const id of process.argv.slice(2).filter((x) => !x.startsWith("--"))) {
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
  for (const mode of all ? ["named", "all"] : ["named"]) {
    const t0 = Date.now();
    const args = ["bun", "main.ts", "--round", "99", "--no-catalog", ...(mode === "named" ? ["--no-output"] : []), "--runtime", `../mut-${id}/adapter.ts`];
    const p = Bun.spawnSync(args, { cwd: join(P, "conformance"), stdin: "ignore", timeout: 240_000 });
    const out = p.stdout.toString();
    const fails = out.split("\n").filter((l) => l.startsWith("FAIL"));
    const named = fails.filter((l) => !l.split("\t")[1]?.startsWith("output:"));
    res[mode] = { s: Math.round((Date.now() - t0) / 1000), summary: (out.match(/SUMMARY\s+(\S+)/) ?? [])[1] ?? "none", n: fails.length, named: named.length, j: fails.filter((l) => l.includes("(j)")).length, ref: fails.filter((l) => l.includes("(ref)")).length, probe: fails.filter((l) => l.includes("ProbeFired")).length, ids: named.map((l) => l.slice(4).split("\t")[0]!.trim()).slice(0, process.argv.includes("--ids") ? 999 : 10), first: named.slice(0, 3).map((l) => l.slice(0, 240)) };
    if (!out.includes("SUMMARY")) res["err"] = (p.stderr.toString() + out).slice(-500);
  }
  console.log(JSON.stringify(res));
  if (!process.argv.includes("--keep")) rmSync(dir, { recursive: true, force: true });
}
