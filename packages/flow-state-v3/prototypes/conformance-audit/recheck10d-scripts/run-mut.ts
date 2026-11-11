// bun run-mut.ts [--all] <id> [<id>...] : copy round-10 to a sibling `mut-<id>`, apply edits, run the suite named-only (and with output if --all).
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const P = "/private/tmp/claude-501/-Users-arpit--claude-spares-spare-cCgI4U/575b2ea3-def0-491f-9ce0-84ae4fd1afbf/scratchpad/recheck10d/wt/packages/flow-state-v3/prototypes";
const flex = (find: string) => new RegExp(find.trim().split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*"));
const G125 = "const a = getActor(tx.w.actors, item.actor); const lane = tx.w.lanes[laneId];";
const at = (cond: string, body: string) => `${G125} if (a && ${cond}) { ${body} }`;
const EO = 'return note(tx, "evidenceOnly", { op: item.op, attempt: item.attempt ?? "" });';
const REL = 'note(tx, "Released", { op: item.op, attempt: item.attempt ?? "" });';
const LIKE2NC = 'item.ending.ch !== "success" && item.op === "like" && String(item.attempt).endsWith("-2") && (item.ending as any).value?.why !== "Cancelled"';
const SAVE = 'item.ending.ch !== "success" && item.op === "save"';
const FAIL = 'item.ending.ch !== "success"';
const SAMEMAIL = '[...tx.w.mail].some((x: any) => x.actor === item.actor && !(x.k === "ending" && x.attempt === item.attempt))';
const SAMESEND = '[...tx.w.mail].some((x: any) => x.actor === item.actor && x.k === "send")';
const DELIV = 'note(tx, "delivered", { op: item.op, attempt: item.attempt ?? "", event: "x" }); return;';
const UNMAP = 'note(tx, "delivered", { op: item.op, attempt: item.attempt ?? "", event: "x" }); return issue(tx, { code: "UnmappedEnding", origin: `${a.machine} operations.${item.op}`, input: item.ending });';
const PARK = "return parkEnding(tx, item, lane, subject, a.machine);";
const MINT = 'note(tx, "mint", { op: a.op, attempt: attempt.id, mint: attempt.mint });';
const NOTEEND = "export const noteEnding = (tx: Tx, a: { op: string; attempt?: string; send?: string }, e: Ending) =>";
type E = ReadonlyArray<readonly [string, string, string]>;
const M: Record<string, E> = {
  // H1' rerun: an ending dropped as evidence, with a `Released` beside it.
  "h1.like2nc-released": [["turn.ts", G125, at(LIKE2NC, REL + EO)]],
  "h1.like2nc-plain": [["turn.ts", G125, at(LIKE2NC, EO)]],
  "h1.save-released": [["turn.ts", G125, at(SAVE, REL + EO)]],
  "h1.second-released": [["turn.ts", G125, at(`${FAIL} && String(item.attempt).endsWith("-2")`, REL + EO)]],
  "h1.unknown-released": [["turn.ts", G125, at('item.ending.ch === "unknown"', REL + EO)]],
  "h1.lanecell-noatt-like2nc": [["turn.ts", G125, at(LIKE2NC, 'note(tx, "lane", { cell: "lane.release.busy", op: item.op });' + EO)]],
  // D154 limit: the owner's published state moves in the same batch (other mail of the owner), with a Released.
  "d154.moved-fail-released": [["turn.ts", G125, at(`${FAIL} && ${SAMEMAIL}`, REL + EO)]],
  "d154.moved-like-released": [["turn.ts", G125, at(`${FAIL} && item.op === "like" && ${SAMEMAIL}`, REL + EO)]],
  "d154.moved-save-released": [["turn.ts", G125, at(`${SAVE} && ${SAMEMAIL}`, REL + EO)]],
  // D154 limit: a cancel judged by event: the suite drove the owner an event in this do (a send in its mail).
  "d154.event-fail-released": [["turn.ts", G125, at(`${FAIL} && ${SAMESEND}`, REL + EO)]],
  "d154.event-like-released": [["turn.ts", G125, at(`${FAIL} && item.op === "like" && ${SAMESEND}`, REL + EO)]],
  "probe.event-fail": [["turn.ts", G125, at(`${FAIL} && ${SAMESEND}`, `issue(tx, { code: "ProbeFired", origin: "probe", input: item.op });`)]],
  "probe.moved-save": [["turn.ts", G125, at(`${SAVE} && ${SAMEMAIL}`, `issue(tx, { code: "ProbeFired", origin: "probe", input: item.op });`)]],
  "probe.moved-like": [["turn.ts", G125, at(`${FAIL} && item.op === "like" && ${SAMEMAIL}`, `issue(tx, { code: "ProbeFired", origin: "probe", input: item.op });`)]],
  // A1: attribution. A turn of a ghost actor said just before the mint; the ending later goes as evidence (owner "gone").
  "a1.ghost-like2": [
    ["lane.ts", MINT, `if (a.op === "like" && String(attempt.id).endsWith("-2")) note(tx, "turn", { actor: "ghost/none", event: "x", from: "a", to: "a" }); ${MINT}`],
    ["turn.ts", G125, at(LIKE2NC, EO)],
  ],
  "a1.ghost-save": [
    ["lane.ts", MINT, `if (a.op === "save") note(tx, "turn", { actor: "ghost/none", event: "x", from: "a", to: "a" }); ${MINT}`],
    ["turn.ts", G125, at(SAVE, EO)],
  ],
  // A2: `delivered` with no delivery; paid by any turn in the batch.
  "a2.deliv-like2nc": [["turn.ts", G125, at(LIKE2NC, DELIV)]],
  "a2.deliv-save": [["turn.ts", G125, at(SAVE, DELIV)]],
  "a2.deliv-fail-samemail": [["turn.ts", G125, at(`${FAIL} && ${SAMEMAIL}`, DELIV)]],
  // A3: a live, bound actor's ending parked instead of delivered; the wait names it truthfully.
  "a3.park-like2nc": [["turn.ts", G125, at(LIKE2NC, PARK)]],
  "a3.park-save": [["turn.ts", G125, at(SAVE, PARK)]],
  // A4: a refused ending's second try dropped, said `fence` (clears every refusal) or `Denied`.
  "a4.refused-fence": [["turn.ts", "enqueue(tx, { ...rest, redelivered: true });", 'note(tx, "fence", {});']],
  "a4.refused-denied": [["turn.ts", "enqueue(tx, { ...rest, redelivered: true });", 'note(tx, "Denied", { event: tag });']],
  // A5: an ending dropped, said delivered and `UnmappedEnding`.
  "a5.unmapped-like2nc": [["turn.ts", G125, at(LIKE2NC, UNMAP)]],
  "a5.unmapped-save": [["turn.ts", G125, at(SAVE, UNMAP)]],
  // A6: a like's second failing send said AbandonedFiber, its ending never noted nor delivered.
  "a6.abandoned-like2": [
    ["world.ts", NOTEEND, `${NOTEEND} (a.op === "like" && String(a.attempt).endsWith("-2") && e.ch !== "success") ? note(tx, "AbandonedFiber", { op: a.op, attempt: a.attempt, send: a.send }) :`],
    ["turn.ts", G125, at('item.ending.ch !== "success" && item.op === "like" && String(item.attempt).endsWith("-2")', "return;")],
  ],
  "a6.abandoned-save": [
    ["world.ts", NOTEEND, `${NOTEEND} (a.op === "save" && e.ch !== "success") ? note(tx, "AbandonedFiber", { op: a.op, attempt: a.attempt, send: a.send }) :`],
    ["turn.ts", G125, at(SAVE, "return;")],
  ],
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
    const args = ["bun", "main.ts", "--round", "99", "--no-catalog", ...(mode === "named" ? ["--no-output"] : []), "--runtime", `../mut-${id}/adapter.ts`];
    const p = Bun.spawnSync(args, { cwd: join(P, "conformance"), stdin: "ignore", timeout: 200_000 });
    const out = p.stdout.toString();
    const fails = out.split("\n").filter((l) => l.startsWith("FAIL"));
    const named = fails.filter((l) => !l.split("\t")[1]?.startsWith("output:"));
    res[mode] = { summary: (out.match(/SUMMARY\s+(\S+)/) ?? [])[1] ?? "none", n: fails.length, named: named.length, j: fails.filter((l) => l.includes("(j)")).length, ids: named.map((l) => l.slice(4).split("\t")[0]!.trim()).slice(0, 8), first: named.slice(0, 2).map((l) => l.slice(0, 200)) };
    if (!out.includes("SUMMARY")) res["err"] = p.stderr.toString().slice(-400);
  }
  console.log(JSON.stringify(res));
  rmSync(dir, { recursive: true, force: true });
}
