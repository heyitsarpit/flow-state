// What every scenario uses: the driver of one harness, and the checks that run after every step (SCENARIOS.md, D29).
import type { ActorRef, Answer, Fixture, Harness, Reads, Step } from "../harness.ts";
import { NoHeldRequest } from "../fake-world.ts";

export class Mismatch extends Error {}

// D29: L3 no longer trusts the runtime. Each claim is checked against what the suite itself owns.
export const checkClaims = (r: Reads) => {
  const q = r.quiet();
  if (q.fatal) return;
  if (!q.idle) throw new Mismatch("do() returned with work runnable");
  const out = r.outside();
  const mints = new Map<string, number>();
  for (const e of r.evidence("mint")) mints.set(e["attempt"], e["mint"]);
  const claimed = new Map<string, string>();
  for (const w of q.waits) if ("attempt" in w && w.attempt) claimed.set(w.attempt, w.kind);
  for (const w of q.waits) {
    switch (w.kind) {
      case "wire":
        if (
          !out.open.some((o) => o.op === w.op && (w.attempt === undefined || o.key === w.attempt))
        )
          throw new Mismatch(`L3: wire claim for ${w.op} with no request outside`);
        break;
      case "ack":
      case "capture":
        if (!out.storage.some((s) => s.keys.includes(w.key)))
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
          const mine = mints.get(w.attempt);
          const theirs = mints.get(b);
          if (mine !== undefined && theirs !== undefined && theirs >= mine)
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
          r.state({ actor: w.actor.slice(0, at), id: w.actor.slice(at + 1) }) !== undefined;
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
export const checkEndings = (r: Reads) => {
  const open = new Set<string>();
  const owed = new Map<string, number>();
  let ended = false;
  const ko = (e: Record<string, any>) => `${e["op"]}/${e["attempt"] ?? ""}`;
  for (const e of r.evidence()) {
    const k = `${e["attempt"]}#${e["send"]}`;
    switch (e["kind"]) {
      case "invoked":
        open.add(k);
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
      case "evidenceOnly": {
        // rule 60, rule 44: nobody is owed it, by declaration
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
      case "DisposeStart":
        ended = true;
        owed.clear();
        break;
      case "boot":
        ended = false;
        open.clear();
        owed.clear();
        break;
      default:
    }
  }
  const q = r.quiet();
  if (q.fatal) return;
  const wires = q.waits.filter((w) => w.kind === "wire");
  for (const k of open) {
    const attempt = k.split("#")[0]!;
    if (!wires.some((w) => !("attempt" in w) || w.attempt === attempt) && !ended)
      throw new Mismatch(`a send never ended: ${k}`);
  }
  if (q.idle)
    for (const [k, n] of owed) if (n > 0) throw new Mismatch(`an ending was never delivered: ${k}`);
};

// Review H6: every minted Attempt ends, or is live, or never reached the disk. The harness says the last, at the kill. An
// oracle that counted endings owed from evidence could not see a commit that silently vanished.
export const checkMints = (r: Reads) => {
  const q = r.quiet();
  if (q.fatal || !q.idle) return;
  const accounted = new Set<unknown>();
  let disposed = false;
  for (const e of r.evidence()) {
    if (e["kind"] === "DisposeStart") disposed = true;
    if (["ending", "Superseded", "Released", "lostWithProcess"].includes(e["kind"]))
      accounted.add(e["attempt"]);
  }
  if (disposed) return;
  for (const w of q.waits) if ("attempt" in w) accounted.add(w.attempt);
  for (const e of r.evidence("mint"))
    if (!accounted.has(e["attempt"]))
      throw new Mismatch(`a minted Attempt vanished: ${e["op"]} ${e["attempt"]}`);
};

export class Ctx {
  namedIssues: string[] = [];
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
  do(step: Step, a?: ActorRef) {
    void a;
    this.h.do(step);
    checkClaims(this.r);
    checkMints(this.r);
  }
  eq(label: string, actual: unknown, expected: unknown) {
    const x = JSON.stringify(actual);
    const e = JSON.stringify(expected);
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
  dispose = (a: ActorRef = this.A) => this.do({ dispose: a });
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
  run?: (c: Ctx) => void;
  variants?: Record<string, (c: Ctx) => void>;
};
