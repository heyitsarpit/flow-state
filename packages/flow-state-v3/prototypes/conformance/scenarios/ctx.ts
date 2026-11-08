// What every scenario uses: the driver of one harness, and the checks that run after every step (SCENARIOS.md, D29).
import type { ActorRef, Answer, Fixture, Harness, Reads, Step } from "../harness.ts";
import { NoHeldRequest } from "../fake-world.ts";
import { canonText } from "../output.ts";

export class Mismatch extends Error {}

// D130: one list of named issues per case, shared by every `Ctx` in it. D133: a fatal counts as an issue that must be named.
let caseNamed: string[] | undefined;
export const openCase = (named: readonly string[]) => (caseNamed = [...named]);
// D133: a fatal stops being a way out of the oracles. Named by the case, it is read after. Not named, it fails where it is. A runtime's `fatal` with no `Fatal` issue is a lie either way. Outside a case (a search), a search that means a fatal says `allowFatal`.
export const fatalAllowed = { search: false };
const checkFatal = (r: Reads) => {
  if (!r.issues().some((i) => i.code === "Fatal")) throw new Mismatch("D133: fatal, and no Fatal issue says why");
  if (caseNamed ? !caseNamed.includes("Fatal") : !fatalAllowed.search) throw new Mismatch(`D133: a fatal nobody named: ${r.issues().filter((i) => i.code === "Fatal").map((i) => i.input).join(" ")}`);
};

// D29: L3 no longer trusts the runtime. Each claim is checked against what the suite itself owns.
export const checkClaims = (r: Reads) => {
  const q = r.quiet();
  if (q.fatal) checkFatal(r);
  if (q.fatal || q.spinning || q.frozen) return; // D122: a spin has nothing settled to claim. A case that ends it is read after. D146: nor a frozen page
  if (!q.idle) throw new Mismatch("do() returned with work runnable");
  // D117, oracle (j): what a committed turn asked for became something, and what no turn could take left a wait.
  const gone = r.missingEndings();
  if (gone.length) throw new Mismatch(gone.join("; "));
  const life = r.lifetimeViolations(); // rule 73's global invariants, after every step
  if (life.length) throw new Mismatch(life.join("; "));
  // D112, oracle (h), in every step of every case and search: a request at the server has its Attempt as the head on disk, until it is decided or released.
  const lies = r.writeAheadLies();
  if (lies.length) throw new Mismatch(`(h) may be at the server, and no head on disk says so: ${lies.join(" ")}`);
  const out = r.outside();
  const mints = new Map<string, number>();
  for (const e of r.evidence("mint")) mints.set(e["attempt"], e["mint"]);
  const claimed = new Map<string, string>();
  for (const w of q.waits) if ("attempt" in w && w.attempt) claimed.set(w.attempt, w.kind);
  for (const w of q.waits) {
    switch (w.kind) {
      case "wire":
        if (
          !out.open.some((o) => o.op === w.op && (w.attempt === undefined || o.key === w.attempt || r.businessKeyed(o.op))) // D106: a key the server recognises (audit 3b: by the contract)
        )
          throw new Mismatch(`L3: wire claim for ${w.op} with no request outside`);
        break;
      case "ack":
      case "capture":
        // Round 7, the edge: a write may wait for the one batch its actor has out. So: a write outside for this actor, and no other reading of "outside".
        // D142: whose a stored key is, the runtime's codec says. The suite no longer parses `actor/` or `lane/`.
        if (!out.storage.some((s) => s.keys.some((k) => k === w.key || (r.diskScope(k) !== undefined && r.diskScope(k) === r.diskScope(w.key)))))
          throw new Mismatch(`L3: ${w.kind} claim for ${w.op} with no write outside`);
        break;
      case "timer":
        if (!out.timers.includes(w.at))
          throw new Mismatch(`L3: timer ${w.key} due ${w.at} with no host timer`);
        break;
      case "queue":
      case "W":
        for (const b of w.behind) {
          // A wait must chain to something real: the holder itself claims a wait, checked in its own turn here.
          if (!claimed.has(b))
            throw new Mismatch(`L3: ${w.op} waits behind ${b}, which waits on nothing`);
          // D3 as directed: a record queue is in the order sends began, and a commit still in W (a draft) holds no record.
          if (w.kind === "queue" && claimed.get(b) === "W")
            throw new Mismatch(`D3: ${w.attempt} waits on a record behind ${b}, a commit not yet sent`);
          const mine = mints.get(w.attempt);
          const theirs = mints.get(b);
          if (w.kind === "W" && mine !== undefined && theirs !== undefined && theirs >= mine)
            throw new Mismatch(
              `L2: ${w.attempt} (mint ${mine}) waits behind ${b} (mint ${theirs})`,
            );
        }
        break;
      case "repair":
        if (!out.open.some((o) => o.op === "repair" && o.input?.ref === w.ref))
          throw new Mismatch(`L3: repair claim for ${w.ref} with no read of that record outside`);
        break;
      case "held": {
        // M9: a hold names who owns it, and the suite can see the actor. Unbound must be true, and visible by evidence.
        const at = w.actor.lastIndexOf("/");
        const alive =
          r.state({ actor: w.actor.slice(0, at), id: decodeURIComponent(w.actor.slice(at + 1)) }) !== undefined;
        if (w.owner === "unbound" ? alive : !alive)
          throw new Mismatch(
            `L3: ${w.op} held by ${w.actor} claims ${w.owner}, actor alive: ${alive}`,
          );
        break;
      }
      case "disabled":
        if (!r.issues().some((i) => i.code === "ModuleDefect" && i.origin?.startsWith(w.module)))
          throw new Mismatch(`D46: ${w.op} claims a disabled ${w.module} with no ModuleDefect`);
        break;
      case "mail":
        throw new Mismatch(`L3: ${w.op} settled with nothing to admit it`);
      case "ready":
        throw new Mismatch(`L3: ${w.op} eligible and not invoked`);
      default:
    }
  }
};

