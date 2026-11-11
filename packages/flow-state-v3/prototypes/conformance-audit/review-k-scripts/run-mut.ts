// bun run-mut.ts <id> [<id>...] : copy round-10 to a sibling `mut-<id>`, apply edits, run the suite with named oracles only (--no-output).
// Review of oracle (j) at stage K (3d6f2f2d). ONLY= limits to some cases. Prints one JSON line per id.
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const P = "/private/tmp/claude-501/-Users-arpit--claude-spares-spare-cCgI4U/575b2ea3-def0-491f-9ce0-84ae4fd1afbf/scratchpad/review-k/packages/flow-state-v3/prototypes";
const flex = (find: string) => new RegExp(find.trim().split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*"));
type E = ReadonlyArray<readonly [string, string, string]>;
const PROBE = (origin: string) => `issue(tx, { code: "ProbeFired", origin: ${JSON.stringify(origin)}, input: item.op });`;

// The builder's S1' lie, as falsify writes it.
const END = "tx.w = { ...tx.w, nextMint: maxMint + 1 };";
const AT_SEND = `${END} for (const m of [...(tx.w.mail as any)] as any[]) { if (m.k !== "ending" || !m.restored || !m.owner?.node) continue; const r = getActor(tx.w.actors, m.actor); if (!r) continue; let hit = false; const fix = (i: any): any => i.id === m.owner.inc ? (i.leaf !== m.owner.node ? ((hit = true), { ...i, leaf: m.owner.node }) : i) : { ...i, kids: Object.fromEntries(Object.entries(i.kids).map(([k, v]) => [k, fix(v)])) }; const root = fix(r.root); if (hit) { tx.w = { ...tx.w, actors: setActor(tx.w.actors, m.actor, { ...r, root }) }; } }`;
const atSend: E = [["durable.ts", END, AT_SEND]];

// The boot step's evidence held back to the end of the pump: after the restored endings' turns that the same pump runs.
const EV = "guarded(() => cfg.onEvidence(out.evidence));";
const HOLD = `{ const H = ((globalThis as any).__heldEv ??= []); if (i.k === "boot") H.push(...out.evidence); else { const ev = [...H.splice(0), ...out.evidence]; guarded(() => cfg.onEvidence(ev)); } }`;
const FLUSH_AT = "} finally { running = false; } notify();";
const FLUSH = `} finally { running = false; } { const H = (globalThis as any).__heldEv; if (H?.length) { const ev = H.splice(0); guarded(() => cfg.onEvidence(ev)); } } notify();`;
const evLate: E = [["driver.ts", EV, HOLD], ["driver.ts", FLUSH_AT, FLUSH]];

// The runtime's codec says no actor has a live record.
const noLeaves: E = [["adapter.ts", "leaves: (kv, actor) => {", "leaves: (kv, actor) => { if (kv) return undefined;"]];

// The runtime never says `boot`.
const noBootEv: E = [["step.ts", 'note(tx, "boot", {});', ""]];

const G125 = "const a = getActor(tx.w.actors, item.actor); const lane = tx.w.lanes[laneId];";
const BOOTIN = 'realInput({ k: "boot", records: [...records], persistence });';
const ROUTE = "const { start, late } = routeFrom(tx, a, item, inc);";
const MAPPED = "const mapped = mappedFor(m, item);";
const SEND = 'else enqueue(tx, { k: "send", actor: input.actor, event: input.event });';

const M: Record<string, E> = {
  ctrl: [],
  "h.restore-at-send": atSend,
  // mutants-r10.ts's g125.laundered-as-evidence, for mutate-one.
  "g125.laundered": [["turn.ts", "const a = getActor(tx.w.actors, item.actor); const lane = tx.w.lanes[laneId];", 'const a = getActor(tx.w.actors, item.actor); const lane = tx.w.lanes[laneId]; if (item.ending.ch !== "success" && [...tx.w.mail].some((x) => x.actor !== item.actor)) return note(tx, "evidenceOnly", { op: item.op, attempt: item.attempt ?? "" });']],
  // Streams (rules 14, 47, 70): a session's delivery runs in another live actor of the machine that has an incarnation at the same path.
  "probe.stream-other": [["turn.ts", "const ran = attemptTurn(tx, item, item.event.tag, () => runTurn(tx, a, path!, item.event, undefined, false, item), );", `{ const o2 = (tx.w.actors as any).flat().filter(Boolean).flatMap((b: any) => Object.values(b)).find((x: any) => x.machine === a.machine && x.key !== a.key && kidAt(x.root, path!)); if (o2) issue(tx, { code: "ProbeFired", origin: "stream-other", input: item.tag }); } const ran = attemptTurn(tx, item, item.event.tag, () => runTurn(tx, a, path!, item.event, undefined, false, item));`]],
  "k.stream-other": [["turn.ts", "const ran = attemptTurn(tx, item, item.event.tag, () => runTurn(tx, a, path!, item.event, undefined, false, item), );", `const o2 = (tx.w.actors as any).flat().filter(Boolean).flatMap((b: any) => Object.values(b)).find((x: any) => x.machine === a.machine && x.key !== a.key && kidAt(x.root, path!)); const ran = attemptTurn(tx, item, item.event.tag, () => runTurn(tx, o2 ?? a, path!, item.event, undefined, false, item));`]],
  // Reads (rule 52): a lookup's ending whose incarnation ended is delivered to a live copy of its fragment instead of going as evidence.
  "probe.read-orphan": [["turn.ts", "const path = a && pathOfId(a.root, item.inc!);", `const path = a && pathOfId(a.root, item.inc!); if (a && !path) ${PROBE("read-orphan")}`]],
  "k.read-to-new-inc": [["turn.ts", "const path = a && pathOfId(a.root, item.inc!);", `const path = a && (pathOfId(a.root, item.inc!) ?? (() => { const f = tx.machines[a.machine]?.ops[item.op]?.fragment; let s: any; walkIncs(a.root, (i: any, p: any) => { if (s === undefined && f !== undefined && i.frag === f && !i.frozen) s = p; }); return s; })());`]],
  // D9 for a frozen copy (`leaves` skips frozen): restored in the node its parked ending's owner asked from.
  "probe.frozen-at-send": [["durable.ts", "return { ...i, kids, ...(i.frozen ? { frozen: { ...i.frozen, parked: parked! } } : {}) };", `if (i.frozen && (parked ?? []).some((p: any) => p.owner?.node && p.owner.node !== i.leaf)) issue(tx, { code: "ProbeFired", origin: "frozen-at-send", input: i.leaf }); if (i.frozen) issue(tx, { code: "ProbeFired", origin: "frozen-any", input: i.leaf }); return { ...i, kids, ...(i.frozen ? { frozen: { ...i.frozen, parked: parked! } } : {}) };`]],
  "k.frozen-at-send": [["durable.ts", "return { ...i, kids, ...(i.frozen ? { frozen: { ...i.frozen, parked: parked! } } : {}) };", `const at = i.frozen ? ((parked ?? []).find((p: any) => p.owner?.node && p.owner.node !== i.leaf) as any)?.owner?.node : undefined; return { ...i, kids, ...(at ? { leaf: at } : {}), ...(i.frozen ? { frozen: { ...i.frozen, parked: parked! } } : {}) };`]],
  // D5 across boots: a delivered parked ending's lane record is never deleted, so every later boot delivers it again.
  "k.parked-every-boot": [["durable.ts", "if (!l) { put(actor, id, undefined); }", 'if (!l) { if (!/"parked":\\[\\{/.test(saved[id] ?? "")) put(actor, id, undefined); else issue(tx, { code: "ProbeFired", origin: "parked-kept", input: id }); }']],
  "k.parked-every-boot-silent": [["durable.ts", "if (!l) { put(actor, id, undefined); }", 'if (!l) { if (!/"parked":\\[\\{/.test(saved[id] ?? "")) put(actor, id, undefined); }']],
  // D4 at a boot: a held head's unknown { Restored } is neither said nor delivered (the hold stays held, silently).
  "k.held-silent": [
    ["durable.ts", "noteEnding(tx, { op: l.op, attempt: h.id }, ending); const phase: Phase", "if (!h.held) noteEnding(tx, { op: l.op, attempt: h.id }, ending); const phase: Phase"],
    ["durable.ts", "restoredHook(tx, l, h, ending); mail(tx, l, h, ending, true);", "restoredHook(tx, l, h, ending); if (!h.held) mail(tx, l, h, ending, true);"],
  ],
  // D7: the copy a restored ending belongs to is dropped at restore (its membership stays in the host's memory).
  "k.drop-copy": [["durable.ts", END, `${END} for (const m of [...(tx.w.mail as any)] as any[]) { if (m.k !== "ending" || !m.restored || !m.owner?.inc) continue; const r = getActor(tx.w.actors, m.actor); if (!r || r.root.id === m.owner.inc) continue; const cut = (i: any): any => ({ ...i, kids: Object.fromEntries(Object.entries(i.kids).filter(([, v]: any) => v.id !== m.owner.inc).map(([k, v]: any) => [k, cut(v)])) }); tx.w = { ...tx.w, actors: setActor(tx.w.actors, m.actor, { ...r, root: cut(r.root) }) }; }`]],
  // D8: a restored ending routed late from the root, not current from the leaf (rule 14: every Restored is current).
  "k.restored-from-root": [["turn.ts", ROUTE, "const { start, late } = item.restored ? { start: fragOf(machineOf(tx, a), inc).root as string | undefined, late: true } : routeFrom(tx, a, item, inc);"]],
  // D6: under latest, the sent head is said Superseded too (rule 2.7.13: a sent Attempt is never replaceable); its ending still runs.
  "k.supersede-head": [["lane.ts", "if (policy === \"latest\") { for (const x of l.w) supersede(tx, a.op, x);", "if (policy === \"latest\") { if (l.head && l.head.phase.t !== \"settled\") supersede(tx, a.op, l.head); for (const x of l.w) supersede(tx, a.op, x);"]],
  // L3: parked endings restored in reverse saved order.
  "k.parked-reversed": [["durable.ts", "for (const p of l.parked ?? []) {", "for (const p of [...(l.parked ?? [])].reverse()) {"]],
  // A2: an ending said delivered and Unhandled, and run nowhere (the batch's Unhandled pays it).
  "k.claim-unhandled": [["turn.ts", "if (!item.redelivered) countFailure(tx, item);", 'if (!item.redelivered) countFailure(tx, item); if (item.ending.ch === "failure" && item.attempt) return note(tx, "Unhandled", { event: mapped.event });']],
  // Q4 / D9: the anchor is taken when the runtime chooses to say `boot`.
  "k.ev-late": evLate,
  "k.ev-late+at-send": [...evLate, ...atSend],
  // D9: the anchor is opt-in by the runtime's own codec.
  "k.no-leaves+at-send": [...noLeaves, ...atSend],
  // D187 / D11 / D9: `loading` is the absence of the runtime's word.
  "k.no-boot-ev": noBootEv,
  "k.no-boot-ev+at-send": [...noBootEv, ...atSend],
  "k.no-boot-ev+boot-order": [...noBootEv, ["driver.ts", BOOTIN, 'inbox.push({ k: "boot", records: [...records], persistence } as any, ...waitingBoot.splice(0)); pump();']],
  // D4 at a boot: a row with a restored ending is silently not restored. Its endings park; "owner not alive" read from what it publishes.
  "k.drop-row": [
    ["durable.ts", 'import { getActor, setActor, noActors, type Actors } from "./actors.ts";', 'import { getActor, setActor, noActors, deleteActor, type Actors } from "./actors.ts";'],
    ["durable.ts", END, `${END} for (const m of [...(tx.w.mail as any)] as any[]) if (m.k === "ending" && m.restored && getActor(tx.w.actors, m.actor)) tx.w = { ...tx.w, actors: deleteActor(tx.w.actors, m.actor) };`],
  ],
  // D4 live: an actor whose failure ending lands silently vanishes (no dispose), and the ending parks or goes as evidence.
  "k.vanish-live": [
    ["turn.ts", 'import { getActor, setActor, type Actors } from "./actors.ts";', 'import { getActor, setActor, deleteActor, type Actors } from "./actors.ts";'],
    ["turn.ts", G125, `if (item.ending.ch === "failure" && getActor(tx.w.actors, item.actor)) tx.w = { ...tx.w, actors: deleteActor(tx.w.actors, item.actor) }; ${G125}`],
  ],
  // What: the ending's event. A restored unknown taken as success (a realistic bug), and every unknown taken as success.
  "k.restored-as-success": [["turn.ts", MAPPED, "const mapped = item.restored && item.ending.ch === \"unknown\" && m.ops[item.op]?.outcomes.success ? m.ops[item.op]!.outcomes.success : mappedFor(m, item);"]],
  "k.unknown-as-success": [["turn.ts", MAPPED, "const mapped = item.ending.ch === \"unknown\" && m.ops[item.op]?.outcomes.success ? m.ops[item.op]!.outcomes.success : mappedFor(m, item);"]],
  "k.failure-as-success": [["turn.ts", MAPPED, "const mapped = item.ending.ch === \"failure\" && m.ops[item.op]?.outcomes.success ? m.ops[item.op]!.outcomes.success : mappedFor(m, item);"]],
  // Where in the recipient: rule 14's late source dropped, every ending routed as current from the active leaf.
  "probe.late": [["turn.ts", ROUTE, `${ROUTE} if (late) ${PROBE("late")}`]],
  "k.late-as-current": [["turn.ts", ROUTE, "const { start, late } = { start: undefined as string | undefined, late: false };"]],
  // L9 / D11: a send that waited on a slow load steps ahead of the restored endings; a dispose keeps its place.
  "k.send-ahead": [
    ["driver.ts", BOOTIN, 'inbox.push({ k: "boot", records: [...records], persistence } as any, ...waitingBoot.filter((x: any) => x.k === "send")); { const rest = waitingBoot.filter((x: any) => x.k !== "send"); waitingBoot.splice(0, waitingBoot.length, ...rest); } pump();'],
    ["step.ts", SEND, 'else if ((tx.w.mail as any).restored > 0 && [...tx.w.mail].some((x: any) => x.restored && x.actor === input.actor)) tx.w = { ...tx.w, mail: (tx.w.mail as any).constructor.of([{ k: "send", actor: input.actor, event: input.event }, ...tx.w.mail]), rota: [input.actor, ...tx.w.rota.filter((x: string) => x !== input.actor)] }; else enqueue(tx, { k: "send", actor: input.actor, event: input.event });'],
  ],
  // The builder's D11 lie, for reference.
  "h.boot-order": [["driver.ts", BOOTIN, 'inbox.push({ k: "boot", records: [...records], persistence } as any, ...waitingBoot.splice(0)); pump();']],
  // D3: an ending of a disposed actor runs in its retired record (a ghost life), not parked.
  "probe.ghost-life": [["turn.ts", G125, `${G125} if (!a && own(tx.w.retired, item.actor)) ${PROBE("ghost")}`]],
  "k.ghost-life": [["turn.ts", G125, "const a = getActor(tx.w.actors, item.actor) ?? (own(tx.w.retired, item.actor) as any); const lane = tx.w.lanes[laneId];"]],
};
for (const id of process.argv.slice(2).filter((x) => !x.startsWith("--"))) {
  const dir = join(P, `mut-${id}`);
  rmSync(dir, { recursive: true, force: true });
  cpSync(join(P, "round-10"), dir, { recursive: true });
  const unapplied: string[] = [];
  for (const [f, find, rep] of M[id]!) {
    const s = readFileSync(join(dir, f), "utf8");
    const t = s.replace(flex(find), () => rep);
    if (t === s) unapplied.push(`${f}: ${find.slice(0, 40)}`);
    writeFileSync(join(dir, f), t);
  }
  const t0 = Date.now();
  if (process.env.MUTONE) {
    const q = Bun.spawnSync(["bun", "mutate-one.ts", "--runtime", `../mut-${id}/adapter.ts`], { cwd: join(P, "conformance"), stdin: "ignore", timeout: 285_000 });
    console.log(JSON.stringify({ id, unapplied, s: Math.round((Date.now() - t0) / 1000), out: q.stdout.toString().trim().slice(-600), err: q.stderr.toString().slice(-300) }));
    rmSync(dir, { recursive: true, force: true });
    continue;
  }
  const args =["bun", "main.ts", "--round", "99", "--no-catalog", ...(process.env.ONLY ? ["--only", process.env.ONLY] : []), ...(process.env.OUT ? [] : ["--no-output"]), "--runtime", `../mut-${id}/adapter.ts`];
  const p = Bun.spawnSync(args, { cwd: join(P, "conformance"), stdin: "ignore", timeout: 280_000 });
  const out = p.stdout.toString();
  const fails = out.split("\n").filter((l) => l.startsWith("FAIL"));
  const named = fails.filter((l) => !l.split("\t")[1]?.startsWith("output:"));
  const res: Record<string, unknown> = {
    id,
    unapplied,
    s: Math.round((Date.now() - t0) / 1000),
    summary: (out.match(/SUMMARY\s+(\S+)/) ?? [])[1] ?? "none",
    rec: (out.match(/RECIPIENTS[^\n]*/) ?? [])[0],
    named: named.length,
    j: named.filter((l) => l.includes("(j)")).length,
    probe: [...new Set(fails.filter((l) => l.includes("ProbeFired")).map((l) => l.slice(4).split("\t")[0]!.trim()))],
    ids: named.map((l) => l.slice(4).split("\t")[0]!.trim()).slice(0, 40),
    jids: named.filter((l) => l.includes("(j)")).map((l) => l.slice(4).split("\t")[0]!.trim()).slice(0, 40),
    first: named.slice(0, 5).map((l) => l.slice(0, 420)),
  };
  if (!out.includes("SUMMARY")) res["err"] = (p.stderr.toString() + out).slice(-600);
  console.log(JSON.stringify(res));
  rmSync(dir, { recursive: true, force: true });
}
