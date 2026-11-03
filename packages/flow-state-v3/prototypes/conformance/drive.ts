// Turns a runtime's `Port` into a Harness. Settling, faults, plans and the fake live here, so a rewrite replaces only the
// port. Faults reach a runtime through what production has: compiled data (Slots), a Host, and its own input port.
import type { Fixture as Fixture_ } from "./harness.ts";
import type { Compiled } from "./fixtures/compiled.ts";
import { FakeWorld, NoHeldRequest } from "./fake-world.ts";
import { canonText } from "./output.ts";
import { machineOfKey, Reference } from "./reference/model.ts";
import type { FaultState, Harness, Instance, Port, Step } from "./harness.ts";

// Stage G: how each delivery's recipient was settled, over the whole run (printed by `main.ts`). `unobserved` is allowance A2's remainder.
// Stage H: `ambiguous` (a view with no suite identity, or one no incarnation publishes) must be 0; `bySend` are runs paid by the suite's own sends.
export const recipients = { observed: 0, ambiguous: 0, unobserved: 0, unplaceable: 0, noCopy: 0, atBoot: 0, bySend: 0, leftover: 0 };
// Stage H: the suite's identity of an incarnation. Minted once per memory the compiled data makes; never in any published text.
const WHO = Symbol("flow-suite incarnation");
let serials = 0;
const tag = (m: any) => (m !== null && typeof m === "object" && !Array.isArray(m) && Object.getPrototypeOf(m) === Object.prototype ? { ...m, [WHO]: ++serials } : m);
export const rowKey =(op: string, key: unknown) => `${op}|${JSON.stringify(key)}`;
// D137: the id is escaped, so `M` + `x/y` and `M/x` + `y` are two actors. The last `/` always ends the machine.
// `|` too: a lane's id starts with its actor's key and a `|`, so an id holding one would name another actor's lane.
const actorKey = (a: { actor: string; id: string }) => `${a.actor}/${a.id.replaceAll("%", "%25").replaceAll("/", "%2F").replaceAll("|", "%7C")}`;