// Each invoked send has one ending, and each ending is delivered. Evidence is read in order, so a reload's dead sends
// and a disposal's abandoned ones are accounted for by name rather than by exemption.
// Audit 2: what is owed stops at a disposal the suite drove (its own step, `disposeDrivenAt`), never at the runtime's `DisposeStart`. And a send
// still open is excused only by a request the fake world holds open for it: by its key, or else one of that op's open requests with no key of an
// open send (a lookup's, a business key's), one each; never by the runtime's own wire wait.
export const checkEndings = (r: Reads) => {
  const open = new Set<string>();
  const opOf = new Map<string, string>();
  const owed = new Map<string, number>();
  let ended = false;
  const ko = (e: Record<string, any>) => `${e["op"]}/${e["attempt"] ?? ""}`;
  const all = r.evidence();
  const dm = r.disposeDrivenAt();
  for (const [i, e] of all.entries()) {
    if (dm !== undefined && i === dm) {
      ended = true;
      owed.clear();
    }
    const k = `${e["attempt"]}#${e["send"]}`;
    switch (e["kind"]) {
      case "invoked":
        open.add(k);
        opOf.set(k, String(e["op"]));
        break;
      case "ending":
        if (e["send"] !== undefined) {
          if (!open.has(k)) throw new Mismatch(`S4: an ending for ${k}, which has no open send`);
          open.delete(k);
        }
        if (!ended) owed.set(ko(e), (owed.get(ko(e)) ?? 0) + 1);
        break;
      case "unparked": // saved by disposal, or by a path with no incarnation, and owed again
        owed.set(ko(e), (owed.get(ko(e)) ?? 0) + 1);
        break;
      case "parked": // rule 53: owed to whoever comes
      case "ignored": // OD28: admitted with no turn; whether the mapping says so is the ledger's call (drive.ts)
      case "evidenceOnly": {
        // rule 60, rule 44: nobody is owed it. Here only counted; whether it may be evidence is the ledger's call, from what the suite sees (drive.ts, re-audit H1)
        if (ended) break;
        const n = owed.get(ko(e)) ?? 0;
        if (n === 0) throw new Mismatch(`${e["kind"]} with no ending: ${ko(e)}`);
        owed.set(ko(e), n - 1);
        break;
      }
      case "delivered": {
        const n = owed.get(ko(e)) ?? 0;
        if (n === 0) throw new Mismatch(`delivered with no ending: ${ko(e)}`);
        owed.set(ko(e), n - 1);
        break;
      }
      case "Superseded":
      case "AbandonedFiber":
        open.delete(k);
        break;
      case "boot":
        ended = false;
        open.clear();
        owed.clear();
        break;
      default:
    }
  }
  if (dm !== undefined && dm >= all.length) {
    ended = true;
    owed.clear();
  }
  const q = r.quiet();
  if (q.fatal || q.spinning || q.frozen) return;
  const attemptsOpen = new Set([...open].map((k) => k.split("#")[0]!));
  const byKey = new Set<string>();
  const spare = new Map<string, number>();
  // Audit 3: a spare is a request with no key, or a key that names no Attempt (a business key): never another Attempt's late request.
  for (const o of r.outside().open) {
    if (o.key !== undefined && attemptsOpen.has(o.key)) byKey.add(o.key);
    else if (o.key === undefined || r.businessKeyed(o.op)) spare.set(o.op, (spare.get(o.op) ?? 0) + 1); // audit 3b: the contract says, not the key
  }
  for (const k of open) {
    const attempt = k.split("#")[0]!;
    if (ended || byKey.has(attempt)) continue;
    const op = opOf.get(k) ?? "";
    const n = spare.get(op) ?? 0;
    if (n === 0) throw new Mismatch(`a send never ended: ${k}`);
    spare.set(op, n - 1);
  }
  if (q.idle)
    for (const [k, n] of owed) if (n > 0) throw new Mismatch(`an ending was never delivered: ${k}`);
};

