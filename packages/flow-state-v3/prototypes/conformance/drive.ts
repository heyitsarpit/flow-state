// Turns a runtime's `Port` into a Harness. Settling, faults, plans and the fake live here, so a rewrite replaces only the
// port. Faults reach a runtime through what production has: compiled data (Slots), a Host, and its own input port.
import type { Fixture as Fixture_ } from "./harness.ts";
import type { Compiled } from "./fixtures/compiled.ts";
import { FakeWorld, NoHeldRequest } from "./fake-world.ts";
import { canonText } from "./output.ts";
import type { FaultState, Harness, Instance, Port, Step } from "./harness.ts";

export const rowKey = (op: string, key: unknown) => `${op}|${JSON.stringify(key)}`;
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
  let askedNow: string[] = []; // this batch's asks, seen by the wrapped input Slots
  let replaying = false;
  const missing: string[] = [];
  // Its second half, a ledger of every ending, from the evidence the runtime gives and the disk the suite owns. An ending said is owed until it is heard (`delivered`), goes as evidence, is parked, or is let go. What is parked is owed until it is unparked, and a wait must name it, op and Attempt. A refusal is owed its second try, and a second refusal is owed a keep. What is on disk at a kill is owed at the boot.
  const told = new Map<string, number>();
  const parkedOwed = new Map<string, number>();
  const bootOwed = new Map<string, number>();
  const tryAgain = new Map<string, number>();
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
  let releasableOps: Set<string> | undefined;
  const releasable = (op: string) => {
    if (!releasableOps) {
      const out = new Set<string>();
      const seen = new Set<unknown>();
      const walk = (v: any) => {
        if (v === null || typeof v !== "object" || seen.has(v)) return;
        seen.add(v);
        if (Array.isArray(v)) return void v.forEach(walk);
        if (v.verb === "cancel" && typeof v.op === "string") out.add(v.op);
        if (v.whenAbandoned?.release) for (const o of v.whenAbandoned.release) out.add(o);
        for (const [k, x] of Object.entries(v)) if (k !== "domain" && typeof x === "object") walk(x);
      };
      walk(compiled);
      releasableOps = out;
    }
    return releasableOps.has(op);
  };
  // D154: the other seen cause, a cancel that changes nothing published. The suite drove an event to the owner in this `do` (a send, or an
  // answer or a timer whose compiled mapping names the event), and the compiled machine has an alternative on that event with a `cancel` of the op.
  let cancelsOn: Map<string, Set<string>> | undefined; // event -> ops some alternative on it cancels
  const cancels = () => {
    if (cancelsOn) return cancelsOn;
    const out = new Map<string, Set<string>>();
    const seen = new Set<unknown>();
    const walk = (v: any) => {
      if (v === null || typeof v !== "object" || seen.has(v)) return;
      seen.add(v);
      if (Array.isArray(v)) return void v.forEach(walk);
      if (v.on && typeof v.on === "object" && v.id !== undefined)
        for (const [ev, alts] of Object.entries(v.on as Record<string, any[]>))
          for (const alt of alts ?? []) for (const m of alt.members ?? []) if (m.verb === "cancel") (out.get(ev) ?? out.set(ev, new Set()).get(ev)!).add(m.op);
      for (const [k, x] of Object.entries(v)) if (k !== "domain" && typeof x === "object") walk(x);
    };
    walk(compiled);
    return (cancelsOn = out);
  };
  const drivenTo = new Map<string, Set<string>>(); // actor -> events the suite sent it in this `do`
  const drivenAny = new Set<string>(); // events an answer or a timer of this `do` maps to, by the compiled data; owner not known to the suite
  const known = new Set<string>(); // every actor the suite addressed: their published state is read after each batch
  const drive = (actor: string, ev: string) => {
    known.add(actor);
    (drivenTo.get(actor) ?? drivenTo.set(actor, new Set()).get(actor)!).add(ev);
  };
  const mappedEvents = (op: string) => {
    const out: string[] = [];
    for (const c of compiled) {
      const o = c.ops[op] as any;
      if (!o) continue;
      const add = (m: any) => m?.event && out.push(m.event);
      add(o.outcomes.success);
      for (const m of Object.values(o.outcomes.failure ?? {})) add(m);
      const u = o.outcomes.unknown;
      if (u?.byReason) for (const m of Object.values(u.byReason)) add(m);
      else add(u);
    }
    return out;
  };
  const scheduleEvents = () => {
    const out: string[] = [];
    const seen = new Set<unknown>();
    const walk = (v: any) => {
      if (v === null || typeof v !== "object" || seen.has(v)) return;
      seen.add(v);
      if (Array.isArray(v)) return void v.forEach(walk);
      if (Array.isArray(v.schedules)) for (const s of v.schedules) if (typeof s.send === "string") out.push(s.send);
      for (const [k, x] of Object.entries(v)) if (k !== "domain" && typeof x === "object") walk(x);
    };
    walk(compiled);
    return out;
  };
  const cancelSeen = (actor: string, op: string) => {
    const c = cancels();
    for (const ev of [...(drivenTo.get(actor) ?? []), ...drivenAny]) if (c.get(ev)?.has(op)) return true;
    return false;
  };
  const lifeOver = (att: string) => {
    const actor = attemptActor.get(att);
    if (actor === undefined) return undefined;
    if (attemptLife.get(att) !== (lifeOf.get(actor) ?? 0)) return true; // the life that asked is over; a new one is owed nothing (rule 44)
    return publishedNow(actor) === undefined;
  };
  // A release of `att`'s lane, said by the runtime, has a cause the suite saw. No attempt named: no actor known, no pay (re-check H1': no wildcard).
  const releaseSeen = (op: string, att: string | undefined) => {
    if (att === undefined) return false;
    const actor = attemptActor.get(att);
    if (actor === undefined) return false;
    return lifeOver(att) === true || (moved.has(actor) && releasable(op)) || cancelSeen(actor, op);
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
    const seen = (a: string) => moved.has(a) || cancelSeen(a, op);
    if (actor !== undefined ? seen(actor) : [...known].some(seen) || cancelSeen("", op)) return true;
    return batch.some((y) => y["kind"] === "kept" && y["op"] === x["op"]);
  };
  const ledger = (e: readonly Record<string, any>[]) => {
    unpaid = [];
    // Attribution: a mint or an invoke belongs to the turn before it in the step, or, if none came before, the turn after it.
    let turnActor: string | undefined;
    const pending: string[] = [];
    for (const x of e) {
      if (x["kind"] === "turn") {
        turnActor = String(x["actor"]);
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
    // D154: whose published state moved in this batch, by the suite's own reading before and after it.
    moved = new Set();
    for (const actor of new Set([...known, ...attemptActor.values()])) {
      const now = publishedNow(actor);
      if (published.has(actor) && published.get(actor) !== now) moved.add(actor);
      if (now === undefined) published.delete(actor);
      else published.set(actor, now);
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
      if ((x["kind"] === "Released" || (x["kind"] === "lane" && String(x["cell"]).startsWith("lane.release."))) && releaseSeen(String(x["op"]), x["attempt"] === undefined ? undefined : String(x["attempt"])))
        lettingGo.add(String(x["attempt"]));
    // Review M5: `delivered` is the runtime's word. It pays only if the same step shows the machine took it: a turn, a denial, an unhandled, or a refusal. Otherwise the debt stays.
    const heard = e.some((x) => x["kind"] === "turn" || x["kind"] === "Denied" || x["kind"] === "Unhandled" || x["kind"] === "refused");
    for (const x of e) {
      const k = ledgerKey(x);
      switch (x["kind"]) {
        case "ending":
          bump(told, k);
          break;
        case "delivered":
          if (heard) bump(told, k, -1);
          else unpaid.push(k);
          break;
        case "evidenceOnly":
          if (mayBeEvidence(x, e)) bump(told, k, -1);
          else if (process.env["FLOW_DEBUG_EO"]) console.error("EO-UNPAID", JSON.stringify(x), attemptActor.get(String(x["attempt"])), e.map((y) => y["kind"]).join(","));
          break;
        case "parked":
          bump(told, k, -1);
          bump(parkedOwed, k);
          break;
        case "unparked":
          if (bootOwed.has(k)) bump(bootOwed, k, -1);
          else bump(parkedOwed, k, -1);
          bump(told, k);
          break;
        case "kept":
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
          break;
        case "turn":
        case "Denied":
        case "Unhandled":
          bump(tryAgain, String(x["event"]), -1);
          break;
        case "fence":
        case "unbound":
          tryAgain.clear();
          break;
        case "DisposeStart":
          // D158: the ledger turns off only for a dispose the suite drove. Said with none, it is a lie that would excuse every debt.
          if (runtimeDisposed) ledgerOff = true;
          else missing.push("(j) DisposeStart, and the suite disposed no runtime");
          break;
        default:
      }
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
    if ("burst" in s || "send" in s) drive(actorKey((s as any).burst ?? (s as any).send), (s as any).event);
    if ("sendMany" in s) for (const [a, tag] of s.sendMany) drive(actorKey(a), tag);
    if ("answer" in s) for (const ev of mappedEvents(s.answer)) drivenAny.add(ev);
    if ("advanceNow" in s) for (const ev of scheduleEvents()) drivenAny.add(ev);
    if ("ensure" in s) known.add(actorKey(s.ensure));
    if ("ensureAs" in s) inst.ensure(actorKey(s.ensureAs.key), s.ensureAs.machine); // D137: a key and a machine that do not agree, as a host's bug would give
    else if ("ensure" in s) inst.ensure(actorKey(s.ensure), s.ensure.actor, s.input);
    else if ("burst" in s) for (let i = 0; i < s.n; i++) inst.send(actorKey(s.burst), { tag: s.event, payload: {} });
    else if ("send" in s)
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
    for (const c of compiled) for (const op of Object.keys(c.ops)) for (const ev of mappedEvents(op)) drivenAny.add(ev);
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
      const released = new Set(evidence.filter((e) => e["kind"] === "Released" && lettingGo.has(String(e["attempt"]))).map((e) => e["attempt"])); // D158: a release the ledger saw a cause for
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
    releaseSeen: (attempt) => lettingGo.has(attempt),
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
      compiled = cfg.machines.map((m) => wrap((swaps.get(m) ?? m).make(fake.api)));
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
      drivenAny.clear();
      if ("advance" in s) for (const ev of scheduleEvents()) drivenAny.add(ev);
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