export const makeHarness = (port: Port) => (): Harness => {
  let fake: FakeWorld;
  let compiled: Compiled[] = [];
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
  const tryAgain = new Map<string, number>();
  const refusedAt = new Map<string, number>(); // event -> how many Slot runs the suite had seen when it was refused
  const slotRuns: string[] = []; // every wrapped Slot's path, in the order the suite saw it run (not in replay)
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
  const copiesOf = (actor: string, op: string) => {
    const m = refm().machine(machineOf(actor));
    const f = m?.ops[op]?.fragment;
    if (!m || f === undefined) return [];
    return refm().copies(m.id, f, leafOf(actor), memoryOf(actor), (p) => {
      try {
        return inst.inner(actor, p);
      } catch {
        return undefined;
      }
    });
  };
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
    const c = copiesOf(actor, op).find((x) => samePath(x.path, copy.path));
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
  type Ear = { ev: string; machine: string; node: string; frag: string | undefined; serial: number | undefined; who: Who | undefined; boot: boolean };
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
  const scanIds = () => {
    for (const actor of new Set([...known, ...attemptActor.values()])) {
      const mem = memoryOf(actor);
      if (mem === undefined) continue;
      if (typeof mem[WHO] === "number") whereOf.set(mem[WHO], { actor, path: [] });
      const m = refm().machine(machineOf(actor));
      const leaf = leafOf(actor);
      for (const f of Object.keys(m?.fragments ?? {}))
        for (const c of refm().copies(m!.id, f, leaf, mem, innerOf(actor))) {
          const s = innerOf(actor)(c.path)?.memory?.[WHO];
          if (typeof s === "number") whereOf.set(s, { actor, path: c.path });
        }
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
  // A boot delivers restored endings before `port.boot` returns, so the new instance cannot be read yet: a boot's views are counted, not placed.
  let booting = false;
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
    const ear = (ev: string, at: any, node: string, frag: string | undefined) => ({
      at: { definition: at?.definition ?? c.id, path: `${at?.path ?? ""}#heard` },
      run: (g: any) => {
        if (replaying || g === null || typeof g !== "object" || seenViews.has(g)) return true;
        seenViews.add(g); // one walk, one view: the alternatives after the first see the same object
        const serial = typeof g.memory?.[WHO] === "number" ? (g.memory[WHO] as number) : undefined;
        const who = booting || serial === undefined ? undefined : resolve(serial);
        if (who && !inState(c, frag, node, who)) missing.push(`(j) a handler of ${ev} ran at ${frag ?? c.id}.${node}, a state its recipient ${say(who)} does not publish`);
        ears.push({ ev, machine: c.id, node, frag, serial, who, boot: booting });
        return true;
      },
    });
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
      Object.fromEntries(Object.entries(ns ?? {}).map(([id, n]) => [id, n.on ? { ...n, on: Object.fromEntries(Object.entries(n.on).map(([ev, alts]) => [ev, (alts as any[]).map((alt) => ({ ...alt, ...follow(alt), ...(evs.has(ev) ? { guards: [ear(ev, alt.at, id, frag), ...(alt.guards ?? [])] } : {}) }))])) } : n]));
    const tagged = (mem: any, where: string) => ({
      ...mem,
      initial: { ...mem.initial, run: (i: unknown) => tag(mem.initial.run(i)) },
      restore: mem.restore ? { ...mem.restore, run: (s: unknown) => tag(mem.restore.run(s)) } : { at: { definition: where, path: "memory#restore" }, run: (s: unknown) => tag(s) },
    });
    return {
      ...c,
      memory: tagged(c.memory, c.id),
      nodes: nodes(c.nodes),
      ...(c.fragments ? { fragments: Object.fromEntries(Object.entries(c.fragments).map(([id, f]: [string, any]) => [id, { ...f, memory: tagged(f.memory, id), nodes: nodes(f.nodes, id) }])) } : {}),
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
  const lifeOver = (att: string) => {
    const actor = attemptActor.get(att);
    if (actor === undefined) return undefined;
    if (attemptLife.get(att) !== (lifeOf.get(actor) ?? 0)) return true; // the life that asked is over; a new one is owed nothing (rule 44)
    return publishedNow(actor) === undefined;
  };
  // A release of `att`'s lane, said by the runtime, has a cause the suite saw. No attempt named: no actor known, no pay (re-check H1': no wildcard).
  // `self`: a release of the attempt whose own restored ending, after a reload the suite drove, maps to a cancel. It pays the release (h) reads,
  // never that attempt's ending as evidence: a delivered restored ending is paid by its delivery.
  const releaseSeen = (op: string, att: string | undefined, self = false) => {
    if (att === undefined) return false;
    const actor = attemptActor.get(att);
    if (actor === undefined) return false;
    return lifeOver(att) === true || moveLetsGo(actor, op, att) || cancelSeen(actor, op, self ? undefined : att, att);
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
  const ledger = (e: readonly Record<string, any>[]) => {
    unpaid = [];
    // Stage H: a view made in this batch is published only now; place what the ear could not.
    const heardNow = ears.map((o) => ({ ...o, who: o.who ?? (o.boot || o.serial === undefined ? undefined : resolve(o.serial)), used: false }));
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
      }
      if (x["kind"] === "ending" && x["attempt"] === undefined) declines.push({ op: String(x["op"]), cause });
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
    const wanted: Array<{ op: string; att: string; evs: readonly string[]; want: Who; copied: boolean }> = []; // expected deliveries no run of their recipient answered
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
          const evs = owner !== undefined ? refm().mappedEvents(machineOf(owner), op) : dc ? refm().mappedEvents(machineOf(dc.actor), op) : [...new Set(compiled.flatMap((c) => (c.ops as any)[op] ? refm().mappedEvents(c.id, op) : []))];
          // Stage H: the expected recipient is total (owner, its current life, the copy recorded from what the suite drove; a copy made
          // before this boot is not recorded, so actor and life only). A delivery takes the one observation of THAT recipient; a run
          // anywhere else is left over, and the conservation check below names it.
          const checked = att !== undefined && owner !== undefined && !ledgerOff && refm().machine(machineOf(owner))?.ops[op] !== undefined;
          const copy = att === undefined ? undefined : attemptCopy.get(att);
          const want: Who | undefined = checked ? { actor: owner!, life: lifeOf.get(owner!) ?? 0, path: copy?.path ?? [] } : undefined;
          const fits = (o: (typeof heardNow)[number]) =>
            o.boot ||
            (dc ? o.who !== undefined && o.who.actor === dc.actor && (!dc.copy || samePath(o.who.path, dc.copy.path)) : !want || (o.who !== undefined && o.who.actor === want.actor && o.who.life === want.life && (!copy || samePath(o.who.path, want.path))));
          const ob = evs.length === 0 ? undefined : heardNow.find((o) => !o.used && evs.includes(o.ev) && fits(o));
          if (ob) ob.used = true;
          if (checked) {
            if (copy === null) {
              unplaced++;
              missing.push(`(j) delivered, and the suite could not decide its copy from what it drove: ${op} ${att} of ${owner}`);
            } else if (!ob) {
              recipients.unobserved++;
              wanted.push({ op, att: att!, evs, want: want!, copied: copy !== undefined });
            } else if (ob.boot) recipients.atBoot++; // stated: the booting runtime is not readable; the count is still conserved below
            else {
              recipients.observed++;
              if (!copy) recipients.noCopy++;
            }
          }
          // An observed delivery is heard by its own observation. Allowance A2, narrowed: one no guard of the suite could see (an event no
          // alternative of the state handles, or every alternative refused by a token) is heard by the batch's `turn`/`Denied`/`Unhandled`.
          if (ob || heard) bump(told, k, -1);
          else unpaid.push(k);
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
          // Stage F (M1'''): a keyed, nested or resumable copy is answered by the copy the suite recorded for the attempt, not `unknown`.
          // A decline has no attempt: its copy is the one the suite drove the declining turn in.
          const op = String(x["op"]);
          if (owner !== undefined && !ledgerOff && !runtimeDisposed && !lifeOver(att) && !moveLetsGo(owner, op, att) && bindsCopy(owner, op, attemptCopy.get(att)) === "yes")
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
          keptNow.push({ op: x["op"], attempt: x["attempt"] ?? "" });
          keptNames.push({ op: x["op"], attempt: x["attempt"] ?? "" });
          break;
        case "KeptLetGo":
        case "ParkedLetGo":
          // The same question for a let-go: a cause the suite sees. The owner's turn this step (a cancel, an ended fragment), a newer keep of the op, or its life over.
          if (mayLetGo(x, e)) bump(parkedOwed, k, -1);
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
        const o = heardNow.find((h) => h.used && h.ev === String(x["event"]) && (h.who || h.boot));
        if (o) credit(o.who?.actor ?? "", o.ev, o.who?.path ?? null); // "": a booting view's retry, counted by event only
      }
    for (const o of heardNow) {
      if (o.used) continue;
      if (!o.boot && o.serial === undefined) {
        recipients.ambiguous++;
        missing.push(`(j) a handler of ${o.ev} ran on a view with no suite identity (${o.machine}.${o.node})`);
        continue;
      }
      if (!o.boot && !o.who) {
        recipients.unplaceable++;
        missing.push(`(j) a handler of ${o.ev} ran in an incarnation no actor or copy the suite drove publishes (${o.machine}.${o.node})`);
        continue;
      }
      const c = credits.find((k) => k.n > 0 && k.ev === o.ev && (o.boot || (k.actor === o.who!.actor && (k.path === null || samePath(k.path, o.who!.path)))));
      if (c) {
        c.n--;
        recipients.bySend++;
        continue;
      }
      if (ledgerOff || runtimeDisposed) continue;
      recipients.leftover++;
      const w = wanted.find((d) => d.evs.includes(o.ev));
      if (w) missing.push(`(j) delivered to the wrong recipient: ${w.op} ${w.att} ran in ${o.who ? say(o.who) : "a booting view"}; the suite expects ${w.copied ? say(w.want) : `${w.want.actor} life ${w.want.life} (copy not recorded: made before this boot)`}`);
      else missing.push(`(j) a handler run nothing accounts for: ${o.ev} in ${o.who ? say(o.who) : "a booting view"}, with no send of the suite's and no ending owed there`);
    }
  };
  // What the disk holds of a parked ending is owed at this boot. What was only in memory went with the process.
  const owedAtBoot = () => {
    told.clear();
    parkedOwed.clear();
    bootOwed.clear();
    tryAgain.clear();
    keptNow = [];
    keptNames = [];
    for (const p of port.disk.parked(fake.kv)) bump(bootOwed, `${p.op} ${p.attempt}`); // D142: the runtime's codec says what is parked
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
          if (!replaying) slotRuns.push(path);
          const n = throwIn.get(path);
          if (n) {
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
        if (k === "commit" && typeof x === "function")
          return [
            k,
            (i: unknown, c: unknown) => {
              if (startThrows.has(v.id)) {
                startThrows.delete(v.id);
                throw new Error(`start fault in ${v.id}`);
              }
              return (x as (i: unknown, c: unknown) => unknown)(i, c);
            },
          ];
        return [k, wrap(x)];
      }),
    );
  };
  // D130's first trace: a fault armed in one life and spent in the next. A replay of a life starts from what was armed when it booted, or it replays a different program.
  const armedAtBoot: Array<{ throwIn: Map<string, number>; module: Map<string, number>; after: Map<string, number>; core: number }> = [];
  const boot = () => {
    armedAtBoot.push({ throwIn: new Map(throwIn), module: new Map(faults.moduleThrows), after: new Map(faults.moduleThrowsAfter), core: faults.coreThrows });
    booting = instances.length > 0; // the first boot restores nothing
    inst = port.boot({
      host: fake.host(),
      compiled,
      bounds,
      faults,
      onEvidence: (e) => {
        judgeAsks(e);
        ledger(e);
        evidence.push(...e);
      },
      onIssue: (i) => {
        for (const x of i) {
          payByIssue(x.code);
          refusal(x);
        }
        issues.push(...i);
      },
    });
    booting = false;
    for (const f of listeners) inst.subscribe(f);
    instances.push(inst);
  };
  let tasksPerStep: number | null = null;
  let spinning = false;
  const settle = () => {
    const firstTask = fake.tasks;
    const t0 = Date.now();
    spinning = false;
    for (let guard = 0; ; guard++) {
      // D146, assumptions #6: a frozen page runs nothing. No task, no microtask, no answer heard, no storage answer, until a thaw or a kill.
      if (fake.freezeTimers) return;
      if (tasksPerStep !== null && fake.tasks - firstTask >= tasksPerStep) {
        spinning = true;
        return;
      }
      // A step that never settles is a spin nobody said to expect: fail it here, rather than leave it to the watchdog.
      if (fake.tasks - firstTask > 5_000 || (guard % 4096 === 4095 && Date.now() - t0 > 20_000)) throw new Error("settle: did not quiesce");
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
  const PAGE_INPUT = ["ensureAs", "ensure", "burst", "send", "sendMany", "dispose", "hide", "disposeRuntime", "advanceNow", "nextYield"];
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
    if ("ensureAs" in s) machineOfActor.set(actorKey(s.ensureAs.key), s.ensureAs.machine);
    if ("ensureAs" in s) inst.ensure(actorKey(s.ensureAs.key), s.ensureAs.machine); // D137: a key and a machine that do not agree, as a host's bug would give
    else if ("ensure" in s) inst.ensure(actorKey(s.ensure), s.ensure.actor, s.input);
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
    if (s.tear !== undefined) fake.tearLast(s.tear);
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
    if (s.wipe || s.tear !== undefined) ledgerOff = true;
    credits = []; // mail dies with the process: a send not yet run pays nothing after the kill
    owedAtBoot();
    fake.killProcess();
    fake.freezeTimers = false; // D146: a discard of a frozen tab, and the next life is a new page
    if (s.load) fake.loadMode = s.load;
    boot();
    if (s.crashAfterBoot) {
      owedAtBoot();
      fake.killProcess();
      boot();
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
      for (const k of told.keys()) out.push(`(j) an ending reached nobody: ${k}`);
      for (const k of bootOwed.keys()) out.push(`(j) parked on disk, and not heard at the boot: ${k}`);
      for (const k of tryAgain.keys()) out.push(`(j) refused once, and not tried again: ${k}`);
      const parkedWaits = new Map<string, number>();
      for (const w of q) if (w["kind"] === "parked" && !w["firing"]) bump(parkedWaits, `${w["op"]} ${w["attempt"] ?? ""}`);
      for (const [k, n] of parkedOwed) if ((parkedWaits.get(k) ?? 0) < n) out.push(`(j) parked, and no wait says so: ${k}`);
      return out;
    },
    writeAheadLies: () => {
      const undecided = fake.mayHave();
      if (undecided.length === 0) return [];
      const heads = new Set(port.disk.heads(fake.kv)); // D142
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
  return {
    start(cfg) {
      fake = new FakeWorld(cfg.seed, cfg.machines.find((m) => m.server)?.server);
      // Round 7: the older cases were written with plain writes landing at once. D80's 5 s is the runtime's default; a case that means it says so.
      // `runtimeDefault`: a case that reads the runtime's own default says so, and is given no bound at all.
      const { runtimeDefault, ...named } = (cfg.bounds ?? {}) as Record<string, number>;
      // The second pass (gate5s.ts): no bound named means the runtime's own default.
      bounds = runtimeDefault || process.env["FLOW_RUNTIME_DEFAULT"] ? named : { captureMs: 0, ...named };
      compiled = cfg.machines.map((m) => listen(wrap((swaps.get(m) ?? m).make(fake.api))));
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
        return;
      }
      if ("reload" in s) {
        die(s);
        settle();
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
          ledgerOff = true; // a record edited on disk may be quarantined, and what it owed with it: rule 46
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
    },
    read: reads,
  };
};
// Round 7: classifying what fails at D80's interval. A flush, through the host's own hide, before a disk read, or before a kill. Off in a normal run.
const TEST_FLUSH = process.env["FLOW_TEST_FLUSH"] ?? "";
// Round 7: the same scenario on another way of building the same machine (`main.ts --swap`). By identity, so nothing else with its id is touched.
const swaps = new Map<Fixture_, Fixture_>();
export const swapFixtures = (m: ReadonlyMap<Fixture_, Fixture_>) => {
  for (const [a, b] of m) swaps.set(a, b);
};
export { NoHeldRequest };