// Review H6: every minted Attempt ends, or is live, or never reached the disk. The harness says the last, at the kill. An
// oracle that counted endings owed from evidence could not see a commit that silently vanished.
export const checkMints = (r: Reads) => {
  const q = r.quiet();
  if (q.fatal || !q.idle || q.loading) return; // stage K: before a slow load answers, what was in flight is on disk only
  const accounted = new Set<unknown>();
  const disposed = r.disposeDrivenAt() !== undefined; // audit 2: the suite's own disposal step, not the runtime's `DisposeStart`
  for (const e of r.evidence()) {
    // D158: `Released` accounts only with a cause the ledger saw; `Superseded` is held to its own oracle there (D154).
    if (["ending", "Superseded", "lostWithProcess"].includes(e["kind"]) || (e["kind"] === "Released" && r.releaseSeen(String(e["attempt"]))))
      accounted.add(e["attempt"]);
  }
  if (disposed) return;
  // Audit 3: a wait the runtime names accounts for a mint only where the suite can see why: its request reached the fake (on the wire, or a hold
  // whose head (h) checks on disk), an acknowledgement the fake still holds, or it queues behind an Attempt accounted that way.
  const sent = new Set(r.requests().map((x) => x.idempotencyKey).filter((k): k is string => k !== undefined));
  const storage = r.outside().storage;
  const named = new Map<string, Extract<(typeof q.waits)[number], { attempt: string }>>();
  for (const w of q.waits) if ("attempt" in w && w.attempt) named.set(w.attempt, w as never);
  const seen = (att: string, depth: number): boolean => {
    if (accounted.has(att) || sent.has(att)) return true;
    const w = named.get(att);
    if (!w || depth > 64) return false;
    if ((w.kind === "ack" || w.kind === "capture") && storage.some((s) => s.keys.some((k) => k === w.key || (r.diskScope(k) !== undefined && r.diskScope(k) === r.diskScope(w.key))))) return true;
    // D106: a request the server recognises by a business key, not the Attempt's id. D46: a disabled module, as `checkClaims` takes it (the module's
    // own `ModuleDefect` issue: a runtime report, the stated limit of this one kind).
    if ((w.kind === "held" || w.kind === "repair" || w.kind === "wire") && r.businessKeyed(w.op) && r.requests().some((x) => x.op === w.op && x.idempotencyKey !== undefined)) return true;
    if (w.kind === "disabled" && r.issues().some((i) => i.code === "ModuleDefect" && i.origin?.startsWith(w.module))) return true;
    if (w.kind === "queue" || w.kind === "W") return w.behind.some((b) => seen(b, depth + 1));
    return false;
  };
  for (const att of named.keys()) if (seen(att, 0)) accounted.add(att);
  for (const e of r.evidence("mint"))
    if (!accounted.has(e["attempt"]))
      throw new Mismatch(`a minted Attempt vanished: ${e["op"]} ${e["attempt"]}`);
};

