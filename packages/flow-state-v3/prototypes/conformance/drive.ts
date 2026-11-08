// Turns a runtime's `Port` into a Harness. Settling, faults, plans and the fake live here, so a rewrite replaces only the
// port. Faults reach a runtime through what production has: compiled data (Slots), a Host, and its own input port.
import { Context } from "effect";
import type { Fixture as Fixture_ } from "./harness.ts";
import type { Compiled } from "./fixtures/compiled.ts";
import { FakeWorld, NoHeldRequest } from "./fake-world.ts";
import { canonText } from "./output.ts";
import { legacySlots } from "./legacy.ts";
import { machineOfKey, Reference } from "./reference/model.ts";
import { appendFileSync } from "node:fs";
import { WORK_PER_CALL } from "./limits.ts";

const WORK_PEAK = process.env["FLOW_WORK_PEAK"];
const workPeak = { max: 0 };
if (WORK_PEAK) process.on("exit", () => appendFileSync(WORK_PEAK, `${workPeak.max} ${process.argv.slice(2).join(" ")}\n`));
import { inPlaceGuard, type FaultState, type Harness, type Instance, type Port, type Step } from "./harness.ts";

// Stage G: how each delivery's recipient was settled, over the whole run (printed by `main.ts`). `unobserved` is allowance A2's remainder.
// Stage H: `ambiguous` (a view with no suite identity, or one no incarnation publishes) must be 0; `bySend` are runs paid by the suite's own sends.
// Stage I: `shared` counts serials found in two places (red). Stage K (`conformance-audit/ending-check-design.md`): a boot has no rule
// and no count of its own; `anchored` counts the restored incarnations whose first published state was checked against their record.
// Stage L (`ending-check-design.md`, revision): `started` counts observed deliveries whose start node (rule 14) was checked; `streams`
// stream deliveries placed in an incarnation that opened their session. The line is under the lock (`expected-recipients.txt`).
export const recipients = { observed: 0, ambiguous: 0, unobserved: 0, unplaceable: 0, noCopy: 0, anchored: 0, bySend: 0, leftover: 0, shared: 0, started: 0, streams: 0 };
// Stage H: the suite's identity of an incarnation. Minted once per memory the compiled data makes; never in any published text.
const WHO = Symbol("flow-suite incarnation");
let serials = 0;
const tag = (m: any) => (m !== null && typeof m === "object" && !Array.isArray(m) && Object.getPrototypeOf(m) === Object.prototype ? { ...m, [WHO]: ++serials } : m);
// Stage J (re-check 10i, D177 retired): a memory with no `memory.restore` comes back from the runtime's own decode of its record, by the
// runtime's own branch (`durable.ts`: `dec ? dec.run(i.memory) : i.memory`). The suite adds no Slot there and instruments no platform
// global. The record's text is decoded by the Host the suite gives the runtime (`Host.decode`, the store's codec): every plain object of an
// actor record (by the runtime's own `disk.kind`) gets a serial there, in place, before the runtime holds it. A keyed or nested copy's
// memory is an object in that record, so it has its own; a spread of it (`viewOf`) keeps the symbol key. A runtime that decodes by another
// means mints nothing, and its views are `ambiguous`: red, loudly.
const mintIn = (v: any, depth = 0): void => {
  if (v === null || typeof v !== "object" || depth > 64) return;
  if (Array.isArray(v)) {
    for (const x of v) mintIn(x, depth + 1);
    return;
  }
  if (Object.getPrototypeOf(v) !== Object.prototype || Object.isFrozen(v)) return;
  if (v[WHO] === undefined) v[WHO] = ++serials;
  for (const k of Object.keys(v)) mintIn(v[k], depth + 1);
};
export const rowKey =(op: string, key: unknown) => `${op}|${JSON.stringify(key)}`;
// D137: the id is escaped, so `M` + `x/y` and `M/x` + `y` are two actors. The last `/` always ends the machine.
// `|` too: a lane's id starts with its actor's key and a `|`, so an id holding one would name another actor's lane.
const actorKey = (a: { actor: string; id: string }) => `${a.actor}/${a.id.replaceAll("%", "%25").replaceAll("/", "%2F").replaceAll("|", "%7C")}`;