// What an Attempt's own life says about it, which is never its ending made evidence (the round 3 reviewer's list, from round-14's notes).
const LIFECYCLE: ReadonlySet<string> = new Set(["parked", "unparked", "delivered", "ending", "lane", "mint", "invoked", "turn", "Superseded", "interrupt", "Released", "fence", "AbandonedFiber", "interruptedBy", "StorageFailure", "KeptLetGo", "ParkedLetGo", "HoldForgotten"]);
export class Ctx {
  get namedIssues(): string[] {
    return caseNamed ?? [];
  }
  // D130: naming adds to the case's list, whichever `Ctx` said it.
  set namedIssues(v: string[]) {
    if (!caseNamed) caseNamed = [];
    for (const x of v) if (!caseNamed.includes(x)) caseNamed.push(x);
  }
  fresh: (machines?: readonly Fixture[], bounds?: Record<string, number>) => Harness = () => {
    throw new Error("no fresh");
  };
  make: () => Harness = () => {
    throw new Error("no make");
  };
  constructor(
    readonly h: Harness,
    readonly A: ActorRef = { actor: "Checkout/Pay", id: "shopper-1" },
  ) {}
  get r() {
    return this.h.read;
  }
  // Re-audit M2: what is stored, by the runtime's codec, not by its spelling. A case that names a key pins the format; these do not.
  record(a: ActorRef = this.A): any {
    const scope = this.r.actorKey(a); // D158: the suite's one spelling of the actor's id; the codec maps a key to it
    for (const [k, v] of this.r.stored()) if (this.r.diskKind(k) === "actor" && this.r.diskScope(k) === scope) return v;
    return undefined;
  }
  // D158, re-check M4': an absence through the codec. No lane of this actor on disk, whatever the format spells its keys.
  lanesOf(a: ActorRef = this.A): string[] {
    return this.laneKeys().filter((k) => this.r.diskScope(k) === this.r.actorKey(a));
  }
  laneKeys(): string[] {
    return [...this.r.stored().keys()].filter((k) => this.r.diskKind(k) === "lane");
  }
  do(step: Step, a?: ActorRef) {
    void a;
    this.h.do(step);
    checkClaims(this.r);
    checkMints(this.r);
  }
  // D143, over-assumptions F3: values, not JSON text. Field order is no difference; a Date is not its ISO text, NaN is not null, a Map is not {}, undefined is not absent.
  eq(label: string, actual: unknown, expected: unknown) {
    const x = canonText(actual);
    const e = canonText(expected);
    if (x !== e) throw new Mismatch(`${label}: expected ${e}, got ${x}`);
  }
  yes(label: string, v: unknown) {
    if (!v) throw new Mismatch(`${label}: expected true, got ${JSON.stringify(v)}`);
  }
  ensure = (a: ActorRef = this.A, input?: unknown) =>
    this.do({ ensure: a, ...(input === undefined ? {} : { input }) });
  to = (a: ActorRef, event: string, payload: unknown = {}) => this.do({ send: a, event, payload });
  send = (event: string, payload: unknown = {}) => this.to(this.A, event, payload);
  // An event for a fragment instance: E.summary.PayPressed, E.uploads.key("r1").Cancel.
  into = (path: readonly string[], event: string, payload: unknown = {}, a: ActorRef = this.A) =>
    this.do({ send: a, event, payload, to: path });
  dispose = (a: ActorRef = this.A) => this.do({ dispose: a }); // `disposeActor` (OD31)
  detach = (a: ActorRef = this.A) => this.do({ detach: a }); // rule 73: the Story ends one use; the grace decides
  snap = (a: ActorRef = this.A) => this.r.snapshot(a);
  // How many incarnations the actor has had in this run, and the one now live (rule 73's "same incarnation").
  incarnations = (a: ActorRef = this.A) => this.r.evidence("incarnation").filter((e) => e["actor"] === this.r.actorKey(a)).length;
  inner = (path: readonly string[], a: ActorRef = this.A) => this.r.inner(a, path);
  ack = (match?: string) => this.do({ storage: "ack", ...(match ? { match } : {}) });
  answer = (op: string, a: Answer, where?: Readonly<Record<string, unknown>>) =>
    this.do({ answer: op, with: a, ...(where ? { where } : {}) });
  tryAnswer = (op: string, a: Answer) => {
    try {
      this.answer(op, a);
      return true;
    } catch (e) {
      if (e instanceof NoHeldRequest) return false; // aborted before the answer; never a Mismatch
      throw e;
    }
  };
  advance = (ms: number) => this.do({ advance: ms });
  reload = () => this.do({ reload: true });
  fault = (f: any) => this.do({ fault: f });
  state = (s: string, a: ActorRef = this.A) => this.eq("state", this.r.state(a), s);
  mem = (a: ActorRef = this.A) => this.r.memory(a);
  reqs = (op: string) => this.r.requests().filter((x) => x.op === op);
  keys = (op: string) => [...new Set(this.reqs(op).map((x) => x.idempotencyKey))];
  endings = (op: string) => this.r.evidence("ending").filter((e) => e["op"] === op);
  lastEnding = (op: string) => this.endings(op).at(-1);
  rec = (ref: string) => this.r.record(ref);
  // Audit 1: a report the design leaves unnamed or proposed is checked by what it is about, never by its spelling. `reportsOf`: the entries, of
  // any kind but the lane cells, that name this actor's lane of `op`. `madeEvidence`: the entries since `from` that name `attempt` and are
  // neither its parking nor its delivery nor its own lifecycle, so an ending turned into evidence is seen whatever the runtime calls it.
  reportsOf = (op: string, a: ActorRef = this.A) =>
    this.r.evidence().filter((e) => e["op"] === op && e["actor"] === this.r.actorKey(a) && "lane" in e && e["kind"] !== "lane");
  madeEvidence = (attempt: string, from = 0) =>
    this.r.evidence().slice(from).filter((e) => e["attempt"] === attempt && !LIFECYCLE.has(e["kind"]));
  // D49 (changed): Inspection's answer about a stall, not the row's.
  stalled = (op: string, attempt?: unknown) =>
    this.r
      .quiet()
      .waits.find(
        (w) =>
          "op" in w &&
          w.op === op &&
          w.stalled &&
          (attempt === undefined || (w as any).attempt === attempt),
      )?.stalled;
  cells = (op: string) =>
    this.r
      .evidence("lane")
      .filter((e) => e["op"] === op)
      .map((e) => e["cell"]);
  hitCell = (cell: string) => this.r.evidence("lane").some((e) => e["cell"] === cell);
}

export type Scenario = {
  id: string;
  kind: "example" | "bounded" | "fault";
  cites: readonly string[];
  near?: readonly string[]; // exercised, not proven: stays in UNTESTED
  pins?: readonly string[]; // these expectations pin a bug, named in convergence-2. They will fight its fix
  fixtures: readonly Fixture[];
  actor?: ActorRef;
  bounds?: Record<string, number>;
  namedIssues?: readonly string[];
  outputAllow?: { readonly sections: readonly string[]; readonly why: string }; // D134: what this case does not care about, and why
  run?: (c: Ctx) => void;
  variants?: Record<string, (c: Ctx) => void>;
};