// A long run of steps, or a long log's replay, makes garbage faster than JavaScriptCore collects it (R10-RUNTIME peaked at 1.4 GB with 25 MB
// live after). A look every 64 steps, tasks or replayed steps: a full collection each time the process has grown by 100 MB since the last
// (the resident size is read in under a microsecond; the heap's size costs 0.3 ms at this scale). Nothing in the suite or a runtime is weak (no WeakRef, no FinalizationRegistry), so
// when a collection runs decides nothing.
let ticks = 0;
let grownFrom = 0;
const collectSometimes = () => {
  if (++ticks % 64 !== 0) return;
  const rss = process.memoryUsage.rss();
  if (rss < grownFrom + 1e8) return;
  grownFrom = rss;
  Bun.gc(true);
};
if (process.env["FLOW_NO_FREEZE"] === "1") console.error("FLOW_NO_FREEZE=1: no published or logged world is guarded against a write in place; for measurement only, never a verdict");
const COPIES_CHECK = process.env["FLOW_COPIES_CHECK"] === "1";
const copiesChecked = { hits: 0, differ: 0 };
if (COPIES_CHECK) process.on("exit", () => console.error(`COPIES-CHECK hits ${copiesChecked.hits}, differ ${copiesChecked.differ}`));
export const makeHarness = (port: Port) => (): Harness => {
  let fake: FakeWorld;
  let compiled: Compiled[] = [];
  // Round 12 (D215, review M5): a release that changes data (a key's fields), not only a closure, is compiled again at the boot after it. Only after a
  // `release`, so no other case's boot changes.
  let compileAll: () => Compiled[] = () => compiled;
  let services: Context.Context<never> | undefined; // D211
  let bounds = {};
  let inst: Instance;
  const instances: Instance[] = [];
  const evidence: Array<Record<string, any>> = [];
  const issues: Array<{ code: string; origin?: string; input?: unknown }> = [];
  const faults: FaultState = {
    moduleThrows: new Map(),
    moduleThrowsAfter: new Map(),
    coreThrows: 0,
  };
  const throwIn = new Map<string, number>();
  const startThrows = new Set<string>();
  const armed: Array<{ segment: number; at: number; arm: () => void }> = [];
  const listeners: Array<() => void> = [];
  let dup: string | undefined;
  let plan: { at: number; inject: Step } | undefined;
  let yieldPlan: Step | readonly Step[] | undefined;
  const injections = { planned: 0, done: 0, withLive: 0, withChoice: 0 };

  // Compiled data is plain data: wrapping its Slots is what a test build would do, and the core cannot tell.
  // D117, D125, oracle (j): no ending goes missing. Its first half, what a turn asked for: by operation, per step, a committed turn's asks must each become something.
  let asking: string[] = [];
  let askKeys: Array<{ op: string; key: string | undefined }> = []; // stage F: each ask's copy key, in order
  let askedNow: string[] = []; // this batch's asks, seen by the wrapped input Slots
  let replaying = false;
  const missing: string[] = [];
  // Its second half, a ledger of every ending, from the evidence the runtime gives and the disk the suite owns. An ending said is owed until it is heard (`delivered`), goes as evidence, is parked, or is let go. What is parked is owed until it is unparked, and a wait must name it, op and Attempt. A refusal is owed its second try, and a second refusal is owed a keep. What is on disk at a kill is owed at the boot.
  const told = new Map<string, number>();
  const parkedOwed = new Map<string, number>();
  const bootOwed = new Map<string, number>();
  const keptOwed = new Map<string, number>(); // stage L: endings kept on their lane, until let go
  const tryAgain = new Map<string, number>();
  const refusedAt = new Map<string, number>(); // event -> how many Slot runs the suite had seen when it was refused
  const slotRuns: string[] = []; // every wrapped Slot's path, in the order the suite saw it run (not in replay)
  let slotTape: { slots: string[]; threw: boolean } | undefined;
  let keptNow: Array<{ op: string; attempt: string }> = [];
  let keptNames: Array<{ op: string; attempt: string }> = [];
  let ledgerOff = false; // a disposed runtime, or a disk edited or wiped by the case
  let runtimeDisposed = false; // the suite's own: it drove a `disposeRuntime` step
  const bump = (m: Map<string, number>, k: string, by = 1) => {
    const n = (m.get(k) ?? 0) + by;
    if (n > 0) m.set(k, n);
    else m.delete(k);
  };
  const ledgerKey = (e: Record<string, any>) => `${e["op"]} ${e["attempt"] ?? ""}`;
  // A step's deliveries no turn took. A step's issues come after its evidence: an `UnmappedEnding` or an `InvalidTurn` of that step says what became of them, and pays them.
  let unpaid: string[] = [];
  const payByIssue = (code: string) => {
    if (code !== "UnmappedEnding" && code !== "InvalidTurn") return;
    for (const k of unpaid) bump(told, k, -1);
    unpaid = [];
  };
  // Re-audit H1: `evidenceOnly` is the runtime's word too. The suite decides when an ending may go as evidence, from what it can see itself:
  // the actor that asked for the attempt is not alive, or the attempt's lane is being let go (a release or a cancel of it, this step or one
  // still open). The actor is the suite's own attribution: the turn whose step minted or invoked the attempt. Otherwise the debt stays for (j).
  const attemptActor = new Map<string, string>(); // attempt -> actor key, by the turn that made it; attempts outlive a boot
  const attemptLife = new Map<string, number>(); // attempt -> the life of its actor it was made in
  const lifeOf = new Map<string, number>(); // actor key -> lives ended by a `dispose` step
  const lettingGo = new Set<string>(); // attempts whose lane the suite has seen being let go
  const releasedBySelf = new Set<string>(); // let go only by their own restored ending after a driven reload: a release, not an excuse for (j)
  const made = new Map<string, number>(); // attempt -> order of its first mint or invoke
  const madeOp = new Map<string, string>();
  const sends = new Map<string, string[]>(); // attempt -> the send gens the suite saw invoked, in order
  const attribute = (a: string, actor: string) => {
    attemptActor.set(a, actor);
    attemptLife.set(a, lifeOf.get(actor) ?? 0);
  };
  // D154: an oracle excuses a missing obligation only for a cause the suite observed itself. A `Released` or a `lane.release.*` cell says WHICH
  // attempt is let go (a self-report, checked); WHY must be seen: the owner's life over (a `dispose` the suite drove), the owner gone from what
  // it publishes, or the owner's published state or memory moving in this batch while the compiled machine has a way to let the op go
  // (a `cancel` member of it, or a fragment's `whenAbandoned.release` naming it). The suite holds the compiled data, so that half is its own too.
  const published = new Map<string, string>(); // actor -> what it published at the end of the last batch
  let moved = new Set<string>(); // actors whose published state or memory changed in this batch
  const publishedNow = (actor: string) => {
    try {
      const s = inst.state(actor);
      return s === undefined ? undefined : JSON.stringify([s, canonText(inst.memory(actor))]);
    } catch {
      return undefined;
    }
  };
  // Stage E: the suite's own reference (`reference/model.ts`, from machine-design.md, nothing from a runtime) answers which actor binds an op,
  // whether the owner's own machine can cancel it on an event or by a move, and which timers a machine has.
  let reference: Reference | undefined;
  const refm = () => (reference ??= new Reference(compiled));
  const machineOfActor = new Map<string, string>(); // the machine the suite ensured an actor as; else its key's
  const machineOf = (actor: string) => machineOfActor.get(actor) ?? machineOfKey(actor);
  const leafOf = (actor: string) => {
    try {
      return inst.state(actor);
    } catch {
      return undefined;
    }
  };
  let leafPrev = new Map<string, string | undefined>(); // actor -> its leaf before this batch, by the suite's reading
  // D154 per owner (re-check M1''): the owner's own machine, between its published leaf before and after the batch, took an alternative that
  // cancels the op, left every state that binds it, or left a fragment that releases it. `unknown` is where the reference cannot see: it pays
  // only a let-go of a fragment's own op, never a root op's ending.
  // Stage G (re-check item 3): per copy. An attempt the suite placed in a copy is let go by a move only if THAT copy left, or its own
  // `resetOn` value changed (rule 51), by `Reference.copies`; another copy's move, or the actor's memory moving, is no cause for it.
  const moveLetsGo = (actor: string, op: string, att?: string) => {
    if (!moved.has(actor)) return false;
    const a = refm().moveLetsGo(machineOf(actor), op, leafPrev.get(actor), leafOf(actor));
    if (a === "yes") return true;
    const copy = att === undefined ? undefined : attemptCopy.get(att);
    if (copy && copy.path.length > 0) return bindsCopy(actor, op, copy) === "no";
    return a === "unknown" && refm().machine(machineOf(actor))?.ops[op]?.fragment !== undefined;
  };
  // D154: the other seen cause, a cancel that changes nothing published. The suite drove an event to THIS owner in this `do`: a send, a timer
  // of its own machine on `advance`, the restored ending of its own attempt after a reload the suite drove, or the answer of ANOTHER op of its
  // own attempt. And the owner's own machine has an alternative on that event with a `cancel` of the op (re-check inventory 3: per actor).
  const drivenTo = new Map<string, Map<string, Set<string>>>(); // actor -> event -> what drove it ("" for a send, an op for its answer)
  const known = new Set<string>(); // every actor the suite addressed: their published state is read after each batch
  const drivenPath = new Map<string, Map<string, Set<string>>>(); // actor -> event -> the copy paths it was sent to ("" for the root)
  // Stage H, conservation: what the suite itself sent, by recipient. Each send pays at most one handler run of its event in that recipient
  // (a refused turn's retry, one more); a timer pays any number (an `advance` may fire it often). Kept across `do`s, cleared at a kill.
  let credits: Array<{ actor: string; ev: string; path: readonly string[] | null; n: number }> = [];
  const credit = (actor: string, ev: string, path: readonly string[] | null, n = 1) => {
    const c = credits.find((x) => x.actor === actor && x.ev === ev && (x.path === null ? path === null : path !== null && samePath(x.path, path)));
    if (c) c.n += n;
    else credits.push({ actor, ev, path, n });
  };
  const drive = (actor: string, ev: string, from = "", to?: readonly string[]) => {
    if (from === "") credit(actor, ev, to ?? []);
    if (from === "timer") credit(actor, ev, null, Infinity);
    known.add(actor);
    const m = drivenTo.get(actor) ?? drivenTo.set(actor, new Map()).get(actor)!;
    (m.get(ev) ?? m.set(ev, new Set()).get(ev)!).add(from);
    const p = drivenPath.get(actor) ?? drivenPath.set(actor, new Map()).get(actor)!;
    (p.get(ev) ?? p.set(ev, new Set()).get(ev)!).add(to && to.length > 0 ? JSON.stringify(to) : "");
  };
  // `advance`: each known actor's own machine's timers, to that actor (not every schedule of every machine to every actor).
  const driveTimers = () => {
    for (const a of known) for (const ev of refm().scheduleEvents(machineOf(a))) drive(a, ev, "timer");
  };
  // Stage F (re-check H1'''): each attempt's copy, from what the suite drove. A `send` with `to` names the copy its turn runs in; a delivered
  // ending's turn runs in that attempt's copy; a definition's op is the actor's root (`[]`). A fragment op's copy is the one live copy of its
  // fragment (by `reference.copies`: published leaf, `.each` membership, each copy's published state) on that path; none or two is undecided.
  const attemptCopy = new Map<string, { path: string[]; resets: string[] } | null>();
  const declineCopy = new Map<string, { actor: string; copy: { path: string[]; resets: string[] } | null }>(); // op -> its latest decline's
  const declineOwners = new Map<string, Set<string>>(); // op -> the actors whose declines of it the suite saw parked
  let stepTo: { actor: string; event: string; to: readonly string[] } | undefined; // the send this step drove
  let unplaced = 0; // deliveries of attempts whose copy the suite could not decide: reported, never an excuse
  const memoryOf = (actor: string) => {
    try {
      return inst.memory(actor);
    } catch {
      return undefined;
    }
  };
  type Copy = { path: string[]; resets: string[] };
  type Copies = { list: Copy[]; byPath: Map<string, Copy>; slots: string[]; threw: boolean };
  let copiesMemo: { inst: Instance; ref: Reference; world: unknown; at: Map<string, Copies> } | undefined;
  const versions = inPlaceGuard(false);
  let copiesChecking = false;
  const copiesFresh = (actor: string, machine: string, f: string): Copies => {
    const tape = { slots: [] as string[], threw: false };
    const was = slotTape;
    slotTape = tape;
    let list: Copy[];
    try {
      list = refm().copies(machine, f, leafOf(actor), memoryOf(actor), (p) => {
        try {
          return inst.inner(actor, p);
        } catch {
          return undefined;
        }
      });
    } finally {
      slotTape = was;
    }
    const byPath = new Map<string, Copy>();
    for (const c of list) {
      const k = JSON.stringify(c.path);
      if (!byPath.has(k)) byPath.set(k, c);
    }
    return { list, byPath, slots: tape.slots, threw: tape.threw };
  };
  const copiesEntry = (actor: string, op: string): Copies | undefined => {
    const m = refm().machine(machineOf(actor));
    const f = m?.ops[op]?.fragment;
    if (!m || f === undefined) return undefined;
    const world = inst.version?.();
    if (world === undefined) return copiesFresh(actor, m.id, f);
    versions.guard(world);
    if (copiesMemo?.inst !== inst || copiesMemo.ref !== refm() || copiesMemo.world !== world) copiesMemo = { inst, ref: refm(), world, at: new Map() };
    const key = `${actor}\u0000${m.id}\u0000${f}`;
    const hit = copiesMemo.at.get(key);
    if (hit && !hit.slots.some((p) => throwIn.get(p))) {
      if (COPIES_CHECK) {
        copiesChecking = true;
        let again: Copies;
        try {
          again = copiesFresh(actor, m.id, f);
        } finally {
          copiesChecking = false;
        }
        copiesChecked.hits++;
        if (again.threw || JSON.stringify([again.list, again.slots]) !== JSON.stringify([hit.list, hit.slots])) {
          copiesChecked.differ++;
          throw new Error("copies memo differs from a fresh run");
        }
      }
      if (!replaying) slotRuns.push(...hit.slots);
      return hit;
    }
    const got = copiesFresh(actor, m.id, f);
    if (got.threw) copiesMemo.at.delete(key);
    else copiesMemo.at.set(key, got);
    return got;
  };
  const copiesOf = (actor: string, op: string): Copy[] => copiesEntry(actor, op)?.list ?? [];
  const samePath = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  const prefix = (a: readonly string[], b: readonly string[]) => a.length <= b.length && a.every((x, i) => x === b[i]);
  const keyOf = new Map<string, string | undefined>(); // attempt -> the `.each` key its asking copy's view showed (the suite's wrap)
  const placeFor = (actor: string, op: string, cause: readonly string[] | null, key?: string) => {
    const m = refm().machine(machineOf(actor));
    if (!m?.ops[op]) return null;
    if (m.ops[op]!.fragment === undefined) return { path: [], resets: [] };
    const cs = copiesOf(actor, op);
    let pick = cause === null ? cs : cs.filter((c) => prefix(c.path, cause) || prefix(cause, c.path));
    if (pick.length > 1 && key !== undefined) pick = pick.filter((c) => c.path.at(-1)!.endsWith(`:${key}`) && c.path.at(-1)!.indexOf(":") === c.path.at(-1)!.length - key.length - 1);
    return pick.length === 1 ? pick[0]! : null;
  };
  // Does the live owner bind this attempt's ending in the copy the suite recorded for it? A root op: the reference. A copy: that copy live,
  // with the same `resetOn` values it had at the attempt (rule 51: a new value is a new subject).
  const bindsCopy = (actor: string, op: string, copy: { path: string[]; resets: string[] } | null | undefined): "yes" | "no" | "unknown" => {
    const leaf = leafOf(actor);
    const m = refm().machine(machineOf(actor));
    if (leaf === undefined) return "no";
    if (!m?.ops[op]) return "unknown";
    if (m.ops[op]!.fragment === undefined) return refm().binds(m.id, op, leaf);
    if (!copy) return refm().binds(m.id, op, leaf);
    const c = copiesEntry(actor, op)?.byPath.get(JSON.stringify(copy.path));
    return c && JSON.stringify(c.resets) === JSON.stringify(copy.resets) ? "yes" : "no";
  };
  // Stage G (convergence rule, re-check H1''''): who received an ending is OBSERVED, not reported. The suite adds a guard of its own, first,
  // to every alternative that handles an event an ending maps to. The runtime runs it with the recipient's own view, as it runs any guard.
  // The suite places that view itself, at the moment it runs: the one actor (by its `ensure`), life (by its `dispose` steps) and copy (by
  // `Reference.copies`) whose published memory is that view. A delivery is then paired with its own observation, in order, by the events
  // the compiled data maps its op to. Nothing the runtime says about the delivery (`at`, a `turn`'s actor) is in that loop.
  type Who = { actor: string; life: number; path: string[] };
  // Stage H (re-check 10g: equal views): identity is the suite's own, not a view's likeness. Every incarnation's memory, root or copy,
  // carries a serial the suite mints where the memory is made (the compiled `memory.initial`, and `memory.restore` at a boot). A symbol
  // key: no canon, JSON, disk, hash or output sees it, and a patch (`{ ...memory, ...patch }`) keeps it. Two views never share one.
  // `leaf`: the recipient's published leaf when its run began, for rule 14's start node (stage L, review H6).
  type Ear = { ev: string; machine: string; node: string; frag: string | undefined; serial: number | undefined; who: Who | undefined; seq: number; leaf: string | undefined };
  let earSeq = 0; // the order the suite heard runs in, across batches: D11's order is judged by it
  let ears: Ear[] = [];
  const seenViews = new WeakSet<object>();
  const innerOf = (actor: string) => (p: readonly string[]) => {
    try {
      return inst.inner(actor, p);
    } catch {
      return undefined;
    }
  };
  const whereOf = new Map<number, { actor: string; path: string[] }>(); // serial -> the incarnation that publishes it, by the suite's reads
  // Stage I (re-check 10h: the note said "the last scanned wins"; the code kept the first): the first place a serial is seen is kept, and
  // a scan that finds one serial in two places is red, since an identity two incarnations publish places nothing.
  const twice = new Set<number>();
  const scanIds = () => {
    const now = new Map<number, string>();
    const put = (s: unknown, actor: string, path: string[]) => {
      if (typeof s !== "number") return;
      const here = `${actor} [${path.join(" / ")}]`;
      const was = now.get(s);
      if (was !== undefined && was !== here && !twice.has(s)) {
        twice.add(s);
        recipients.shared++;
        missing.push(`(j) one incarnation's identity is published by two: ${was} and ${here}`);
      }
      now.set(s, here);
      if (!whereOf.has(s)) whereOf.set(s, { actor, path });
    };
    for (const actor of new Set([...known, ...attemptActor.values()])) {
      const mem = memoryOf(actor);
      if (mem === undefined) continue;
      put(mem[WHO], actor, []);
      const m = refm().machine(machineOf(actor));
      const leaf = leafOf(actor);
      for (const f of Object.keys(m?.fragments ?? {}))
        for (const c of refm().copies(m!.id, f, leaf, mem, innerOf(actor))) put(innerOf(actor)(c.path)?.memory?.[WHO], actor, c.path);
    }
  };
  const resolve = (s: number): Who | undefined => {
    if (!whereOf.has(s)) scanIds();
    const w = whereOf.get(s);
    return w && { actor: w.actor, life: lifeOf.get(w.actor) ?? 0, path: w.path };
  };
  // The ear sits on one node, so it names the recipient's state too: that node is its published leaf or an ancestor of it.
  const inState = (c: any, frag: string | undefined, node: string, who: Who) => {
    if ((frag === undefined) !== (who.path.length === 0)) return false;
    const nodes = frag === undefined ? c.nodes : c.fragments?.[frag]?.nodes;
    let leaf = who.path.length === 0 ? leafOf(who.actor) : innerOf(who.actor)(who.path)?.state;
    for (let i = 0; leaf !== undefined && i < 64; i++) {
      if (leaf === node) return true;
      leaf = nodes?.[leaf]?.parent;
    }
    return false;
  };
  const say = (w: Who) => `${w.actor} life ${w.life} [${w.path.join(" / ")}]`;
  // Stage J (re-check 10i S1): a boot is not a special case. The runtime's published reads answer from its first evidence (`BootArgs.reads`),
  // so a boot's runs are placed by serial and their state checked at the ear, as they happen, like any other run. Stage K: the published
  // state the ear checks against is anchored at the boot to the record on disk (`anchor`), so it is a claim checked at both ends.
  const listen = (c: any): any => {
    const evs = new Set(Object.keys(c.ops ?? {}).flatMap((op) => {
      const o = c.ops[op];
      const out: string[] = [];
      const add = (x: any) => x?.event && out.push(x.event);
      add(o?.outcomes?.success);
      for (const x of Object.values(o?.outcomes?.failure ?? {})) add(x);
      const u = o?.outcomes?.unknown;
      if (u?.byReason) for (const x of Object.values(u.byReason)) add(x);
      else add(u);
      return out;
    }));
    // Stage L (review M5): a stream's deliveries are endings too (rule 47). Each runs in an incarnation that opened that stream's session
    // (its activity's input Slot ran on that incarnation's memory), from the active leaf (rule 14). Events an op also maps stay with the ledger.
    const streamOf = new Map<string, Set<string>>(); // event -> the streams that map it
    for (const [sid, s] of Object.entries(c.streams ?? {}) as Array<[string, any]>)
      for (const m of [s.value, s.missed, s.failure, s.pages, ...Object.values(s.failureBy ?? {})]) if (m?.event && !evs.has(m.event)) (streamOf.get(m.event) ?? streamOf.set(m.event, new Set()).get(m.event)!).add(sid);
    const ear = (ev: string, at: any, node: string, frag: string | undefined) => ({
      at: { definition: at?.definition ?? c.id, path: `${at?.path ?? ""}#heard` },
      run: (g: any) => {
        if (replaying || g === null || typeof g !== "object" || seenViews.has(g)) return true;
        seenViews.add(g); // one walk, one view: the alternatives after the first see the same object
        const serial = typeof g.memory?.[WHO] === "number" ? (g.memory[WHO] as number) : undefined;
        const who = serial === undefined ? undefined : resolve(serial);
        if (who) anchorOnce(); // review M1: a reload's restored state is anchored before the first run, whenever the runtime says `boot`
        if (who && !inState(c, frag, node, who)) missing.push(`(j) a handler of ${ev} ran at ${frag ?? c.id}.${node}, a state its recipient ${say(who)} does not publish`);
        if (who && ghosts.has(who.actor)) missing.push(`(j) a handler of ${ev} ran in ${who.actor}, which the suite disposed and has not ensured since: a ghost life (rule 44)`);
        const leaf = who === undefined ? undefined : who.path.length === 0 ? leafOf(who.actor) : innerOf(who.actor)(who.path)?.state;
        const sids = streamOf.get(ev);
        if (sids) {
          if (!who) return true; // placed by the conservation below only for an op's events; a stream's run is placed here
          recipients.streams++;
          if (![...sids].some((sid) => opened.has(`${serial}|${sid}`))) missing.push(`(j) a stream's delivery of ${ev} ran in ${say(who)}, which opened no session of ${[...sids].join(", ")}`);
          return true;
        }
        ears.push({ ev, machine: c.id, node, frag, serial, who, seq: earSeq++, leaf });
        return true;
      },
    });
    // Stage L (review M5): the incarnation that opens a stream's session, by the serial of the memory its activity's input Slot reads.
    const activities = (n: any) =>
      n.activities
        ? {
            activities: n.activities.map((a: any) => ({
              ...a,
              input: {
                ...a.input,
                run: (x: any) => {
                  const s = x?.memory?.[WHO];
                  if (!replaying && typeof s === "number") opened.add(`${s}|${a.op}`);
                  return a.input.run(x);
                },
              },
            })),
          }
        : {};
    // Stage L (review H6): an ask's owner is the activation of the state its alternative's transition names (rule 14; `self`: the handler's
    // own). Recorded with the asking incarnation's serial, in ask order, and given to the attempt its mint names.
    const owned = (alt: any, node: string, frag: string | undefined) =>
      alt.members?.some((m: any) => (m.verb === "commit" || m.verb === "lookup") && m.input)
        ? {
            members: alt.members.map((m: any) =>
              (m.verb === "commit" || m.verb === "lookup") && m.input
                ? {
                    ...m,
                    input: {
                      ...m.input,
                      run: (a: any) => {
                        const s = a?.memory?.[WHO];
                        if (!replaying) askOwners.push({ op: m.op, machine: c.id, frag, node: alt.target === "self" || alt.target === undefined ? node : alt.target, serial: typeof s === "number" ? s : undefined });
                        return m.input.run(a);
                      },
                    },
                  }
                : m,
            ),
          }
        : {};
    // A follow-up is the compiled data's own mail, seen by the suite as its Slot returns it: it pays one run of its event in the actor
    // whose turn made it (any copy of that actor's: the follow-up's own `to` is the runtime's to route).
    const follow = (alt: any) =>
      alt.followUps
        ? {
            followUps: alt.followUps.map((f: any) => ({
              ...f,
              run: (a: any) => {
                const ev = f.run(a);
                const s = a?.memory?.[WHO];
                const who = !replaying && typeof s === "number" ? resolve(s) : undefined;
                if (who && typeof ev?.tag === "string") credit(who.actor, ev.tag, null);
                return ev;
              },
            })),
          }
        : {};
    const nodes = (ns: Record<string, any>, frag?: string) =>
      Object.fromEntries(Object.entries(ns ?? {}).map(([id, n]) => [id, n.on ? { ...n, ...activities(n), on: Object.fromEntries(Object.entries(n.on).map(([ev, alts]) => [ev, (alts as any[]).map((alt) => ({ ...alt, ...follow(alt), ...owned(alt, id, frag), ...(evs.has(ev) || streamOf.has(ev) ? { guards: [ear(ev, alt.at, id, frag), ...(alt.guards ?? [])] } : {}) }))])) } : { ...n, ...activities(n) }]));
    // Stage I (T1): only the Slots the compiled data has are wrapped. A restore that is absent stays absent (see `mintIn`).
    const tagged = (mem: any) => ({
      ...mem,
      initial: { ...mem.initial, run: (i: unknown) => tag(mem.initial.run(i)) },
      ...(mem.restore
        ? {
            restore: {
              ...mem.restore,
              run: (s: unknown) => {
                try {
                  return tag(mem.restore.run(s));
                } catch (x) {
                  restoreThrew = true; // stage L: the compiled restore refused this record, seen by the suite: a cause for its quarantine
                  throw x;
                }
              },
            },
          }
        : {}),
    });
    return {
      ...c,
      memory: tagged(c.memory),
      nodes: nodes(c.nodes),
      ...(c.fragments ? { fragments: Object.fromEntries(Object.entries(c.fragments).map(([id, f]: [string, any]) => [id, { ...f, memory: tagged(f.memory), nodes: nodes(f.nodes, id) }])) } : {}),
    };
  };
  const ended = new Set<string>(); // attempts with an `ending` said
  const openAttempts = (op?: string) => [...attemptActor].filter(([a]) => !ended.has(a) && (op === undefined || madeOp.get(a) === op));
  const cancelSeen = (actor: string, op: string, att?: string, placed = att) => {
    const evs = drivenTo.get(actor);
    if (!evs) return false;
    // Stage G, per copy: an event the suite sent to one copy (`to`) cancels nothing in another copy of the attempt's.
    const copy = placed === undefined ? undefined : attemptCopy.get(placed);
    const reaches = (ev: string) => !copy || copy.path.length === 0 || [...(drivenPath.get(actor)?.get(ev) ?? [""])].some((p) => p === "" || prefix(JSON.parse(p), copy.path) || prefix(copy.path, JSON.parse(p)));
    // An ending's own mapped event is no cause for that same op's ending: an ending hidden as evidence would excuse itself (lie.like2nc-released).
    // Stage E: nor is a restored ending's, after a reload, a cause for that same attempt (SURV-03's lie: `reload:` names the attempt).
    for (const [ev, from] of evs) if ([...from].some((o) => o !== op && o !== `reload:${att}`) && reaches(ev) && refm().cancelsOn(machineOf(actor), op, ev, leafPrev.get(actor) ?? leafOf(actor)) !== "no") return true;
    return false;
  };
  // Stage K, D9 and D11 (`conformance-audit/ending-check-design.md`): a restored ending is due at the boot, before any input the suite drove
  // after the reload began (rule 44, rule 54). Its excuses are judged at that time: "the life is over" as the owner was at the reload. So
  // an input that waited on a slow load (a `dispose`) and was stepped first excuses nothing. Kept until the ledger settles the ending.
  // Stage L (review R6): what is owed at a boot, and whether an owner is alive, are the suite's own facts: its steps (ensure, dispose,
  // reload, the load it answered), the bytes it owns read through the codec, and the compiled data. What the runtime publishes, says or
  // leaves out never excuses. `due` comes from the disk's heads and parked endings, not from the runtime's `ending`.
  const due = new Map<string, { actor: string; key: string; over: boolean; path: readonly string[] | undefined; lane: string | undefined }>(); // attempt -> as at the reload
  let lifeAtReload = new Map<string, number>();
  let bootSeen = false; // this instance's `boot` evidence has come
  const notRestored = new Set<string>();
  let restoreThrew = false; // a compiled `memory.restore` threw on a stored record (the suite's own wrap saw it)
  const ensured = new Set<string>(); // the suite ensured it, and has not disposed it; at a reload, kept only with a record on disk
  // Rule 73 (OD31, 2.10.10): in an app Story, `ensure(ref)` attaches one use, as a mounted screen does, and `detach(ref)` ends one. The suite
  // counts the uses it holds, by kind: the Story's own ("story"), host subscriptions ("host") and mounted local actors ("component"). A reload
  // re-attaches the Story's uses and subscriptions held in that life, in first-ensure order.
  const held = new Map<string, number>();
  const subs = new Map<string, number>();
  const mounts = new Map<string, number>();
  const usesHeld = (key: string) => (held.get(key) ?? 0) + (subs.get(key) ?? 0) + (mounts.get(key) ?? 0);
  const use = (key: string, machine: string, input: unknown, identity?: readonly string[], persist?: boolean) => {
    if (inst.attach) {
      bump(held, key, 1);
      inst.attach(key, machine, input, "story", false, identity, persist);
    } else inst.ensure(key, machine, input, identity, persist);
  };
  // Onto what the boot restored, or a record kept at ready: a re-attach restores it from the Runtime's copy and creates nothing, so a record
  // quarantined at boot stays absent until a case asks (a pending use, as a subscription on an identity with neither waits).
  const reattach = () => {
    if (!inst.attach) return;
    for (const [a, n] of [...held]) {
      if (!ensured.has(a)) held.delete(a);
      else for (let i = 0; i < n; i++) inst.attach(a, machineOf(a), undefined, "story", true);
    }
    for (const [a, n] of [...subs]) for (let i = 0; i < n; i++) inst.attach(a, machineOf(a), undefined, "host", true);
    mounts.clear(); // a local actor's component mounts again as a new actor, which no case here drives
  };
  // Rule 73's global invariants (proposal-v5 11.4), from the suite's own facts: the uses it holds, the attempts it saw minted and the waits it
  // checks against the fake. (1) safety and (3) same incarnation: an end while the suite holds a use, or while a write the actor minted is in
  // flight (its ending then reaches another incarnation); (2) liveness: a counted actor free past its grace with no end; (4) no schedule fires
  // on an incarnation with no use.
  const violations: string[] = [];
  const INFLIGHT = new Set(["wire", "mail", "ready", "queue", "repair", "ack", "capture", "disabled"]);
  const counted = (key: string) => {
    const c = compiled.find((x) => x.id === machineOf(key));
    return c !== undefined && (!c.local || (mounts.get(key) ?? 0) > 0);
  };
  // The store's forced repair for an unknown is the record queue's, across actors (2.8), not the actor's work (rule 73: "other reads"); a
  // head waiting on its repair is listed by its lane, and that one is.
  const inFlightOf = (key: string) =>
    inst.waits().filter((w) => INFLIGHT.has(w.kind) && "attempt" in w && w.attempt && attemptActor.get(w.attempt) === key && (w as { store?: boolean }).store !== true);
  // Kept reads, by the suite's own sight: a read invoked in the batch that delivered an ending of the actor's write (or a kept read's), until it ends.
  const keptReads = new Map<string, Set<string>>(); // actor -> read attempts
  const admittedAtt = new Set<string>(); // attempts whose ending the runtime admitted (a turn, a park, evidence, an ignore)
  const lifetimeCheck = (e: readonly Record<string, any>[]) => {
    if (!inst.inspect) return;
    const keptTurnOf = new Set<string>();
    for (const x of e) {
      if (["delivered", "parked", "evidenceOnly", "ignored"].includes(x["kind"]) && x["attempt"]) admittedAtt.add(String(x["attempt"]));
      if (x["kind"] === "delivered" && x["attempt"]) {
        const att = String(x["attempt"]);
        const a = attemptActor.get(att) ?? [...keptReads].find(([, s]) => s.has(att))?.[0];
        if (a !== undefined && (attemptActor.has(att) || keptReads.get(a)?.has(att))) keptTurnOf.add(a);
      }
      if (x["kind"] === "invoked" && String(x["attempt"] ?? "").startsWith("read/"))
        for (const a of keptTurnOf) if (String(x["attempt"]).startsWith(`read/${a}/`)) keptReads.set(a, new Set([...(keptReads.get(a) ?? []), String(x["attempt"])]));
      if ((x["kind"] === "ending" || x["kind"] === "Superseded") && String(x["attempt"] ?? "").startsWith("read/"))
        for (const s of keptReads.values()) if (x["kind"] === "Superseded") s.delete(String(x["attempt"]));
      if (x["kind"] === "delivered" && String(x["attempt"] ?? "").startsWith("read/")) for (const s of keptReads.values()) s.delete(String(x["attempt"]));
      if (x["kind"] === "ended") {
        const a = String(x["actor"]);
        if (usesHeld(a) > 0) violations.push(`(73) safety: ${a} ended while the suite holds ${usesHeld(a)} use(s)`);
        const w = inFlightOf(a);
        if (w.length > 0) violations.push(`(73) same incarnation: ${a} ended with work in flight: ${w.map((y) => `${y.op} ${(y as { attempt: string }).attempt}`).join(", ")}`);
        const r = [...(keptReads.get(a) ?? [])];
        if (r.length > 0) violations.push(`(73) same incarnation: ${a} ended with a kept read open: ${r.join(", ")}`);
        // An ending owed at ready (2.7.17 Ready): due to this actor at the reload and not yet heard.
        const owed = [...due].filter(([att, d]) => d.actor === a && !d.over && !admittedAtt.has(att));
        if (owed.length > 0) violations.push(`(73) same incarnation: ${a} ended owing endings from ready: ${owed.map(([att]) => att).join(", ")}`);
      }
      if (x["kind"] === "fired") {
        const a = String(x["actor"]);
        if (counted(a) && usesHeld(a) === 0) violations.push(`(73) a schedule fired with no use: ${x["id"]} of ${a}`);
      }
    }
  };
  const livenessCheck = () => {
    if (!inst.inspect || fake.freezeTimers) return;
    for (const a of known) {
      if (inst.state(a) === undefined || !counted(a) || usesHeld(a) > 0) continue;
      const i = inst.inspect(a);
      if (i.uses.length > 0 || i.busy.length > 0 || inFlightOf(a).length > 0) continue;
      if (i.grace === undefined) violations.push(`(73) liveness: ${a} is free and no grace is armed`);
      else if (i.grace <= fake.now) violations.push(`(73) liveness: ${a} is free past its grace (${i.grace} <= ${fake.now})`);
    }
  };
  const ghosts = new Set<string>(); // the suite disposed it and has not ensured it since (review H5)
  const ghostsPending = new Set<string>(); // disposed by a step that has not settled yet
  const lifeBefore = new Map<string, number>(); // the life a dispose ended, so a dispose a kill undid can be undone (D80)
  const seenLive = new Set<string>(); // ensured actors this instance has published: one that stops is red (review H3)
  const opened = new Set<string>(); // `${serial}|${stream}`: the incarnations that opened a stream's session (review M5)
  let askOwners: Array<{ op: string; machine: string; frag: string | undefined; node: string; serial: number | undefined }> = [];
  // An attempt's owner (rule 14): the node its transition names, in the incarnation of `serial`, and the ancestors of that node that
  // stayed in the incarnation's published chain at every batch since the ask. `undefined` once the suite cannot tell (a resend by a retry).
  const ownerOf = new Map<string, { machine: string; frag: string | undefined; node: string; serial: number; live: Set<string> } | undefined>();
  const offActors = new Set<string>(); // review M9: actors whose bytes the case edited or tore; their obligations only are excused
  const off = (actor: string | undefined) => ledgerOff || (actor !== undefined && offActors.has(actor));
  // A stored key's actor, by the codec; a key it scopes to no actor (meta, host) excuses the case, as before.
  const offActor = (key: string) => {
    const a = port.disk.scope(key);
    if (a === undefined) ledgerOff = true;
    else offActors.add(a);
  };
  const deliveredOnce = new Set<string>(); // review M6: attempts whose ending a run took, across boots (rule 17)
  const endingOf = new Map<string, { ch: string; reason: string }>(); // review M3: what each attempt's ending is
  const declineEndingOf = new Map<string, { ch: string; reason: string }>(); // and each op's latest decline's
  const bootDeclines = new Map<string, number>(); // lane -> how far its restored declines have run, during the step that boots
  // The facts of the last reload: the bytes as the boot was given them, and who was alive with a record.
  let reloadFacts: { kv: ReadonlyMap<string, string>; heads: readonly string[]; parked: ReadonlyArray<{ op: string; attempt: string; lane: string }>; alive: ReadonlySet<string>; answered: number } | undefined;
  let anchored = true; // this instance's restored state has been checked (nothing to check before the first reload)
  const given = () => reloadFacts !== undefined && fake.loadAnswered > reloadFacts.answered; // the records reached this boot
  const lifeOver = (att: string) => {
    const d = due.get(att);
    if (d) return d.over;
    const actor = attemptActor.get(att);
    if (actor === undefined) return undefined;
    if (attemptLife.get(att) !== (lifeOf.get(actor) ?? 0)) return true; // the life that asked is over; a new one is owed nothing (rule 44)
    return !ensured.has(actor); // not alive by the suite's own steps: a reload took it (no record), or it was never made live
  };
  // A release of `att`'s lane, said by the runtime, has a cause the suite saw. No attempt named: no actor known, no pay (re-check H1': no wildcard).
  // `self`: a release of the attempt whose own restored ending, after a reload the suite drove, maps to a cancel. It pays the release (h) reads,
  // never that attempt's ending as evidence: a delivered restored ending is paid by its delivery.
  const releaseSeen = (op: string, att: string | undefined, self = false) => {
    if (att === undefined) return false;
    const actor = attemptActor.get(att);
    if (actor === undefined) return false;
    return lifeOver(att) === true || moveLetsGo(actor, op, att) || cancelSeen(actor, op, self ? undefined : att, att) || ignoredUnknown.has(att);
  };
  // Round 14 (OD28): whether the compiled mapping says `Flow.ignore` for an `ignored` evidence's channel and reason. Undefined: no owner the suite knows.
  // A decline has no attempt; its owners are the actors whose declines of the op the suite placed.
  const ignoredUnknown = new Set<string>(); // attempts whose unknown the mapping ignores: rule 40 releases them, a cause the suite saw (P1)
  const ignoreMapped = (x: Record<string, any>): boolean | undefined => {
    const att = String(x["attempt"] ?? "");
    // A decline (no attempt) of an op: owned by an actor the suite addressed whose machine declares the op.
    const owners = att ? [attemptActor.get(att)].filter((a): a is string => a !== undefined) : [...known].filter((a) => refm().machine(machineOf(a))?.ops[String(x["op"])] !== undefined);
    if (owners.length === 0) return undefined;
    const ch = String(x["channel"]);
    const r = String(x["reason"]);
    return owners.some((owner) => {
      const o = refm().machine(machineOf(owner))?.ops[String(x["op"])] as any;
      const u = o?.outcomes.unknown;
      const mp = !o ? undefined : ch === "success" ? o.outcomes.success : ch === "failure" ? (o.outcomes.failure?.[r] ?? (NOT_SENT.has(r) ? o.outcomes.failure?.["NotSent"] : undefined)) : u?.byReason ? u.byReason[r] : u;
      return mp?.ignore === true;
    });
  };
  const mayBeEvidence = (x: Record<string, any>, batch: readonly Record<string, any>[]) => {
    const att = String(x["attempt"] ?? "");
    if (lettingGo.has(att)) return true;
    const actor = attemptActor.get(att);
    if (actor === undefined) return false;
    if (lifeOver(att)) return true;
    // A lane let go this batch: its queued commits and parked endings go as evidence (rule 60). The runtime names the head; the suite needs its cause.
    // The sign says a release of the op happened; the cause is checked against THIS attempt's owner, so a sign from anyone's lane pays nothing alone.
    return batch.some((y) => y["op"] === x["op"] && (y["kind"] === "Released" || (y["kind"] === "lane" && String(y["cell"]).startsWith("lane.release.")))) && releaseSeen(String(x["op"]), att);
  };
  const mayLetGo = (x: Record<string, any>, batch: readonly Record<string, any>[]) => {
    if (mayBeEvidence(x, batch)) return true;
    const op = String(x["op"]);
    const actor = attemptActor.get(String(x["attempt"] ?? ""));
    // D154: the owner's published state moved this batch, or the suite drove it a cancel of the op (seen), or a newer keep of the op, which
    // `missingEndings` holds to a wait naming it. A let-go with no attempt (a decline) has no owner the suite knows: any actor's seen cause of the op.
    const att = String(x["attempt"] ?? "");
    const seen = (a: string) => moveLetsGo(a, op, att || undefined) || cancelSeen(a, op, att);
    // Stage G (re-check: a decline's let-go excused by any actor's move): a decline is owed by the actors whose declining turn parked it,
    // as the suite placed them (`declineCopy`), not by every actor it knows.
    if (actor !== undefined ? seen(actor) : [...(declineOwners.get(op) ?? [])].some(seen)) return true;
    return batch.some((y) => y["kind"] === "kept" && y["op"] === x["op"]);
  };
  // Stage K, D9 (re-check 10j S1'): before any run of a boot, every actor and live copy with a record on disk must publish the leaf that
  // record holds, read from the suite's bytes by the declared codec (`disk.leaves`). The runtime's decode is a claim; after this, each run
  // is checked against the published leaf at the ear, so the expectation is anchored at both ends. A leaf this release no longer has is
  // rule 46's other row.
  // Stage L (review H1, H3, M1, M2): the anchor runs once per boot that was given the records, before the first run in it or at its
  // `boot` evidence or at the end of the suite's own step, whichever comes first. Every actor the suite left alive with a record on disk
  // must be restored, the codec must read its leaf (no answer is red, not a skip), and every live copy must be in both the record and what
  // the runtime publishes. A record the runtime quarantined is excused only for a cause the suite drove: a release, or bytes it edited.
  const quarantined = (actor: string) =>
    ((releases.length > 0 || off(actor) || restoreThrew) && issues.some((i) => i.code === "RecordQuarantined" && port.disk.scope(String(i.input ?? "").split(": ")[0]!) === actor)) ||
    // Rule 74 (OD30 Q3): a release that changed a value-named machine's input fields leaves an old-version record, listed and never restored.
    (releases.length > 0 && evidence.some((e) => e["kind"] === "OldVersionActor" && e["actor"] === actor));
  // Rule 73 (OD31, Ready and hydration): a record the boot keeps as a record is restored when the suite's re-attach reaches it. Its anchor
  // waits for that incarnation, before any run in it; still absent at the end of the step that booted, it was not restored.
  const deferredAnchor = new Set<string>();
  const anchorDeferred = (e: readonly Record<string, any>[]) => {
    if (deferredAnchor.size === 0 || !reloadFacts) return;
    for (const x of e)
      if (x["kind"] === "incarnation" && deferredAnchor.has(String(x["actor"]))) {
        deferredAnchor.delete(String(x["actor"]));
        anchorActor(String(x["actor"]), new Map(reloadFacts.kv));
      }
  };
  const anchorOnce = () => {
    if (anchored || !reloadFacts || !given()) return;
    anchored = true;
    const kv = new Map(reloadFacts.kv); // review L4: the codec reads a copy, never the suite's own map
    for (const actor of reloadFacts.alive) {
      const m = refm().machine(machineOf(actor));
      if (!m || off(actor)) continue;
      if (leafOf(actor) === undefined && usesHeld(actor) > 0) {
        deferredAnchor.add(actor);
        continue;
      }
      anchorActor(actor, kv);
    }
  };
  const anchorActor = (actor: string, kv: Map<string, string>) => {
    {
      const m = refm().machine(machineOf(actor))!;
      if (leafOf(actor) === undefined) {
        notRestored.add(actor); // judged at the end of the step, when the boot's issues (a quarantine) have come
        return;
      }
      const ls = port.disk.leaves(kv, actor);
      if (!ls?.some((x) => x.path.length === 0)) {
        missing.push(`(j) the codec reads no leaf for ${actor}'s record, which the runtime restored`);
        return;
      }
      const onDisk = new Set(ls.map((x) => JSON.stringify(x.path)));
      for (const { path, leaf } of ls) {
        const got = path.length === 0 ? leafOf(actor) : innerOf(actor)(path)?.state;
        const known = path.length === 0 ? m.nodes[leaf] !== undefined : Object.values(m.fragments ?? {}).some((f) => f.nodes[leaf] !== undefined);
        if (!known) continue; // a leaf this release no longer has: rule 46's other row
        if (got === undefined) {
          missing.push(`(j) a copy on disk was not restored: ${actor} [${path.join(" / ")}] holds ${leaf}`);
          continue;
        }
        recipients.anchored++;
        if (got !== leaf) missing.push(`(j) restored in ${got}, but its record on disk holds ${leaf}: ${actor} [${path.join(" / ")}]`);
      }
      for (const f of Object.keys(m.fragments ?? {}))
        for (const c of refm().copies(m.id, f, leafOf(actor), memoryOf(actor), innerOf(actor)))
          if (!onDisk.has(JSON.stringify(c.path))) missing.push(`(j) restored a copy its record does not hold: ${actor} [${c.path.join(" / ")}]`);
    }
  };
  // A `NotSent` ending's `why`s (rule 13, 2.7.13): the reason its evidence carries in place of the tag.
  const NOT_SENT = new Set(["Restored", "Ended", "NotLive", "Unencodable", "Unproven", "Cancelled", "Disposed", "StorageRefused", "Rejected", "Overloaded"]);
  // Review M2: loading is the fake's fact (a load the suite has not answered), ended early only by a boot the runtime said with none.
  const loadingNow = () => fake.loadPending && !bootSeen;
  // Rule 13: the event an ending maps to, from the compiled outcomes and what the ending is (its channel and reason).
  const eventOf = (machine: string, op: string, e: { ch: string; reason: string } | undefined): string | undefined => {
    const o = refm().machine(machine)?.ops[op] as any;
    if (!o || !e) return undefined;
    if (e.ch === "success") return o.outcomes.success?.event;
    if (e.ch === "failure") return (o.outcomes.failure?.[e.reason] ?? (NOT_SENT.has(e.reason) ? o.outcomes.failure?.["NotSent"] : undefined))?.event; // a NotSent's reason is its `why`
    const u = o.outcomes.unknown;
    return u?.byReason ? u.byReason[e.reason]?.event : u?.event;
  };
  const nodesOf = (machine: string, frag: string | undefined): Readonly<Record<string, any>> => {
    const m = refm().machine(machine);
    return (frag === undefined ? m?.nodes : m?.fragments?.[frag]?.nodes) ?? {};
  };
  const chainOf = (ns: Readonly<Record<string, any>>, leaf: string) => {
    const out: string[] = [];
    for (let n: string | undefined = leaf, i = 0; n !== undefined && ns[n] && i < 64; i++, n = ns[n].parent) out.push(n);
    return out;
  };
  // A current walk from `start`: the nodes whose alternatives on `ev` it may try first, up to and including the first with one no token gates.
  const allowedStarts = (ns: Readonly<Record<string, any>>, start: string, ev: string) => {
    const out: string[] = [];
    for (const n of chainOf(ns, start)) {
      const alts = ns[n]?.on?.[ev] as any[] | undefined;
      if (!alts?.length) continue;
      out.push(n);
      if (alts.some((a) => (a.tokens ?? []).length === 0)) break;
    }
    return out;
  };
  const freeHandler = (machine: string, frag: string | undefined, start: string, ev: string) => {
    const ns = nodesOf(machine, frag);
    return chainOf(ns, start).find((n) => (ns[n]?.on?.[ev] as any[] | undefined)?.some((a) => (a.tokens ?? []).length === 0));
  };
  // Rule 14 for one delivery: current from the active leaf (every Restored, and an adopted lane: never an activation of this incarnation),
  // or late from the owner's nearest strict ancestor whose activation is the one alive when the call started. Undefined where the suite
  // does not know the owner (an ask it did not see, or a resend by a retry).
  const startOf = (att: string, who: Who, leaf: string): { node: string; late: boolean } | undefined => {
    if (due.has(att) || who.life !== (attemptLife.get(att) ?? 0)) return { node: leaf, late: false };
    const o = ownerOf.get(att);
    if (!o) return undefined;
    const ow = resolve(o.serial);
    if (!ow || ow.actor !== who.actor || !samePath(ow.path, who.path)) return { node: leaf, late: false };
    if (o.live.has(o.node)) return { node: leaf, late: false };
    const ns = nodesOf(o.machine, o.frag);
    let n: string | undefined = ns[o.node]?.parent;
    while (n !== undefined && !o.live.has(n)) n = ns[n]?.parent;
    const root = o.frag === undefined ? refm().machine(o.machine)?.root : refm().machine(o.machine)?.fragments?.[o.frag]?.root;
    return n ?? root ? { node: (n ?? root)!, late: true } : undefined;
  };
  const ledger = (e: readonly Record<string, any>[]) => {
    unpaid = [];
    for (const x of e) if (x["kind"] === "ignored" && x["channel"] === "unknown" && x["attempt"] && ignoreMapped(x)) ignoredUnknown.add(String(x["attempt"]));
    const booting = e.some((x) => x["kind"] === "boot");
    if (booting) bootSeen = true;
    for (const x of e) if (x["kind"] === "ending" && x["attempt"] !== undefined && x["attempt"] !== "") endingOf.set(String(x["attempt"]), { ch: String(x["channel"]), reason: String(x["reason"]) });
    if (booting && !given() && reloadFacts) {
      // The runtime booted with no records: the load failed or it gave up waiting (O5, its own bound). Nothing on disk is owed to it.
      for (const a of reloadFacts.alive) ensured.delete(a);
      bootOwed.clear();
      anchored = true;
      reloadFacts = undefined;
    }
    if (booting && given() && reloadFacts && !ledgerOff) {
      anchorOnce();
      for (const p of reloadFacts.parked) if (p.attempt === "" && !off(port.disk.scope(p.lane))) bootDeclines.set(p.lane, 0);
      // Review H2: what the boot owes is read from the disk. Every head on disk gets its ending at the boot (a held head's `unknown
      // { Restored }` once, rule 44), or its own parked one; every parked ending is owed too (`bootOwed`). Each is due as at the reload.
      const said = new Map<string, Record<string, any>>();
      for (const x of e) if ((x["kind"] === "ending" || x["kind"] === "unparked") && x["attempt"]) said.set(String(x["attempt"]), x);
      const heads = new Set(reloadFacts.heads);
      for (const att of [...reloadFacts.heads, ...reloadFacts.parked.map((p) => p.attempt)]) {
        const owner = attemptActor.get(att);
        if (!att || owner === undefined || off(owner) || due.has(att)) continue;
        const op = madeOp.get(att) ?? reloadFacts.parked.find((p) => p.attempt === att)?.op ?? "";
        if (refm().machine(machineOf(owner))?.ops[op] === undefined) continue; // the op this release removed: rule 46's `orphaned`
        const x = said.get(att);
        if (!x) {
          missing.push(`(j) on disk at the reload, and the boot said no ending of it: ${op} ${att} of ${owner}`);
          continue;
        }
        // The restore table (2.7.13): a head ends `unknown { Restored }` unless its own ending is parked; queued work `NotSent { Restored }`.
        if (x["kind"] === "ending" && heads.has(att) && (x["channel"] !== "unknown" || x["reason"] !== "Restored")) missing.push(`(j) a head on disk restored as ${x["channel"]} ${x["reason"]}, not unknown Restored: ${op} ${att}`);
        // Review M6: an ending a run took once is not restored again, except a head's own per-boot Restored.
        if (deliveredOnce.has(att) && (x["kind"] === "unparked" || !heads.has(att))) missing.push(`(j) delivered once, and restored again at this boot: ${op} ${att} (rule 17)`);
        const over = attemptLife.get(att) !== (lifeAtReload.get(owner) ?? 0) || !reloadFacts.alive.has(owner);
        due.set(att, { actor: owner, key: `${op} ${att}`, over, path: attemptCopy.get(att)?.path, lane: reloadFacts.parked.find((p) => p.attempt === att)?.lane });
      }
      // Queued work (W) restores as `NotSent { Restored }` (D107); the codec names no W, so it is checked by the channel only.
      for (const x of e) {
        const att = String(x["attempt"] ?? "");
        if (x["kind"] !== "ending" || !att || heads.has(att) || reloadFacts.parked.some((p) => p.attempt === att)) continue;
        if (x["channel"] !== "failure" || x["reason"] !== "Restored") missing.push(`(j) queued work restored as ${x["channel"]} ${x["reason"]}, not NotSent Restored: ${x["op"]} ${att}`);
        const owner = attemptActor.get(att);
        // Restored endings too, so due as at the reload, though the codec names no W: owed only, never an excuse.
        if (owner !== undefined && !off(owner) && !due.has(att)) due.set(att, { actor: owner, key: ledgerKey(x), over: attemptLife.get(att) !== (lifeAtReload.get(owner) ?? 0) || !reloadFacts.alive.has(owner), path: attemptCopy.get(att)?.path, lane: undefined });
      }
    }
    // Review M4: an actor whose restored endings are owed may not move but by their own runs.
    const owedNow = new Set([...due.values()].filter((d) => told.has(d.key) && !d.over).map((d) => d.actor));
    // Stage H: a view made in this batch is published only now; place what the ear could not.
    const heardNow = ears.map((o) => ({ ...o, who: o.who ?? (o.serial === undefined ? undefined : resolve(o.serial)), used: false }));
    ears = [];
    // Attribution: a mint or an invoke belongs to the turn before it in the step, or, if none came before, the turn after it.
    let turnActor: string | undefined;
    const pending: string[] = [];
    // Stage F: the copy the running turn is in, by what the suite drove (a `to`, or a delivered attempt's own copy).
    let cause: readonly string[] | null = stepTo ? stepTo.to : null;
    const causeOf = new Map<string, readonly string[] | null>();
    const declines: Array<{ op: string; cause: readonly string[] | null }> = [];
    for (const x of e) {
      if (x["kind"] === "delivered") cause = x["attempt"] ? (attemptCopy.get(String(x["attempt"]))?.path ?? null) : null;
      if ((x["kind"] === "mint" || x["kind"] === "invoked") && !causeOf.has(String(x["attempt"])) && !attemptCopy.has(String(x["attempt"]))) {
        causeOf.set(String(x["attempt"]), cause);
        const i = askKeys.findIndex((q) => q.op === x["op"]);
        if (i >= 0) keyOf.set(String(x["attempt"]), askKeys.splice(i, 1)[0]!.key);
        // Review H6: the attempt's owner, from the ask the suite saw, with every ancestor of the owner node alive so far.
        const j = askOwners.findIndex((q) => q.op === x["op"]);
        const q = j >= 0 ? askOwners.splice(j, 1)[0]! : undefined;
        if (q && q.serial !== undefined && !ownerOf.has(String(x["attempt"]))) ownerOf.set(String(x["attempt"]), { machine: q.machine, frag: q.frag, node: q.node, serial: q.serial, live: new Set(chainOf(nodesOf(q.machine, q.frag), q.node)) });
      }
      if ((x["kind"] === "mint" || x["kind"] === "invoked") && x["send"] !== undefined && (sends.get(String(x["attempt"]))?.length ?? 0) >= 1 && !(sends.get(String(x["attempt"])) ?? []).includes(String(x["send"])))
        ownerOf.set(String(x["attempt"]), undefined); // a resend: a retry may have moved the owner, which the suite does not see
      if (x["kind"] === "ending" && x["attempt"] === undefined) {
        declines.push({ op: String(x["op"]), cause });
        declineEndingOf.set(String(x["op"]), { ch: String(x["channel"]), reason: String(x["reason"]) }); // review M3, for a decline too
      }
      if (x["kind"] === "turn") {
        const who = String(x["actor"]);
        if (stepTo && who === stepTo.actor && String(x["event"]) === stepTo.event) stepTo = undefined;
        for (const d of declines.splice(0)) declineCopy.set(d.op, { actor: who, copy: placeFor(who, d.op, d.cause) });
        cause = null;
        // Re-check M2'' (A1): attribute only to an actor the suite addressed or that publishes. A turn of any other is itself red.
        if (!known.has(who) && !published.has(who) && publishedNow(who) === undefined) {
          missing.push(`(j) a turn of an actor the suite never addressed and that publishes nothing: ${who}`);
          continue;
        }
        turnActor = who;
        for (const a of pending.splice(0)) if (!attemptActor.has(a)) attribute(a, turnActor);
      }
      if (x["kind"] === "mint" || x["kind"] === "invoked") {
        const a = String(x["attempt"]);
        if (x["send"] !== undefined) (sends.get(a) ?? sends.set(a, []).get(a)!).push(String(x["send"]));
        if (!made.has(a)) {
          made.set(a, made.size);
          madeOp.set(a, String(x["op"]));
        }
        if (attemptActor.has(a)) continue;
        if (turnActor !== undefined) attribute(a, turnActor);
        else pending.push(a);
      }
    }
    for (const [a, c] of causeOf) {
      const actor = attemptActor.get(a);
      if (actor !== undefined && !attemptCopy.has(a)) attemptCopy.set(a, placeFor(actor, madeOp.get(a) ?? "", c, keyOf.get(a)));
    }
    askKeys = [];
    askOwners = [];
    // D154: whose published state moved in this batch, by the suite's own reading before and after it.
    moved = new Set();
    const prev = new Map<string, string | undefined>();
    for (const actor of new Set([...known, ...attemptActor.values()])) {
      const now = publishedNow(actor);
      const before = published.get(actor);
      prev.set(actor, before === undefined ? undefined : (JSON.parse(before) as [string, string])[0]);
      if (published.has(actor) && before !== now) moved.add(actor);
      if (now === undefined) published.delete(actor);
      else published.set(actor, now);
    }
    leafPrev = prev;
    // Stage E, oracle (ref): the runtime's binding against the suite's reference, every batch, for every live actor and every op of its
    // machine, where the reference is certain. A root op is bound while the actor lives; a fragment's op with no placing state is bound nowhere.
    for (const actor of known) {
      const leaf = leafOf(actor);
      const m = refm().machine(machineOf(actor));
      if (leaf === undefined || !m || !inst.binding) continue;
      for (const op of Object.keys(m.ops)) {
        const want = refm().binds(m.id, op, leaf);
        if (want === "unknown" || (want === "yes" && m.ops[op]!.fragment !== undefined)) continue; // a placed fragment's subject is the runtime's
        let got: readonly string[] | undefined;
        try {
          got = inst.binding(actor, op, []);
        } catch {
          continue;
        }
        if ((got !== undefined) !== (want === "yes")) missing.push(`(ref) binding: the runtime ${got ? `binds ${op} at [${got.join("/")}]` : `binds ${op} nowhere`} in ${actor} at ${leaf}; the reference says ${want === "yes" ? "bound" : "unbound"}`);
      }
    }
    // Stage F (re-check: (ref) asked only with `[]`): every open attempt of a copy, asked with its real subject, the `.each` keys of the path the
    // suite recorded (rule 51). A `resetOn` part is the runtime's encoding of a value, so a path under one is asked by (j)'s park check only.
    if (inst?.binding)
      for (const [a, copy] of attemptCopy) {
        const actor = attemptActor.get(a);
        if (!copy || copy.path.length === 0 || copy.resets.length > 0 || actor === undefined || ended.has(a) || !known.has(actor)) continue;
        const op = madeOp.get(a) ?? "";
        const want = bindsCopy(actor, op, copy);
        if (want === "unknown") continue;
        const subject = copy.path.flatMap((s) => (s.includes(":") ? [s.slice(s.indexOf(":") + 1)] : []));
        let got: readonly string[] | undefined;
        try {
          got = inst.binding(actor, op, subject);
        } catch {
          continue;
        }
        if (want === "yes" ? !got || !samePath(got, copy.path) : got !== undefined) missing.push(`(ref) binding with subject [${subject.join(" / ")}]: the runtime ${got ? `binds ${op} at [${got.join(" / ")}]` : `binds ${op} nowhere`} in ${actor}; the reference says ${want === "yes" ? `[${copy.path.join(" / ")}]` : "unbound"}`);
      }
    // Re-check M3', D154: `Superseded` is the runtime's word. It is owed a seen cause: the owner's life over (or a dispose this batch, which the
    // suite drove), or the compiled op supersedes (`latest`) and this batch holds a newer attempt of the same op by the same owner.
    const disposing = e.some((x) => x["kind"] === "DisposeStart");
    for (const x of e) {
      if (x["kind"] !== "Superseded" || disposing) continue;
      const att = String(x["attempt"] ?? "");
      if (lifeOver(att)) continue;
      const policy = compiled.map((c) => (c.ops as any)[x["op"]]?.concurrency).find((p) => p !== undefined);
      const owner = attemptActor.get(att);
      const mine = made.get(att) ?? Infinity;
      const newer = [...made].some(([a, n]) => n > mine && madeOp.get(a) === x["op"] && attemptActor.get(a) === owner);
      // A lookup (`read/`) is bound to its activation: superseded by a newer lookup, or by its owner's published state moving (rule 52).
      const order = sends.get(att) ?? [];
      // A newer send of the same lookup, seen invoked; or a newer ask of it, seen by the suite's own wrap of its input Slot (D108's unencodable ask)
      const resent = order.indexOf(String(x["send"])) < order.length - 1 || askedNow.includes(String(x["op"]));
      if (att.startsWith("read/") ? !(newer || resent || (owner !== undefined && moved.has(owner))) : policy !== "latest" || !newer) missing.push(`(j) superseded with no newer attempt under a policy that supersedes: ${x["op"]} ${att} (${policy})`);
      // Review L1 (2.7.13 item 1): a write the fake saw sent is never replaceable.
      else if (!att.startsWith("read/") && fake.requests.some((r) => r.idempotencyKey === att)) missing.push(`(j) superseded after it was sent: ${x["op"]} ${att}`);
    }
    for (const x of e)
      // A lane let go: the head named now, and every later ending of it, may go as evidence (rule 60, 2.9.3). Only with a cause the suite saw (D154).
      if (x["kind"] === "Released" || (x["kind"] === "lane" && String(x["cell"]).startsWith("lane.release."))) {
        const att = x["attempt"] === undefined ? undefined : String(x["attempt"]);
        if (releaseSeen(String(x["op"]), att)) lettingGo.add(String(att));
        else if (releaseSeen(String(x["op"]), att, true)) releasedBySelf.add(String(att)); // (h) and `checkMints` take it; (j) does not
      }
    // Review M5: `delivered` is the runtime's word. It pays only if the same step shows the machine took it: a turn, a denial, an unhandled, or a refusal. Otherwise the debt stays.
    const heard = e.some((x) => x["kind"] === "turn" || x["kind"] === "Denied" || x["kind"] === "Unhandled" || x["kind"] === "refused");
    const wanted: Array<{ op: string; att: string; evs: readonly string[]; all: readonly string[]; want: Who; copied: boolean; owed: string | undefined }> = []; // expected deliveries no run of their recipient answered
    const refusedEvs = new Set(e.filter((x) => x["kind"] === "refused").map((x) => String(x["event"])));
    const dueRan = new Set<string>(); // actors a restored ending of ran in, this batch (review M4)
    for (const x of e) {
      const k = ledgerKey(x);
      switch (x["kind"]) {
        case "ending":
          bump(told, k);
          if (x["attempt"] !== undefined) ended.add(String(x["attempt"]));
          break;
        case "delivered": {
          // Stage G: to whom, as the suite observed it (see `ears`). The recipient the suite expects is total: the attempt's owner (the
          // actor whose turn made it), its current life (a dispose keeps a persisted record, and the life holding it adopts the ending: rule
          // 44, FRAG-20), and the copy recorded from what the suite drove. Or a stated reason for none, which is red where fan-out lives.
          const att = x["attempt"] ? String(x["attempt"]) : undefined;
          const op = String(x["op"]);
          const owner = att === undefined ? undefined : attemptActor.get(att);
          // A decline (no attempt) is owed the actor, and copy, whose turn declined it, as the suite placed that turn.
          const dc = att === undefined ? declineCopy.get(op) : undefined;
          const all = owner !== undefined ? refm().mappedEvents(machineOf(owner), op) : dc ? refm().mappedEvents(machineOf(dc.actor), op) : [...new Set(compiled.flatMap((c) => (c.ops as any)[op] ? refm().mappedEvents(c.id, op) : []))];
          // Stage L (review M3): the event owed is the compiled mapping of this ending (rule 13), not any event the op maps.
          const owed = att !== undefined && owner !== undefined ? eventOf(machineOf(owner), op, endingOf.get(att)) : dc ? eventOf(machineOf(dc.actor), op, declineEndingOf.get(op)) : undefined;
          const evs = owed !== undefined ? [owed] : all;
          // Stage H: the expected recipient is total (owner, its current life, the copy recorded from what the suite drove; a copy made
          // before this boot is not recorded, so actor and life only). A delivery takes the one observation of THAT recipient; a run
          // anywhere else is left over, and the conservation check below names it.
          const checked = att !== undefined && owner !== undefined && !off(owner) && refm().machine(machineOf(owner))?.ops[op] !== undefined;
          const copy = att === undefined ? undefined : attemptCopy.get(att);
          const want: Who | undefined = checked ? { actor: owner!, life: lifeOf.get(owner!) ?? 0, path: copy?.path ?? [] } : undefined;
          const fits = (o: (typeof heardNow)[number]) =>
            (dc ? o.who !== undefined && o.who.actor === dc.actor && (!dc.copy || samePath(o.who.path, dc.copy.path)) : !want || (o.who !== undefined && o.who.actor === want.actor && o.who.life === want.life && (!copy || samePath(o.who.path, want.path))));
          const ob = evs.length === 0 ? undefined : heardNow.find((o) => !o.used && evs.includes(o.ev) && fits(o));
          if (ob) ob.used = true;
          // Review M7, for a restored decline: it runs in its lane's saved order too, after the attempts saved before it on that lane.
          if (dc && ob && reloadFacts && bootDeclines.size > 0)
            for (const [lane, used] of bootDeclines) {
              const list = reloadFacts.parked.filter((p) => p.lane === lane);
              if (list[0]?.op !== op || port.disk.scope(lane) !== dc.actor) continue;
              const at = list.findIndex((p, i) => p.attempt === "" && i >= used);
              if (at < 0) continue;
              bootDeclines.set(lane, at + 1);
              const before = list.slice(0, at).filter((p) => p.attempt !== "" && told.has(`${op} ${p.attempt}`));
              if (before.length > 0) missing.push(`(j) parked endings out of their saved order: a decline of ${op} ran before ${before.map((p) => p.attempt).join(", ")} on ${lane}`);
              break;
            }
          // A decline owes its mapped event to the turn that declined it; a run of another of the op's events there is the wrong event.
          if (dc && !ob && owed !== undefined) wanted.push({ op, att: "(a decline)", evs, all, want: { actor: dc.actor, life: lifeOf.get(dc.actor) ?? 0, path: dc.copy?.path ?? [] }, copied: !!dc.copy, owed });
          if (checked) {
            if (copy === null) {
              unplaced++;
              missing.push(`(j) delivered, and the suite could not decide its copy from what it drove: ${op} ${att} of ${owner}`);
            } else if (!ob) {
              recipients.unobserved++;
              wanted.push({ op, att: att!, evs, all, want: want!, copied: copy !== undefined, owed });
              // Review H7: a delivery no run answered is red when the recipient's state handles the owed event with an alternative no
              // token guards: its guard, which carries the ear, would have run. Only a token-gated or unhandled event is A2's. Current and
              // late alike (gate-close check): a late start's chain is the one the start-node check trusts, and limit L7's live set is a
              // superset of the true one, so the split can only red loudly, never go green on a lost late ending.
              const leaf = want!.path.length === 0 ? (leafPrev.get(owner!) ?? leafOf(owner!)) : innerOf(owner!)(want!.path)?.state;
              const s = leaf === undefined || owed === undefined || refusedEvs.has(owed) ? undefined : startOf(att!, want!, leaf);
              const f = refm().machine(machineOf(owner!))?.ops[op]?.fragment;
              if (s && freeHandler(machineOf(owner!), want!.path.length === 0 ? undefined : f, s.node, owed!) !== undefined)
                missing.push(`(j) delivered, and no handler ran, though its recipient ${say(want!)} handles ${owed} from ${s.node} with no token: ${op} ${att}`);
            } else {
              recipients.observed++;
              if (!copy) recipients.noCopy++;
              // Review H6: rule 14's start node. Current (and every Restored, and an adopted lane): the walk starts at the active leaf, so
              // the first alternative tried is at the deepest node up from it that handles the event, past only token-gated ones. Late: at
              // the owner's nearest ancestor still alive since the ask, or above it.
              const s = ob.who && ob.leaf !== undefined ? startOf(att!, ob.who, ob.leaf) : undefined;
              if (s && s.node !== undefined) {
                recipients.started++;
                const ns = nodesOf(ob.machine, ob.frag);
                const ok = s.late ? chainOf(ns, s.node).includes(ob.node) : allowedStarts(ns, s.node, ob.ev).includes(ob.node);
                if (!ok) missing.push(`(j) ${op} ${att} started at ${ob.node} in ${say(ob.who!)}; rule 14 starts it ${s.late ? "late" : "current"} from ${s.node}`);
                // Rule 15: a late turn may not leave a state that owns another pending call. The suite holds those owners itself.
                if (s.late) {
                  const now = ob.who!.path.length === 0 ? leafOf(ob.who!.actor) : innerOf(ob.who!.actor)(ob.who!.path)?.state;
                  const after = now === undefined ? [] : chainOf(ns, now);
                  const before = chainOf(ns, ob.leaf!);
                  for (const [a2, o2] of ownerOf) {
                    if (!o2 || a2 === att || ended.has(a2) || o2.machine !== ob.machine || o2.frag !== ob.frag) continue;
                    const w2 = resolve(o2.serial);
                    if (w2 && w2.actor === ob.who!.actor && samePath(w2.path, ob.who!.path) && o2.live.has(o2.node) && before.includes(o2.node) && !after.includes(o2.node))
                      missing.push(`(j) a late turn of ${op} ${att} left ${o2.node}, which owns ${madeOp.get(a2)} ${a2}, still pending (rule 15)`);
                  }
                }
              }
              if (!refusedEvs.has(ob.ev)) deliveredOnce.add(att!);
              // Review M7: a lane's parked endings run in their saved order (rule 44).
              const d = due.get(att!);
              if (d) {
                dueRan.add(d.actor);
                if (d.lane !== undefined && reloadFacts) {
                  const lane = reloadFacts.parked.filter((p) => p.lane === d.lane).map((p) => p.attempt);
                  const used = bootDeclines.get(d.lane) ?? Infinity; // a decline saved before it, not yet run, is still owed first
                  const before = lane.slice(0, lane.indexOf(att!)).map((a, i) => (a === "" ? (i >= used ? "a decline" : "") : told.has(due.get(a)?.key ?? "") ? a : "")).filter((a) => a !== "");
                  if (before.length > 0) missing.push(`(j) parked endings out of their saved order: ${op} ${att} ran before ${before.join(", ")} on ${d.lane}`);
                }
              }
            }
          }
          // An observed delivery is heard by its own observation. Allowance A2, narrowed: one no guard of the suite could see (an event no
          // alternative of the state handles, or every alternative refused by a token) is heard by the batch's `turn`/`Denied`/`Unhandled`.
          if (ob || heard) bump(told, k, -1);
          else unpaid.push(k);
          break;
        }
        case "ignored": {
          // Round 14 (OD28, 2.7.18): an ignored ending is admitted with no turn. It pays its debt only where the compiled mapping, the suite's own
          // data, says `Flow.ignore` for that channel and reason; anywhere else it is an ending hidden as a reaction nobody needs.
          const v = ignoreMapped(x);
          if (v === true) bump(told, k, -1);
          else if (v === false) missing.push(`(j) ignored, and the compiled mapping is not Flow.ignore: ${x["op"]} ${x["attempt"]} (${x["channel"]} ${x["reason"]})`);
          break;
        }
        case "evidenceOnly":
          if (mayBeEvidence(x, e)) bump(told, k, -1);
          else if (process.env["FLOW_DEBUG_EO"]) console.error("EO-UNPAID", JSON.stringify(x), attemptActor.get(String(x["attempt"])), e.map((y) => y["kind"]).join(","));
          break;
        case "parked": {
          // Re-check H1'' (A3): a park is the runtime's word. It is allowed only where the reference says no live actor binds the op, or the
          // owner's life is over. A live owner whose published state binds the op is owed the ending: red, whatever a wait says.
          const att = String(x["attempt"] ?? "");
          const owner = attemptActor.get(att);
          // Rule 73, C106 (fix pass, fragstore.row): a boot keeps an unowed identity a record; what the restore queued for it waits in that
          // record. Allowed only at a boot that said so for this owner, and only while no actor of it is live; owed (and waited on) until
          // its return unparks it.
          if (x["record"] === true) {
            const rec = owner !== undefined && booting && e.some((y) => y["kind"] === "recordAtReady" && y["actor"] === owner) && leafOf(owner) === undefined;
            if (!rec && owner !== undefined && !off(owner)) missing.push(`(j) parked in a record, and no boot kept that record at ready: ${x["op"]} ${att} of ${owner}`);
            bump(told, k, -1);
            bump(parkedOwed, k);
            break;
          }
          // Stage F (M1'''): a keyed, nested or resumable copy is answered by the copy the suite recorded for the attempt, not `unknown`.
          // A decline has no attempt: its copy is the one the suite drove the declining turn in.
          const op = String(x["op"]);
          const d = due.get(att);
          // Stage K, D11; stage L (review H4): a restored ending whose owner was alive at the reload, parked because the owner was disposed
          // since or is gone: an input ran before its restored endings, which rule 44 puts first. For every op, a copy's included; only a
          // copy's own unplacement (a lost reset, rule 1) stays the binding check's below (limit L7).
          if (d && !d.over && !off(d.actor) && !runtimeDisposed && ((lifeOf.get(d.actor) ?? 0) !== (lifeAtReload.get(d.actor) ?? 0) || leafOf(d.actor) === undefined))
            missing.push(`(j) a restored ending parked, and its owner was alive at the reload: ${op} ${att} in ${d.actor}; an input ran before the restored endings (rule 44)`);
          else if (owner !== undefined && !off(owner) && !runtimeDisposed && !lifeOver(att) && !moveLetsGo(owner, op, att) && bindsCopy(owner, op, attemptCopy.get(att)) === "yes")
            missing.push(`(j) parked, and its live owner binds it (reference): ${op} ${att} in ${owner} at ${leafOf(owner)}`);
          const dc = att === "" ? declineCopy.get(op) : undefined;
          if (dc) (declineOwners.get(op) ?? declineOwners.set(op, new Set()).get(op)!).add(dc.actor);
          if (dc && dc.copy && !ledgerOff && !runtimeDisposed && !moved.has(dc.actor) && bindsCopy(dc.actor, op, dc.copy) === "yes")
            missing.push(`(j) a decline parked, and its live owner binds it (reference): ${op} in ${dc.actor} [${dc.copy.path.join(" / ")}]`);
          bump(told, k, -1);
          bump(parkedOwed, k);
          break;
        }
        case "unparked":
          if (bootOwed.has(k)) bump(bootOwed, k, -1);
          else bump(parkedOwed, k, -1);
          bump(told, k);
          break;
        case "kept":
          // A kept decline's owner: the actor the suite drove into the refused turn (this `do`), or the one its declining turn ran in.
          if ((x["attempt"] ?? "") === "") {
            const owners = declineOwners.get(String(x["op"])) ?? declineOwners.set(String(x["op"]), new Set()).get(String(x["op"]))!;
            for (const a of drivenTo.keys()) owners.add(a);
            const dk = declineCopy.get(String(x["op"]));
            if (dk) owners.add(dk.actor);
          }
          bump(parkedOwed, k, x["onLane"] ? 1 : 0);
          bump(keptOwed, k); // kept on its lane record, said on the lane or not
          deliveredOnce.delete(String(x["attempt"] ?? "")); // refused twice and kept: no run took it, so a later boot owes it again
          keptNow.push({ op: x["op"], attempt: x["attempt"] ?? "" });
          keptNames.push({ op: x["op"], attempt: x["attempt"] ?? "" });
          break;
        case "KeptLetGo":
        case "ParkedLetGo":
          // The same question for a let-go: a cause the suite sees. The owner's turn this step (a cancel, an ended fragment), a newer keep of the op, or its life over.
          if (mayLetGo(x, e)) bump(parkedOwed, k, -1);
          if (x["kind"] === "KeptLetGo") bump(keptOwed, k, -1);
          else if (process.env["FLOW_DEBUG_EO"]) console.error("LG-UNPAID", JSON.stringify(x), attemptActor.get(String(x["attempt"])), e.map((y) => y["kind"]).join(","));
          break;
        case "refused":
          bump(tryAgain, String(x["event"]));
          refusedAt.set(String(x["event"]), slotRuns.length);
          break;
        case "turn": {
          // Re-check A4' (stage F): a turn pays a refusal only as a denial does (D162): a Slot of that event's alternatives ran after the refusal.
          const ev = String(x["event"]);
          const since = refusedAt.get(ev);
          if (!tryAgain.has(ev) || since === undefined || slotRuns.slice(since).some((p) => p.includes(`on.${ev}[`))) bump(tryAgain, ev, -1);
          break;
        }
        case "Denied":
        case "Unhandled": {
          // Re-check M3'' (A4): a denial pays a refusal only if the suite saw the second try: a Slot of that event's alternatives ran after
          // the refusal (a denial runs its guards, which are the suite's wrapped Slots).
          const ev = String(x["event"]);
          const since = refusedAt.get(ev);
          if (since !== undefined && slotRuns.slice(since).some((p) => p.includes(`on.${ev}[`))) bump(tryAgain, ev, -1);
          break;
        }
        case "fence":
        case "unbound":
          // Re-check M3'': a fence no longer clears every refusal. It pays one only for a cause the suite saw: an actor's life over or gone.
          if ([...known].some((a) => leafPrev.get(a) !== undefined && leafOf(a) === undefined)) tryAgain.clear();
          break;
        case "DisposeStart":
          // D158: the ledger turns off only for a dispose the suite drove. Said with none, it is a lie that would excuse every debt.
          if (runtimeDisposed) ledgerOff = true;
          else missing.push("(j) DisposeStart, and the suite disposed no runtime");
          break;
        default:
      }
    }
    // Stage H, conservation (re-check 10g, H1⁵): every handler run the suite observed in this batch is accounted for exactly once, by an
    // expected delivery to that recipient (above) or by a send the suite itself made to it. A run left over is red: an ending that also
    // ran elsewhere, an ending that ran in the wrong recipient, or one that took a send's place. A refused turn's retry may run once more.
    for (const x of e)
      if (x["kind"] === "refused") {
        const o = heardNow.find((h) => h.used && h.ev === String(x["event"]) && h.who);
        if (o) credit(o.who!.actor, o.ev, o.who!.path);
      }
    for (const o of heardNow) {
      if (o.used) continue;
      if (o.serial === undefined) {
        recipients.ambiguous++;
        missing.push(`(j) a handler of ${o.ev} ran on a view with no suite identity (${o.machine}.${o.node})`);
        continue;
      }
      if (!o.who) {
        recipients.unplaceable++;
        missing.push(`(j) a handler of ${o.ev} ran in an incarnation no actor or copy the suite drove publishes (${o.machine}.${o.node})`);
        continue;
      }
      const c = credits.find((k) => k.n > 0 && k.ev === o.ev && k.actor === o.who!.actor && (k.path === null || samePath(k.path, o.who!.path)));
      if (c) {
        c.n--;
        recipients.bySend++;
        // Stage K, D11: a run of the suite's own send (a credit with a path; timers and follow-ups have none) in an actor whose restored
        // endings are still owed ran before them.
        // Review L6: per incarnation, as rule 54 is: a send to one copy is not "before" another copy's restored ending.
        const ahead = c.path !== null && !off(o.who.actor) ? [...due.values()].find((d) => !d.over && d.actor === o.who!.actor && samePath(d.path ?? [], o.who!.path) && told.has(d.key)) : undefined;
        if (ahead) missing.push(`(j) a driven event ran before the restored endings: ${o.ev} in ${say(o.who)}, while ${ahead.key} is owed from the boot`);
        continue;
      }
      if (off(o.who.actor) || runtimeDisposed) continue;
      recipients.leftover++;
      // Review M3: the right recipient running another of the op's events is the wrong event, said as such.
      const sameWho = (d: (typeof wanted)[number]) => d.want.actor === o.who!.actor && d.want.life === o.who!.life && (!d.copied || samePath(d.want.path, o.who!.path));
      const wrongEv = wanted.find((d) => d.owed !== undefined && d.all.includes(o.ev) && sameWho(d));
      const w = wanted.find((d) => d.evs.includes(o.ev));
      const endOf = (d: (typeof wanted)[number]) => (d.att === "(a decline)" ? declineEndingOf.get(d.op) : endingOf.get(d.att));
      if (wrongEv) missing.push(`(j) delivered as ${o.ev}, but its ending (${endOf(wrongEv)?.ch} ${endOf(wrongEv)?.reason}) maps to ${wrongEv.owed}: ${wrongEv.op} ${wrongEv.att} in ${say(o.who)}`);
      else if (w) missing.push(`(j) delivered to the wrong recipient: ${w.op} ${w.att} ran in ${say(o.who)}; the suite expects ${w.copied ? say(w.want) : `${w.want.actor} life ${w.want.life} (copy not recorded: made before this boot)`}`);
      else missing.push(`(j) a handler run nothing accounts for: ${o.ev} in ${say(o.who)}, with no send of the suite's and no ending owed there`);
    }
    // Review M4: an actor with restored endings still owed moved, by no run of them: an input or a turn stepped ahead of them (rule 44).
    if (!booting) for (const a of owedNow) if (moved.has(a) && !dueRan.has(a) && !off(a) && !runtimeDisposed) missing.push(`(j) ${a} moved before its restored endings ran: ${[...due.values()].filter((d) => d.actor === a && told.has(d.key)).map((d) => d.key).join(", ")}`);
    // Review H3, H5: alive is the suite's record. An actor it ensured and never disposed that stops publishing is red (a silent drop is no
    // excuse for its endings); one it disposed and has not ensured since that publishes again is a ghost life.
    if (!ledgerOff && !runtimeDisposed && !loadingNow())
      for (const a of new Set([...ensured, ...ghosts, ...seenLive])) {
        const now = publishedNow(a) !== undefined;
        if (ghosts.has(a) && now) missing.push(`(j) ${a} publishes again, and the suite disposed it and has not ensured it since: a ghost life`);
        if (ensured.has(a) && now) seenLive.add(a);
        if (ensured.has(a) && seenLive.has(a) && !now && !off(a) && !quarantined(a)) missing.push(`(j) ${a} stopped publishing, and the suite never disposed it`);
      }
    // Review H6: each open attempt's owner ancestry, as published at this batch's end.
    for (const [att, o] of ownerOf) {
      if (!o || ended.has(att)) continue;
      const w = resolve(o.serial);
      const leaf = !w ? undefined : w.path.length === 0 ? leafOf(w.actor) : innerOf(w.actor)(w.path)?.state;
      const chain = leaf === undefined ? [] : chainOf(nodesOf(o.machine, o.frag), leaf);
      for (const n of [...o.live]) if (!chain.includes(n)) o.live.delete(n);
    }
    for (const [a, d] of due) if (!told.has(d.key)) due.delete(a); // settled: judged from now on as any other attempt
  };
  // What the disk holds of a parked ending is owed at this boot. What was only in memory went with the process.
  const owedAtBoot = () => {
    told.clear();
    parkedOwed.clear();
    bootOwed.clear();
    tryAgain.clear();
    due.clear();
    keptOwed.clear(); // what was kept is on disk now, and owed at the boot as parked (`bootOwed`)
    keptNow = [];
    keptNames = [];
    for (const p of port.disk.parked(new Map(fake.kv))) bump(bootOwed, `${p.op} ${p.attempt}`); // D142: the runtime's codec says what is parked; review L4: on a copy
  };
  const refusal = (i: { code: string; input?: unknown }) => {
    if (i.code !== "InvalidTurn") return;
    const input = i.input as { k?: string; event?: string; redelivered?: boolean } | undefined;
    if (input?.k !== "mail" || input.event === undefined) return;
    if (!input.redelivered) return;
    bump(tryAgain, input.event, -1);
    if (keptNow.length === 0) missing.push(`(j) refused twice, and kept nowhere: ${input.event}`);
    keptNow = [];
  };
  const askedFor = (op: string, slot: any) => ({
    ...slot,
    run: (...a: unknown[]) => {
      const r = slot.run(...a);
      if (!replaying) asking.push(op);
      // Stage F: the asking copy's own `.each` key, as the suite's wrap of its input Slot sees the copy's memory view
      if (!replaying) askKeys.push({ op, key: (a[0] as any)?.memory?.key === undefined ? undefined : String((a[0] as any).memory.key) });
      return r;
    },
  });
  const judgeAsks = (e: readonly Record<string, any>[]) => {
    const asks = asking;
    askedNow = asks;
    asking = [];
    if (!e.some((x) => x["kind"] === "turn")) return; // a refused turn asked for nothing
    const left = new Map<string, number>();
    for (const op of asks) left.set(op, (left.get(op) ?? 0) + 1);
    for (const x of e) {
      const became = x["kind"] === "mint" || (x["kind"] === "invoked" && String(x["attempt"]).startsWith("read/")) || (x["kind"] === "ending" && x["attempt"] === undefined);
      if (became && left.get(x["op"])) left.set(x["op"], left.get(x["op"])! - 1);
    }
    for (const [op, n] of left) if (n > 0) missing.push(`(j) ${n} ask(s) of ${op} in a committed turn became nothing`);
  };
  const wrap = (v: any): any => {
    if (Array.isArray(v)) return v.map(wrap);
    if (v === null || typeof v !== "object") return v;
    if (typeof v.run === "function" && v.at) {
      const path: string = v.at.path;
      return {
        ...v,
        run: (...a: unknown[]) => {
          if (!replaying && !copiesChecking) slotRuns.push(path);
          slotTape?.slots.push(path);
          const n = throwIn.get(path);
          if (n) {
            if (slotTape) slotTape.threw = true;
            if (copiesChecking) return v.run(...a);
            throwIn.set(path, n - 1);
            throw new Error(`fault at ${path}`);
          }
          return v.run(...a);
        },
      };
    }
    if (Object.getPrototypeOf(v) !== Object.prototype) return v;
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => {
        if (k === "domain") return [k, x]; // opaque to the core; the module wraps nothing of it here
        if (k === "input" && (v.verb === "commit" || v.verb === "lookup")) return [k, askedFor(v.op, wrap(x))];
        // Round 11: a Slot commit too. Before, `startThrows` reached only a bare function, so DRV-02's fault never fired on a typed machine (finding F9).
        if (k === "commit" && (typeof x === "function" || (x && typeof x.run === "function"))) {
          const inner = typeof x === "function" ? (x as (i: unknown, c: unknown) => unknown) : (wrap(x).run as (i: unknown, c: unknown) => unknown);
          const guarded = (i: unknown, c: unknown) => {
            if (startThrows.has(v.id)) {
              startThrows.delete(v.id);
              throw new Error(`start fault in ${v.id}`);
            }
            return inner(i, c);
          };
          return [k, typeof x === "function" ? guarded : { ...x, run: guarded }];
        }
        return [k, wrap(x)];
      }),
    );
  };
  // D130's first trace: a fault armed in one life and spent in the next. A replay of a life starts from what was armed when it booted, or it replays a different program.
  const armedAtBoot: Array<{ throwIn: Map<string, number>; module: Map<string, number>; after: Map<string, number>; core: number }> = [];
  const boot = () => {
    armedAtBoot.push({ throwIn: new Map(throwIn), module: new Map(faults.moduleThrows), after: new Map(faults.moduleThrowsAfter), core: faults.coreThrows });
    bootSeen = false;
    saidNoBoot = false;
    anchored = reloadFacts === undefined; // a crash after a boot boots again from the same reload
    if (releases.length > 0) compiled = compileAll();
    const seen = observing(compiled);
    const onEvidence = (e: readonly Record<string, any>[]) => {
      collectSometimes();
      anchorDeferred(e);
      judgeAsks(e);
      ledger(e);
      lifetimeCheck(e);
      evidence.push(...e);
      seen?.(e);
    };
    const onIssue = (i: ReadonlyArray<{ code: string; origin?: string; input?: unknown }>) => {
      for (const x of i) {
        payByIssue(x.code);
        refusal(x);
      }
      issues.push(...i);
    };
    // Stage J (S1): judged as it happens. Until `port.boot` returns, the new runtime's own published reads (none given: nothing is
    // published, and every run there is unplaceable, red); never the killed instance's.
    const none = () => undefined;
    inst = { state: none, memory: none, inner: none } as unknown as Instance;
    const host = fake.host();
    const next = port.boot({
      host: { ...host, decode: (k: string, t: string) => {
        const v = JSON.parse(t);
        if (port.disk.kind(k) === "actor") mintIn(v);
        return v;
      } },
      compiled,
      bounds,
      faults,
      ...(services ? { services } : {}),
      reads: (r) => void (inst = { ...inst, ...r }),
      onEvidence,
      onIssue,
    });
    inst = next;
    for (const f of listeners) inst.subscribe(f);
    instances.push(inst);
  };
  let tasksPerStep: number | null = null;
  let spinning = false;
  const settle = () => {
    const firstTask = fake.tasks;
    spinning = false;
    for (;;) {
      // D146, assumptions #6: a frozen page runs nothing. No task, no microtask, no answer heard, no storage answer, until a thaw or a kill.
      if (fake.freezeTimers) return;
      if (tasksPerStep !== null && fake.tasks - firstTask >= tasksPerStep) {
        spinning = true;
        return;
      }
      // A step that never settles is a spin nobody said to expect: fail it here, rather than leave it to the watchdog.
      if (fake.tasks - firstTask > 5_000) throw new Error("settle: did not quiesce");
      if (plan && fake.scheduler.picks >= plan.at) {
        const { inject } = plan;
        plan = undefined;
        injections.done++;
        if (inst.live() > 0) injections.withLive++;
        if (fake.scheduler.q.length > 1) injections.withChoice++;
        run(inject);
      }
      if (yieldPlan && fake.hasLaters()) {
        const inject = yieldPlan;
        yieldPlan = undefined;
        for (const x of Array.isArray(inject) ? (inject as readonly Step[]) : [inject as Step]) run(x);
      }
      const had = fake.hasWork();
      fake.settleStep();
      collectSometimes();
      if (!had && !fake.hasWork() && !inst.pending()) return;
    }
    throw new Error("settle: did not quiesce");
  };
  // The oracle's exemption, from what the suite owns: an Attempt no write of which reached the disk dies with its process.
  const noteLost = () => {
    const disk = [...fake.kv.values()].join("\n");
    const gone = evidence
      .filter((e) => e["kind"] === "mint" && !disk.includes(e["attempt"]))
      .map((e) => ({ kind: "lostWithProcess", attempt: e["attempt"] }));
    evidence.push(...gone);
  };
  const arm = (f: () => void) => {
    armed.push({ segment: instances.length - 1, at: inst.logLength(), arm: f });
    f();
  };
  // D146: what needs the page's own JS cannot happen on a frozen page: a press, a hide event, an ensure. It is dropped and counted, and a case that drops one is told so at its end.
  let frozenDrops = 0;
  const PAGE_INPUT = ["ensureAs", "ensure", "hostEnsure", "detach", "subscribe", "unsubscribe", "mount", "unmount", "burst", "send", "sendMany", "dispose", "hide", "disposeRuntime", "advanceNow", "nextYield"];
  const run = (s: Step) => {
    if (fake.freezeTimers && PAGE_INPUT.some((k) => k in s)) {
      frozenDrops++;
      return;
    }
    // D154: what the suite drives, by event, for the ledger's seen causes.
    if ("burst" in s || "send" in s) drive(actorKey((s as any).burst ?? (s as any).send), (s as any).event, "", (s as any).to);
    if ("burst" in s && s.n > 1) credit(actorKey(s.burst), s.event, [], s.n - 1);
    if ("sendMany" in s) for (const [a, tag] of s.sendMany) drive(actorKey(a), tag);
    // An answer drives the events of its op's mapping to the owners of that op's open attempts, from that op (never a cause for itself).
    if ("answer" in s) for (const [, owner] of openAttempts(s.answer)) for (const ev of refm().mappedEvents(machineOf(owner), s.answer)) drive(owner, ev, s.answer);
    stepTo = undefined; // stage F: set again below for a `send`
    if ("advanceNow" in s) driveTimers();
    if ("ensure" in s) known.add(actorKey(s.ensure));
    if ("mount" in s) known.add(actorKey(s.mount));
    if ("hostEnsure" in s) known.add(actorKey(s.hostEnsure));
    if ("subscribe" in s) known.add(actorKey(s.subscribe));
    if ("ensureAs" in s) machineOfActor.set(actorKey(s.ensureAs.key), s.ensureAs.machine);
    // Stage L (review H3, H5): alive by the suite's own steps.
    const madeLive = "ensure" in s ? actorKey(s.ensure) : "mount" in s ? actorKey(s.mount) : "ensureAs" in s ? actorKey(s.ensureAs.key) : undefined;
    // Rule 73: the last use ending may end the life after the grace, once nothing is in flight, which only the runtime knows. It is no longer
    // owed to stay alive; its life is not over at the step (its work still lands in it), so it is no ghost.
    const lastUse = "detach" in s ? actorKey(s.detach) : "unsubscribe" in s ? actorKey(s.unsubscribe) : "unmount" in s ? actorKey(s.unmount) : undefined;
    if ("detach" in s && (held.get(lastUse!) ?? 0) === 0 && inst.attach) {
      issues.push({ code: "StoryInvalidCommand", origin: `detach ${lastUse}`, input: { reason: "ActorAbsent" } });
      return;
    }
    if ("detach" in s) bump(held, lastUse!, -1);
    if ("unsubscribe" in s) bump(subs, lastUse!, -1);
    if ("unmount" in s) bump(mounts, lastUse!, -1);
    if (lastUse !== undefined && usesHeld(lastUse) === 0) {
      ensured.delete(lastUse);
      seenLive.delete(lastUse);
    }
    if ("dispose" in s) {
      // Rule 73 (OD31): `disposeActor` removes the record, and a frozen copy's read endings (rule 52) live in it: their parking is owed to nobody now.
      for (const k of [...parkedOwed.keys()]) if (k.slice(k.indexOf(" ") + 1).startsWith(`read/${actorKey(s.dispose)}/`)) parkedOwed.delete(k);
      held.delete(actorKey(s.dispose)); // `disposeActor` ends the identity's uses (2.7.17)
      subs.delete(actorKey(s.dispose));
      mounts.delete(actorKey(s.dispose));
    }
    if (madeLive !== undefined) {
      ensured.add(madeLive);
      ghosts.delete(madeLive);
      ghostsPending.delete(madeLive);
    }
    if ("dispose" in s) {
      ensured.delete(actorKey(s.dispose));
      seenLive.delete(actorKey(s.dispose));
      ghostsPending.add(actorKey(s.dispose)); // a ghost once the step that disposes it has run (it may wait on a slow load)
      lifeBefore.set(actorKey(s.dispose), lifeOf.get(actorKey(s.dispose)) ?? 0);
    }
    if ("ensureAs" in s) inst.ensure(actorKey(s.ensureAs.key), s.ensureAs.machine); // D137: a key and a machine that do not agree, as a host's bug would give
    else if ("ensure" in s) use(actorKey(s.ensure), s.ensure.actor, s.input, s.identity, s.persist);
    else if ("hostEnsure" in s) inst.ensure(actorKey(s.hostEnsure), s.hostEnsure.actor, s.input);
    else if ("detach" in s || "unsubscribe" in s || "unmount" in s || "subscribe" in s || "mount" in s) {
      if (!inst.attach || !inst.detach) throw new Error("this runtime has no uses");
      if ("detach" in s) inst.detach(lastUse!, "story");
      else if ("unsubscribe" in s) inst.detach(lastUse!, "host");
      else if ("unmount" in s) inst.detach(lastUse!, "component");
      else if ("subscribe" in s) {
        bump(subs, actorKey(s.subscribe), 1);
        inst.attach(actorKey(s.subscribe), s.subscribe.actor, undefined, "host", true);
      } else if ("mount" in s) {
        bump(mounts, actorKey(s.mount), 1);
        inst.attach(actorKey(s.mount), s.mount.actor, s.input, "component");
      }
    }
    else if ("burst" in s) for (let i = 0; i < s.n; i++) inst.send(actorKey(s.burst), { tag: s.event, payload: {} });
    else if ("send" in s && ((stepTo = { actor: actorKey(s.send), event: s.event, to: s.to ?? [] }), true))
      inst.send(actorKey(s.send), {
        tag: s.event,
        payload: s.payload ?? {},
        ...(s.to ? { to: s.to } : {}),
      });
    else if ("dispose" in s) {
      lifeOf.set(actorKey(s.dispose), (lifeOf.get(actorKey(s.dispose)) ?? 0) + 1); // the suite's own: this life of the actor is over
      inst.dispose(actorKey(s.dispose));
    }
    else if ("answer" in s) fake.answer(s.answer, s.with, s.where);
    else if ("reload" in s) die(s);
    else if ("storage" in s) fake.storageStep(s.storage, s.match);
    else if ("hide" in s) {
      fake.hidden = true; // review M3: what follows while hidden does not wait
      fake.hide();
      if (!s.stay) fake.hidden = false; // a flush event, the common use here. `stay`: the page stays hidden
    } else if ("clockBack" in s) fake.clockBack(s.clockBack);
    else if ("freeze" in s) fake.freezeTimers = s.freeze;
    else if ("chargeWork" in s) fake.work += s.chargeWork;
    else if ("sendMany" in s) for (const [a, tag, payload] of s.sendMany) inst.send(actorKey(a), { tag, payload: payload ?? {} });
    else if ("tasksPerStep" in s) tasksPerStep = s.tasksPerStep;
    else if ("holdPlain" in s) fake.holdPlain = s.holdPlain;
    else if ("slowAfterAck" in s) fake.slowAfterAck = true;
    else if ("advanceNow" in s) fake.advanceWith(s.advanceNow, () => {});
    else if ("nextYield" in s) yieldPlan = s.nextYield;
    else if ("storeWide" in s) fake.storeWide = s.storeWide;
    else if ("feed" in s) {
      fake.feedStep(s.feed, s);
    } else if ("disposeRuntime" in s) {
      runtimeDisposed = true;
      inst.disposeRuntime();
    }
    else throw new Error(`raw: not a plain step: ${Object.keys(s)[0]}`);
  };
  // A kill and the next boot. `do` settles after it; a kill at a yield is already inside a settle.
  const die = (s: Extract<Step, { reload: true }>) => {
    plan = undefined;
    // D154: a reload the suite drove. What was in flight restores as an ending, which the compiled data maps to events: those count as driven.
    // The reload is the seen cause here, not the ending, so a restored ending's event may let its own op go.
    // Per owner (re-check inventory 3): only the attempts still open, each to its own actor, by its own machine's mapping.
    for (const [att, owner] of openAttempts()) for (const ev of refm().mappedEvents(machineOf(owner), madeOp.get(att)!)) drive(owner, ev, `reload:${att}`);
    // Review M6: a parked ending a run took is written away. At a kill with every write landed and no capture interval (the suite's bounds),
    // one still parked on disk is red: the next boot would deliver it again (rule 17).
    {
      const out = fake.outside();
      if ((bounds as { captureMs?: number }).captureMs === 0 && out.failing === 0 && out.storage.length === 0 && !ledgerOff)
        for (const p of port.disk.parked(new Map(fake.kv)))
          if (p.attempt && deliveredOnce.has(p.attempt) && !off(port.disk.scope(p.lane))) missing.push(`(j) delivered once, and still parked on disk at the kill with every write landed: ${p.op} ${p.attempt} (rule 17)`);
    }
    // Review M9: a torn batch excuses the actors it wrote, not the case.
    if (s.tear !== undefined) for (const k of fake.tearLast(s.tear)) offActor(k);
    if (s.wipe) {
      fake.wipe();
      for (const k of fake.mayHave()) excused.add(k);
    }
    if (TEST_FLUSH.includes("kills")) {
      fake.hide();
      settle();
    }
    // Round 7: what a kill took, for classifying. The tail of the state text is what the runtime held back.
    if (process.env["FLOW_KILL_TRACE"])
      ((globalThis as any).__kills ??= []).push(
        `kill: held back ${inst.stateText("").split("|").at(-1)}; on disk ${[...fake.kv.keys()].filter((k) => k !== "meta" && k !== "host/ready").join(",") || "nothing"}`,
      );
    noteLost();
    if (s.wipe) ledgerOff = true; // every record is gone: nothing is owed by anyone (rule 46)
    credits = []; // mail dies with the process: a send not yet run pays nothing after the kill
    lifeAtReload = new Map(lifeOf); // stage K: the lives a restored ending is owed to, as at the reload the suite drove
    // Stage L (review R6): the reload's facts, the suite's own. What is on disk now is what the next boot is given, if its load answers.
    // Who stays alive: an actor the suite ensured and did not dispose, with an actor record on disk. One with none went with the process.
    {
      const kv = new Map(fake.kv);
      const records = new Set([...kv.keys()].filter((k) => port.disk.kind(k) === "actor").map((k) => port.disk.scope(k)).filter((a): a is string => a !== undefined));
      for (const a of [...ensured]) if (!records.has(a)) ensured.delete(a);
      // An actor the suite disposed once and ensured again may have only its retired record on disk (the new life never captured, D80):
      // then the codec reads no live leaf, and it is not restored. Never disposed, no answer stays red (the anchor's check).
      for (const a of [...ensured]) if (lifeBefore.has(a) && port.disk.leaves(new Map(kv), a) === undefined) ensured.delete(a);
      // A dispose the kill undid (its retired record never reached the disk, D80): the bytes hold the actor live, so it is alive again, in
      // the life the dispose would have ended. Read by the codec from the suite's bytes, and only to owe more.
      for (const a of [...ghosts, ...ghostsPending])
        if (records.has(a) && port.disk.leaves(new Map(kv), a) !== undefined) {
          ghosts.delete(a);
          ghostsPending.delete(a);
          // Rule 73 (OD31): the record is back, but nothing uses it, so at ready it stays a record and owes nothing alive.
          if (!inst.attach) ensured.add(a);
          if (lifeBefore.has(a)) lifeOf.set(a, lifeBefore.get(a)!);
        }
      lifeAtReload = new Map(lifeOf);
      seenLive.clear();
      reloadFacts = { kv, heads: port.disk.heads(new Map(kv)), parked: port.disk.parked(new Map(kv)), alive: new Set(ensured), answered: fake.loadAnswered };
      anchored = false;
    }
    owedAtBoot();
    fake.killProcess();
    fake.freezeTimers = false; // D146: a discard of a frozen tab, and the next life is a new page
    if (s.load) fake.loadMode = s.load;
    boot();
    reattach();
    if (s.crashAfterBoot) {
      owedAtBoot();
      fake.killProcess();
      boot();
      reattach();
    }
  };
  // Stage L (review M1, M2, H5): at the end of each step the suite drove. A disposed actor is a ghost once the step that disposed it ran;
  // a boot given its records is anchored by now at the latest; and a load the suite answered with no `boot` evidence is red.
  let saidNoBoot = false;
  const afterStep = () => {
    if (loadingNow()) return;
    bootDeclines.clear(); // the restored declines ran in the step that booted, or not at all
    for (const a of ghostsPending) ghosts.add(a);
    ghostsPending.clear();
    if (!reloadFacts || !given() || ledgerOff) return;
    anchorOnce();
    for (const a of deferredAnchor) notRestored.add(a);
    deferredAnchor.clear();
    for (const a of notRestored) if (!quarantined(a) && !off(a)) missing.push(`(j) not restored: ${a} has a record on disk, and the suite never disposed it`);
    notRestored.clear();
    if (!bootSeen && !saidNoBoot) {
      saidNoBoot = true;
      missing.push("(j) the load was answered, and the runtime said no boot: nothing it restored is checked");
    }
  };
  // D130's trace: a case that changes the program itself, a release that fixes a closure, across lives. Said as a step, so S11 replays each life under the program it ran.
  const releases: Array<{ segment: number; at: number; now: () => void; before: () => void; fired?: boolean }> = [];
  const excused = new Set<string>(); // D112: what a wipe or an edited record took. Nothing else may leave a key undecided with no head on disk
  const reads: Harness["read"] = {
    missingEndings: () => {
      const out = [...missing];
      if (ledgerOff) return out;
      const q = inst.waits() as ReadonlyArray<Record<string, any>>;
      for (const { op, attempt } of keptNames)
        if (!q.some((w) => (w["kind"] === "parked" || w["kind"] === "held" || w["kind"] === "stranded") && w["op"] === op && (w["kind"] === "stranded" || w["firing"] || (w["attempt"] ?? "") === attempt)))
          out.push(`(j) kept, and no wait names it: ${op} ${attempt}`);
      keptNames = [];
      // Review M9: an obligation of an actor whose bytes the case edited or tore is excused; the others' are not.
      const offKey = (k: string) => off(attemptActor.get(k.slice(k.indexOf(" ") + 1)));
      for (const k of told.keys()) if (!offKey(k)) out.push(`(j) an ending reached nobody: ${k}`);
      for (const k of bootOwed.keys()) if (!offKey(k)) out.push(`(j) parked on disk, and not heard at the boot: ${k}`);
      for (const k of tryAgain.keys()) out.push(`(j) refused once, and not tried again: ${k}`);
      const parkedWaits = new Map<string, number>();
      for (const w of q) if (w["kind"] === "parked" && !w["firing"]) bump(parkedWaits, `${w["op"]} ${w["attempt"] ?? ""}`);
      for (const [k, n] of parkedOwed) if ((parkedWaits.get(k) ?? 0) < n && !offKey(k)) out.push(`(j) parked, and no wait says so: ${k}`);
      // Review M6 (rule 17): with every write landed and no capture interval, what is parked on disk is exactly what the ledger still owes
      // as parked (or restored and not yet heard). One more on disk is an ending delivered or let go that the next boot would bring back.
      const o = fake.outside();
      if ((bounds as { captureMs?: number }).captureMs === 0 && o.failing === 0 && o.storage.length === 0 && !loadingNow() && !runtimeDisposed) {
        const onDisk = new Map<string, number>();
        for (const p of port.disk.parked(new Map(fake.kv))) if (!off(port.disk.scope(p.lane))) bump(onDisk, `${p.op} ${p.attempt}`);
        for (const [k, n] of onDisk) if (n > (parkedOwed.get(k) ?? 0) + (bootOwed.get(k) ?? 0) + (told.get(k) ?? 0) + (keptOwed.get(k) ?? 0)) out.push(`(j) parked on disk, and nothing owes it: ${k} (rule 17)`);
      }
      return out;
    },
    writeAheadLies: () => {
      const undecided = fake.mayHave();
      if (undecided.length === 0) return [];
      const heads = new Set(port.disk.heads(new Map(fake.kv))); // D142; review L4: on a copy
      const writes = new Set(compiled.filter((c) => c.persisted).flatMap((c) => Object.values(c.ops).filter((o) => o.kind === "write").map((o) => o.id)));
      const released = new Set(evidence.filter((e) => e["kind"] === "Released" && (lettingGo.has(String(e["attempt"])) || releasedBySelf.has(String(e["attempt"])))).map((e) => e["attempt"])); // D158: a release the ledger saw a cause for
      return undecided.filter((key) => {
        const q = fake.requests.find((r) => r.idempotencyKey === key)!;
        return writes.has(q.op) && !heads.has(key) && !released.has(key) && !excused.has(key) && !key.startsWith("business:");
      });
    },
    state: (a) => inst.state(actorKey(a)),
    memory: (a) => inst.memory(actorKey(a)),
    inner: (a, p) => inst.inner(actorKey(a), p),
    row: (a, op, key) => inst.row(actorKey(a), op, key ?? {}),
    record: (ref) => inst.record(ref),
    module: (id, ref) => inst.module(id, ref),
    peakDeliveriesInMail: () => Math.max(0, ...instances.map((i) => i.peakDeliveriesInMail())),
    snapshot: (a) => inst.snapshot?.(actorKey(a)),
    inspect: (a) => inst.inspect?.(actorKey(a)),
    lifetimeViolations: () => [...violations],
    requests: () => fake.publicRequests(),
    truth: () => fake.truth(),
    frames: () => instances.flatMap((i) => i.frames()),
    issues: () => {
      if (TEST_FLUSH.includes("probes")) fake.hide();
      return issues;
    },
    evidence: (kind) => (kind ? evidence.filter((e) => e["kind"] === kind) : evidence),
    stored: () => {
      if (TEST_FLUSH.includes("reads")) fake.hide();
      settle();
      return new Map([...fake.kv].map(([k, v]) => [k, port.disk.decode(k, v)])); // D142: a value, by the runtime's codec. Its keys are still the runtime's: a case that names one pins the format, and says so by naming it
    },
    diskKeys: () => [...fake.kv.keys()], // D134: what is on disk now, with no settle
    diskKind: (k) => port.disk.kind(k),
    appliedTwice: () => [...fake.applications].filter(([, n]) => n > 1).map(([k]) => k), // D145
    bodyMismatches: () => fake.bodyMismatches,
    frozenDrops: () => frozenDrops,
    diskScope: (k) => port.disk.scope(k),
    actorKey: (a) => actorKey(a),
    releaseSeen: (attempt) => lettingGo.has(attempt) || releasedBySelf.has(attempt),
    quiet: () => ({
      idle: !inst.pending() && !fake.hasWork(),
      fatal: inst.fatal(),
      waits: inst.waits(),
      ...(spinning ? { spinning: true } : {}),
      ...(fake.freezeTimers ? { frozen: true } : {}), // D146: nothing settled to claim until a thaw
      ...(loadingNow() ? { loading: true } : {}), // stage L (review M2): a load the suite has not answered
    }),
    tasks: () => fake.tasks,
    now: () => fake.now,
    outside: () => {
      if (TEST_FLUSH.includes("probes")) fake.hide();
      return { ...fake.outside(), live: inst.live(), injections };
    },
    stateHash: () => inst.stateText(fake.stateText()),
    // S11: pure re-execution of each boot's input log, with its logged draws, against what was published.
    replay: () => {
      replaying = true;
      const liveThrow = new Map(throwIn);
      const liveModule = new Map(faults.moduleThrows);
      const liveCore = faults.coreThrows;
      throwIn.clear();
      faults.moduleThrows.clear();
      const liveAfter = new Map(faults.moduleThrowsAfter);
      faults.moduleThrowsAfter.clear();
      faults.coreThrows = 0;
      for (const x of [...releases].reverse()) {
        x.before();
        x.fired = false;
      }
      const fireReleases = (si: number, i: number) => {
        for (const x of releases)
          if (!x.fired && (x.segment < si || (x.segment === si && x.at <= i))) {
            x.fired = true;
            x.now();
          }
      };
      let result: { same: boolean; firstDiff?: unknown } = { same: true };
      for (let si = 0; si < instances.length; si++) {
        const at = armedAtBoot[si]!;
        throwIn.clear();
        for (const [k, v] of at.throwIn) throwIn.set(k, v);
        faults.moduleThrows.clear();
        for (const [k, v] of at.module) faults.moduleThrows.set(k, v);
        faults.moduleThrowsAfter.clear();
        for (const [k, v] of at.after) faults.moduleThrowsAfter.set(k, v);
        faults.coreThrows = at.core;
        const r = instances[si]!.replay((i) => {
          fake.markCall();
          collectSometimes();
          fireReleases(si, i);
          for (const a of armed) if (a.segment === si && a.at === i) a.arm();
        });
        if (!r.same) {
          result = { same: false, firstDiff: { segment: si, ...(r.firstDiff as object) } };
          break;
        }
      }
      throwIn.clear();
      for (const [k, v] of liveThrow) throwIn.set(k, v);
      faults.moduleThrows.clear();
      for (const [k, v] of liveModule) faults.moduleThrows.set(k, v);
      faults.moduleThrowsAfter.clear();
      for (const [k, v] of liveAfter) faults.moduleThrowsAfter.set(k, v);
      faults.coreThrows = liveCore;
      for (const x of releases) x.now();
      replaying = false;
      return result;
    },
  };
  let depth = 0;
  const call =
    <A extends unknown[], R>(f: (...a: A) => R) =>
    (...a: A): R => {
      if (depth++ === 0) fake?.markCall();
      try {
        return f(...a);
      } finally {
        depth--;
        if (WORK_PEAK && depth === 0 && fake) workPeak.max = Math.max(workPeak.max, fake.spentInCall());
      }
    };
  const stored = reads.stored;
  reads.stored = call(stored);
  reads.replay = call(reads.replay);
  const h: Harness = {
    start(cfg) {
      fake = new FakeWorld(cfg.seed, cfg.machines.find((m) => m.server)?.server);
      fake.spendLimit = WORK_PER_CALL;
      // Round 7: the older cases were written with plain writes landing at once. D80's 5 s is the runtime's default; a case that means it says so.
      // `runtimeDefault`: a case that reads the runtime's own default says so, and is given no bound at all.
      const { runtimeDefault, ...named } = (cfg.bounds ?? {}) as Record<string, number>;
      // The second pass (gate5s.ts): no bound named means the runtime's own default.
      bounds = runtimeDefault || process.env["FLOW_RUNTIME_DEFAULT"] ? named : { captureMs: 0, ...named };
      // D207: a hand fixture's bare closures are slotted here, by the suite, since the Runtime's seal takes only Slots. Typed output passes unchanged.
      compileAll = () => cfg.machines.map((m) => listen(wrap(legacySlots((swaps.get(m) ?? m).make(fake.api)))));
      compiled = compileAll();
      // D211: the machines' services, merged, for the Runtime's boot. Built once per start, from this world's fake.
      const given = cfg.machines.map((m) => (swaps.get(m) ?? m).services?.(fake.api)).filter((x): x is Context.Context<never> => x !== undefined);
      services = given.length ? given.reduce((a, b) => Context.merge(a, b)) : undefined;
      // Review L5: rule 47, no schedule sends an event an op maps; so a timer's credit can never pay an ending's run (limit L8 is vacuous).
      for (const c of compiled) {
        const sched = new Set(refm().scheduleEvents(c.id));
        const both = [...new Set(Object.keys(c.ops).flatMap((op) => refm().mappedEvents(c.id, op)))].filter((ev) => sched.has(ev));
        if (both.length > 0) missing.push(`(j) a schedule of ${c.id} sends ${both.join(", ")}, which an op maps (rule 47)`);
      }
      boot();
    },
    raw: run,
    release(now, before) {
      releases.push({ segment: instances.length - 1, at: inst.logLength(), now, before });
      now();
    },
    subscribe(f) {
      listeners.push(f);
      inst.subscribe(f);
    },
    send(a, event, payload) {
      drive(actorKey(a), event);
      inst.send(actorKey(a), { tag: event, payload: payload ?? {} });
    },
    do(s) {
      drivenTo.clear();
      drivenPath.clear();
      if ("advance" in s) driveTimers();
      if ("advance" in s) {
        settle();
        fake.advanceWith(s.advance, settle);
        afterStep();
        livenessCheck();
        return;
      }
      if ("reload" in s) {
        die(s);
        settle();
        afterStep();
        return;
      }
      if ("fault" in s) {
        const f = s.fault;
        if ("throwIn" in f) arm(() => void throwIn.set(f.throwIn, f.times ?? 1));
        else if ("throwInModule" in f) arm(() => void faults.moduleThrows.set(f.throwInModule, 1));
        else if ("throwInModuleAfter" in f)
          arm(() => void faults.moduleThrowsAfter.set(f.throwInModuleAfter, 1));
        else if ("throwInCore" in f) arm(() => void (faults.coreThrows = 1));
        else if ("throwInCoreAfter" in f) {
          const at = inst.logLength() + f.throwInCoreAfter;
          const go = () => void (faults.coreThrows = 1);
          armed.push({ segment: instances.length - 1, at, arm: go });
          faults.onLogged = (n) => {
            if (n === at) go();
          };
        }
        else if ("startThrows" in f) startThrows.add(f.startThrows);
        else if ("afterYield" in f) yieldPlan = f.afterYield;
        else if ("mutateServer" in f) fake.serverState = f.mutateServer(fake.serverState);
        else if ("socketClose" in f) fake.closeMs = f.socketClose;
        else if ("lateCancel" in f) fake.lateCancels = f.lateCancel;
        else if ("storageFails" in f || "storageFailsLate" in f || "storageFailsHeld" in f) {
          if (TEST_FLUSH.includes("faults")) fake.hide();
          if ("storageFails" in f) fake.plainFails = f.storageFails;
          else if ("storageFailsLate" in f) fake.plainFailsLate = f.storageFailsLate;
          else fake.plainFailsHeld = f.storageFailsHeld;
        }
        else if ("corruptStored" in f) {
          if (TEST_FLUSH.includes("faults")) fake.hide();
          // A record edited on disk may be quarantined, and an Attempt in it with it: rule 46, named by an issue.
          const hit = [...fake.kv]
            .filter(([k]) => k.includes(f.corruptStored.match))
            .map(([, v]) => v);
          // Re-check M4', D158: a corruption that edits nothing tests nothing, and would still turn (j) off for the case. Red.
          if (hit.length === 0) throw new Error(`corruptStored: "${f.corruptStored.match}" matches no stored key`);
          const inHit = evidence
            .filter((e) => e["kind"] === "mint" && hit.some((v) => v.includes(e["attempt"])))
            .map((e) => ({ kind: "lostWithProcess", attempt: e["attempt"] }));
          evidence.push(...inHit);
          // A record edited on disk may be quarantined, and what it owed with it (rule 46). Review M9: that actor's, not the case's.
          for (const k of [...fake.kv.keys()].filter((k) => k.includes(f.corruptStored.match))) offActor(k);
          fake.corrupt(f.corruptStored.match, f.corruptStored.edit);
          for (const k of fake.mayHave()) excused.add(k);
        } else if ("uninterruptibleHang" in f) fake.uninterruptible.add(f.uninterruptibleHang);
        else if ("syncAnswer" in f) fake.syncAnswers.set(f.syncAnswer[0], f.syncAnswer[1]);
        else if ("microAnswer" in f) {
          const a = f.microAnswer[1];
          fake.microAnswers.set(f.microAnswer[0], typeof a === "function" ? a : () => a);
        }
        else if ("lateAnswer" in f) fake.lateAnswer(f.lateAnswer[0], f.lateAnswer[1]);
        else if ("landLate" in f) fake.landLate(f.landLate);
        else if ("forgetKeys" in f) fake.forgetKeys();
        else if ("duplicateCompletion" in f) dup = f.duplicateCompletion;
        else if ("schedulerShuffle" in f) {
          fake.scheduler.shuffle = f.schedulerShuffle;
          fake.scheduler.yieldEvery = 3;
          fake.yields = 1;
          if (f.inject) {
            injections.planned++;
            plan = { at: fake.scheduler.picks + (f.atTick ?? 0), inject: f.inject };
          }
        } else throw new Error(`fault not built: ${Object.keys(f)[0]}`);
        settle();
        afterStep();
        return;
      }
      run(s);
      settle();
      // At-least-once delivery: the driver's own port receives the same completion again.
      if (dup && "answer" in s && s.answer === dup) {
        dup = undefined;
        inst.repeatLastCompletion();
        settle();
      }
      afterStep();
    },
    read: reads,
  };
  return { ...h, start: call(h.start), raw: call(h.raw), release: call(h.release), subscribe: call(h.subscribe), send: call(h.send), do: call(h.do) };
};
// Round 7: classifying what fails at D80's interval. A flush, through the host's own hide, before a disk read, or before a kill. Off in a normal run.
const TEST_FLUSH = process.env["FLOW_TEST_FLUSH"] ?? "";
// Round 7: the same scenario on another way of building the same machine (`main.ts --swap`). By identity, so nothing else with its id is touched.
// Round 13: an optional observer of each boot, for the graph gate (`graph-gate.ts`): what was booted, then every evidence batch of that boot. Unset in every
// other run, so no case's output depends on it.
export type BootObserver = (compiled: readonly Compiled[]) => (e: readonly Record<string, any>[]) => void;
let observer: BootObserver | undefined;
export const observeBoots = (o: BootObserver | undefined) => void (observer = o);
const observing = (compiled: readonly Compiled[]) => observer?.(compiled);
const swaps = new Map<Fixture_, Fixture_>();
export const swapFixtures =(m: ReadonlyMap<Fixture_, Fixture_>) => {
  for (const [a, b] of m) swaps.set(a, b);
};
export { NoHeldRequest };
