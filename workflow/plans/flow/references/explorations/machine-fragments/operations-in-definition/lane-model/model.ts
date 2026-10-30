// The write lane of proposal.md revision 9, section 3.8.1, as an executable state machine.
// Dependency-free. One lane, one key. Every place the text is silent is marked `INVENTED:` or `AMBIGUOUS:`.
// RULES holds the key rules; mutations.py flips them one at a time.

export type Mode = "reject" | "latest" | "serialize" | "cancel" | "allow";
export const MODES: Mode[] = ["reject", "latest", "serialize", "cancel", "allow"];
export const holds = (m: Mode) => m === "reject" || m === "latest" || m === "serialize";

export const RULES = {
  interruptHeld: true, // 3.5/3.8.1 cancel + R6 L1: an interrupted Attempt's unknown is retained (Held)
  promoteOnResolve: true, // 3.8.1 "Promotion": on resolved (success, failure) or released (cancel)
  invokeWhateverOutcome: true, // 3.8.1 "Invocation is its own step": promoted Attempt invoked whatever the turn's outcome
  endingKeptOnDeniedTurn: true, // 3.8.1: a Denied/Unhandled/InvalidTurn turn keeps its ending's lane effects
  cancelByHistory: true, // 3.8.1 cancel cell: before invocation, by history (never sent: NotSent; re-send: Released)
  serializeHolds: true, // 3.8.1 per-policy table: serialize holds on an unknown
  heldThisTurn: true, // 3.8.1 second table: cancel and allow keep an unknown for its own turn only
};

export const CONFIG = {
  maxCommits: 3,
  resendCap: 1, // saturation bound on retries per Attempt, so the state space is finite
  queueCap: 2, // proposal: 64. Lowered so Overloaded is reachable
  ackPerSend: true, // true: each (re-)send needs its own storage ack (needed for the "storage refused: re-send" cell). false: acknowledged is per Attempt, sticky (R6 L2)
  retryTimes: 1, // the `times` of retryable({ times })
};

export type LSt = "Idle" | "InFlight" | "Held";
export type Row =
  | "commit" | "retry" | "cancel" | "idle" | "retryable" | "invoked" | "storageRefused"
  | "success" | "failure" | "unknown" | "interrupt" | "dispose" | "rebind" | "restore";
export const ROWS: Row[] = ["commit", "retry", "cancel", "idle", "retryable", "invoked", "storageRefused", "success", "failure", "unknown", "interrupt", "dispose", "rebind", "restore"];
export const LSTATES: LSt[] = ["Idle", "InFlight", "Held"];
// The 13 "cannot occur" cells of the table.
export const CANNOT: Partial<Record<Row, LSt[]>> = {
  invoked: ["Idle", "Held"], storageRefused: ["Idle", "Held"],
  success: ["Idle", "Held"], failure: ["Idle", "Held"], unknown: ["Idle", "Held"], interrupt: ["Idle", "Held"],
  rebind: ["Idle"],
};
export const VISITED = new Set<string>();
export const FLAGS = { cap: true }; // the retry cap is a bound on the state space; drains switch it off

export type AStatus = "queued" | "waiting" | "wire" | "unknown" | "success" | "failure" | "released" | "notsent";
export interface Att {
  id: number; val: number; status: AStatus;
  everSent: boolean; acked: boolean; ackedEver: boolean;
  sends: number; resends: number; interrupting: boolean;
  cancelled: boolean; noInvoke: boolean; evid: boolean; why: string;
}
export interface S {
  mode: Mode; commits: number; atts: Att[];
  head: number; st: LSt; W: number[]; out: number[]; old: number[];
  bound: boolean; srvVal: number; applied: number[]; refused: number[]; net: number[];
}
export interface Viol { tag: string; msg: string }
export interface Ctx { viol: Viol[]; produced: number; handled: number; promoted: number[]; endAtt: number }
export const newCtx = (): Ctx => ({ viol: [], produced: 0, handled: 0, promoted: [], endAtt: 0 });

export const init = (mode: Mode): S => ({ mode, commits: 0, atts: [], head: 0, st: "Idle", W: [], out: [], old: [], bound: true, srvVal: 0, applied: [], refused: [], net: [] });
export const clone = (s: S): S => ({
  ...s, atts: s.atts.map((a) => ({ ...a })), W: [...s.W], out: [...s.out], old: [...s.old],
  applied: [...s.applied], refused: [...s.refused], net: [...s.net],
});
export const A = (s: S, id: number) => s.atts[id - 1]!;
const viol = (c: Ctx, tag: string, msg: string) => c.viol.push({ tag, msg });

export const laneSt = (s: S): LSt => {
  if (s.mode === "allow") return s.out.length === 0 ? "Idle" : s.out.some((i) => A(s, i).status === "unknown") ? "Held" : "InFlight";
  return s.st;
};
function cell(s: S, c: Ctx, row: Row, st: LSt = laneSt(s)) {
  VISITED.add(`${s.mode}|${row}|${st}`);
  if (CANNOT[row]?.includes(st)) viol(c, "inv7", `cannot-occur cell reached: ${row} x ${st}`);
}

function mint(s: S, c: Ctx): Att {
  const a: Att = { id: s.atts.length + 1, val: ++s.commits, status: "queued", everSent: false, acked: false, ackedEver: false, sends: 0, resends: 0, interrupting: false, cancelled: false, noInvoke: false, evid: false, why: "" };
  s.atts.push(a);
  return a;
}
function notSent(a: Att, why: string) { a.status = "notsent"; a.why = why; a.cancelled = why === "Cancelled"; }
function release(a: Att) { a.status = "released"; a.cancelled = true; }
function setHead(s: S, c: Ctx, a: Att) { a.status = "waiting"; a.acked = false; s.head = a.id; s.st = "InFlight"; c.promoted.push(a.id); }

// Promotion (3.8.1): W's head becomes the addressable Attempt, else Idle.
function promoteNext(s: S, c: Ctx) {
  if (holds(s.mode) && s.W.length > 0) setHead(s, c, A(s, s.W.shift()!));
  else { s.head = 0; s.st = "Idle"; }
}

// ---- members ------------------------------------------------------------------------------------
export type Act = "commit" | "retry" | "cancel";
function doCommit(s: S, c: Ctx) {
  const cl = laneSt(s);
  cell(s, c, "commit", cl);
  const a = mint(s, c);
  if (s.mode === "allow") { a.status = "waiting"; s.out.push(a.id); return; }
  if (s.mode === "cancel") {
    if (cl === "Idle") { setHead(s, c, a); return; }
    const h = A(s, s.head);
    if (cl === "InFlight") {
      if (h.status === "wire") { h.interrupting = true; s.old.push(h.id); }
      // INVENTED: the cancel table says "interrupt the one on the wire" only. A head waiting to be invoked has no wire.
      else if (!h.everSent) notSent(h, "Superseded");
      else h.status = "unknown";
    }
    h.evid = true; // InFlight (interrupted) and HeldThisTurn ("the held one becomes evidence")
    setHead(s, c, a);
    return;
  }
  if (cl === "Idle") { setHead(s, c, a); return; }
  if (s.mode === "reject") { notSent(a, "Rejected"); return; }
  if (s.mode === "serialize") {
    if (s.W.length >= CONFIG.queueCap) notSent(a, "Overloaded");
    else { a.status = "queued"; s.W.push(a.id); }
    return;
  }
  // latest
  const h = A(s, s.head);
  for (const w of s.W) notSent(A(s, w), "Superseded");
  s.W = [];
  if (cl === "InFlight" && h.status === "waiting" && !h.everSent) {
    // "an addressable Attempt never sent and not yet invoked is replaced too" (R7 L3).
    // AMBIGUOUS: the text says the commit "becomes W" and the head is replaced; it does not say who is then the head. Read: the commit takes the head's place.
    notSent(h, "Superseded");
    setHead(s, c, a);
  } else { a.status = "queued"; s.W = [a.id]; }
}

function resend(s: S, c: Ctx, a: Att) {
  if (a.resends < CONFIG.resendCap) a.resends++; // saturates at the cap: bounds the state space without refusing a retry
  a.status = "waiting";
  a.acked = CONFIG.ackPerSend ? false : a.ackedEver;
  s.st = "InFlight"; s.head = s.mode === "allow" ? s.head : a.id;
  c.promoted.push(a.id);
}
function doRetry(s: S, c: Ctx) {
  const cl = laneSt(s);
  cell(s, c, "retry", cl);
  if (s.mode === "allow") { // MD N2: key-less, the ending's own Attempt only
    const a = c.endAtt ? A(s, c.endAtt) : undefined;
    if (a && a.status === "unknown" && s.out.includes(a.id) ) resend(s, c, a);
    return;
  }
  if (cl === "Held") resend(s, c, A(s, s.head)); // nothing newer is sent, W stays
  // Idle: evidence NothingToResend. InFlight: evidence InFlight.
}
function doCancel(s: S, c: Ctx) {
  const cl = laneSt(s);
  cell(s, c, "cancel", cl);
  if (s.mode === "allow") {
    const a = c.endAtt ? A(s, c.endAtt) : undefined;
    if (a && a.status === "unknown" && s.out.includes(a.id)) { release(a); a.evid = true; s.out = s.out.filter((i) => i !== a.id); }
    return;
  }
  if (cl === "Idle") return;
  const h = A(s, s.head);
  if (cl === "Held") { release(h); promoteNext(s, c); return; }
  if (h.status === "wire") { h.interrupting = true; return; } // lane stays InFlight until the interrupt's ending is admitted
  // waiting to be invoked: by history
  if (!RULES.cancelByHistory || !h.everSent) notSent(h, "Cancelled");
  else release(h); // a re-send "returns to Held and is released"
  promoteNext(s, c);
}

// ---- guards -------------------------------------------------------------------------------------
export type Guard = "none" | "idle" | "retryable";
function guardPass(s: S, c: Ctx, g: Guard): boolean {
  const cl = laneSt(s);
  if (g === "idle") { cell(s, c, "idle", cl); return cl === "Idle"; }
  cell(s, c, "retryable", cl);
  if (s.mode === "allow") { const a = c.endAtt ? A(s, c.endAtt) : undefined; return !!a && a.status === "unknown" && a.resends < CONFIG.retryTimes; }
  return cl === "Held" && A(s, s.head).resends < CONFIG.retryTimes;
}

// ---- endings ------------------------------------------------------------------------------------
export type EndKind = "success" | "failure" | "unknown" | "interrupt";
export const addressable = (s: S, id: number) => (s.mode === "allow" ? s.out.includes(id) : s.head === id);
// Step 1 of a turn: admit the ending (lane effect + promotion). Returns whether it was addressable.
function admit(s: S, c: Ctx, id: number, kind: EndKind) {
  const a = A(s, id);
  const cl = laneSt(s); // the cell is read before the ending changes the Attempt
  c.produced++;
  a.interrupting = false;
  a.status = kind === "success" ? "success" : kind === "failure" ? "failure" : "unknown";
  if (!addressable(s, id)) { s.old = s.old.filter((x) => x !== id); a.evid = true; c.handled++; return; } // evidence, routed by Attempt id (R7 L8)
  cell(s, c, kind, cl);
  c.handled++;
  if (s.mode === "allow") {
    if (kind === "success" || kind === "failure") s.out = s.out.filter((x) => x !== id);
    return; // unknown: stays in `out` for its own turn (HeldThisTurn)
  }
  if (kind === "success" || kind === "failure") {
    if (s.mode !== "cancel" && RULES.promoteOnResolve) promoteNext(s, c);
    else { s.head = 0; s.st = "Idle"; } // cancel concurrency has no W; the mutation "promote only on release" lands here
    return;
  }
  // unknown / interrupt
  if (kind === "interrupt" && !RULES.interruptHeld) { promoteNext(s, c); return; }
  if (s.mode === "serialize" && !RULES.serializeHolds) { promoteNext(s, c); return; }
  s.st = "Held"; // Held, or HeldThisTurn under cancel
}

// ---- turns --------------------------------------------------------------------------------------
export type Outcome = "ok" | "Denied" | "Unhandled" | "InvalidTurn";
export interface Spec { label: string; guard: Guard; acts: Act[]; outcome: Outcome }
export function turnEnd(s: S) {
  if (s.mode === "cancel" && s.st === "Held" && RULES.heldThisTurn) { A(s, s.head).evid = true; s.head = 0; s.st = "Idle"; } // "turn end -> Idle; the unknown is evidence"
  if (s.mode === "allow" && RULES.heldThisTurn)
    s.out = s.out.filter((i) => { const a = A(s, i); if (a.status === "unknown") { a.evid = true; return false; } return true; });
}
export function runTurn(s: S, c: Ctx, spec: Spec, pre?: () => number): Outcome {
  c.endAtt = pre ? pre() : 0;
  const promotedByAdmission = [...c.promoted];
  let outcome = spec.outcome;
  if (spec.guard !== "none" && !guardPass(s, c, spec.guard)) outcome = "Denied";
  if (outcome === "ok")
    for (const act of spec.acts) (act === "commit" ? doCommit : act === "retry" ? doRetry : doCancel)(s, c);
  // else: only the turn's own members are dropped; the ending's effects, publication and promotion stay (3.8.1)
  if (outcome !== "ok") {
    if (!RULES.invokeWhateverOutcome) for (const id of promotedByAdmission) A(s, id).noInvoke = true;
    if (!RULES.endingKeptOnDeniedTurn && pre) c.handled--;
  }
  turnEnd(s);
  return outcome;
}
export const commitsIn = (acts: Act[]) => acts.filter((a) => a === "commit").length;

// ---- Runtime steps (invoke, ack, server, ending, dispose, rebind, restore) ------------------------
export function doAck(s: S, id: number) { const a = A(s, id); a.acked = true; a.ackedEver = true; }
export function doAckRefused(s: S, c: Ctx, id: number) {
  const a = A(s, id);
  cell(s, c, "storageRefused", s.mode === "allow" ? laneSt(s) : s.head === id ? s.st : "Idle");
  if (s.mode === "allow") { s.out = s.out.filter((i) => i !== id); if (a.everSent) { a.status = "unknown"; a.evid = true; } else notSent(a, "StorageFailure"); return; }
  if (!a.everSent) { notSent(a, "StorageFailure"); if (s.mode === "cancel") { s.head = 0; s.st = "Idle"; } else promoteNext(s, c); return; }
  // a re-send: "returns to Held (it may have landed the first time)".
  // AMBIGUOUS: no unknown is delivered, so no handler runs for this Held (see RESULTS F5).
  a.status = "unknown";
  if (s.mode === "cancel") { a.evid = true; s.head = 0; s.st = "Idle"; } // INVENTED: HeldThisTurn exists only inside an ending's turn
  else s.st = "Held";
}
export function doInvoke(s: S, c: Ctx, id: number) {
  const a = A(s, id);
  cell(s, c, "invoked", s.mode === "allow" ? "InFlight" : s.head === id ? s.st : "Idle");
  if (a.status !== "waiting") viol(c, "inv4", `invoke of Attempt ${id} that is not waiting (${a.status})`);
  if (holds(s.mode))
    for (const o of s.atts)
      if (o.id !== id && o.everSent && ["unknown", "waiting", "wire", "notsent"].includes(o.status))
        viol(c, "inv2", `Attempt ${id} sent while older sent Attempt ${o.id} is unresolved (${o.status}${o.why ? " " + o.why : ""})`);
  a.status = "wire"; a.everSent = true; if (a.sends < CONFIG.resendCap + 1) a.sends++; // saturates with resends
  if (a.sends > a.resends + 1) viol(c, "inv4", `Attempt ${id} sent ${a.sends} times with ${a.resends} retries`);
  // a second copy of the same request in flight changes nothing (the first to land decides, the rest are idempotent no-ops), so one copy is kept
  if (!s.net.includes(id)) s.net.push(id);
}
export function doLand(s: S, id: number, refuse: boolean) {
  s.net.splice(s.net.indexOf(id), 1);
  if (refuse) { if (!s.applied.includes(id) && !s.refused.includes(id)) s.refused.push(id); return; }
  if (s.refused.includes(id) || s.applied.includes(id)) return; // dead id, or an idempotent duplicate
  s.applied.push(id); s.srvVal = A(s, id).val;
}
export function endingTurn(s: S, c: Ctx, id: number, kind: EndKind, spec: Spec): Outcome | "evidence" {
  if (!s.bound || !addressable(s, id)) { admit(s, c, id, kind); turnEnd(s); return "evidence"; }
  return runTurn(s, c, spec, () => { admit(s, c, id, kind); return id; });
}
export function doDispose(s: S, c: Ctx) { cell(s, c, "dispose"); s.bound = false; }
// Returns the Attempt whose `unknown { Restored }` is delivered to the new actor, else 0.
export function doStart(s: S, c: Ctx): number {
  s.bound = true;
  if (s.mode === "allow" || laneSt(s) === "Idle") return 0; // no lane: a fresh actor, not a rebind
  cell(s, c, "rebind");
  if (s.mode === "cancel") return 0;
  if (s.st === "Held") { c.produced++; c.handled++; return s.head; } // delivered once, W stays queued
  return 0; // InFlight: delivers nothing now
}
export function doReload(s: S, c: Ctx): number {
  const cl = laneSt(s);
  cell(s, c, "restore", cl);
  let delivered = 0;
  const ackedNow = (a: Att) => (CONFIG.ackPerSend ? a.acked : a.ackedEver);
  // W: never sent, ends NotSent { Restored }, delivered (MD C2)
  for (const w of s.W) notSent(A(s, w), "Restored");
  s.W = [];
  if (s.mode === "allow") {
    for (const i of s.out) { const a = A(s, i); if (a.status === "wire" || ackedNow(a)) { a.status = "unknown"; } else notSent(a, "Restored"); a.evid = true; } // INVENTED: no allow cell for restore
    s.out = [];
    return 0;
  }
  if (cl === "InFlight") {
    const h = A(s, s.head);
    if (h.status === "wire" || (h.status === "waiting" && ackedNow(h))) {
      h.status = "unknown"; h.interrupting = false; s.st = "Held";
      c.produced++; c.handled++; delivered = s.bound ? h.id : 0;
    } else { notSent(h, "Restored"); s.head = 0; s.st = "Idle"; } // never acknowledged: NotSent { Restored }; note the text does not promote
  }
  // Held: stays Held, not delivered again (R5 L6)
  return delivered;
}

// ---- flags and structure (inv 5) ----------------------------------------------------------------
export interface Flags { pending: boolean; uncertain: boolean; waiting: boolean; outstanding: number }
export function flagsOf(s: S): Flags { // the definitions, as functions of the state (3.8.1 "Flags")
  const st = laneSt(s);
  if (s.mode === "allow") return { pending: s.out.length > 0, uncertain: false, waiting: false, outstanding: s.out.length };
  return { pending: st === "InFlight", uncertain: st === "Held", waiting: s.W.length > 0, outstanding: s.W.length };
}
export function checkState(s: S): Viol[] {
  const v: Viol[] = [];
  const bad = (m: string) => v.push({ tag: "inv5", msg: m });
  const f = flagsOf(s);
  // oracle: derived from the Attempts' own fates, not from the lane state
  const live = s.atts.filter((a) => !a.evid && ["waiting", "wire", "unknown"].includes(a.status));
  const queued = s.atts.filter((a) => a.status === "queued");
  if (s.mode === "allow") {
    const p = live.some((a) => a.status !== "unknown");
    if (f.pending !== (p || false) && !(s.out.length > 0 && p)) bad(`allow: pending=${f.pending} but live Attempts=${live.map((a) => a.id)}`);
    if (live.some((a) => a.status === "unknown")) bad("allow: an unknown outlives its turn (HeldThisTurn)");
    if (live.length !== s.out.length) bad(`allow: out=${s.out} live=${live.map((a) => a.id)}`);
    return v;
  }
  const oPending = live.some((a) => a.status === "waiting" || a.status === "wire");
  const oUncertain = live.some((a) => a.status === "unknown");
  if (s.mode === "cancel") {
    if (s.st === "Held") bad("cancel: lane Held between turns (an unknown outlived its turn)");
    if (f.pending !== oPending) bad(`cancel: pending=${f.pending} oracle=${oPending}`);
    return v;
  }
  if (f.pending !== oPending) bad(`pending=${f.pending} but Attempts say ${oPending} (live ${live.map((a) => a.id + ":" + a.status)})`);
  if (f.uncertain !== oUncertain) bad(`uncertain=${f.uncertain} but Attempts say ${oUncertain} (live ${live.map((a) => a.id + ":" + a.status)})`);
  if (f.waiting !== (queued.length > 0)) bad(`waiting=${f.waiting} but queued commits=${queued.map((a) => a.id)}`);
  if (live.length > 1) bad(`more than one addressable Attempt: ${live.map((a) => a.id + ":" + a.status)}`);
  if (f.outstanding !== queued.length) bad(`outstanding=${f.outstanding} queued=${queued.length}`);
  if (s.st === "Idle" && (s.head !== 0 || s.W.length > 0)) bad(`Idle with head=${s.head} W=${s.W} ("Idle never has W")`);
  if (s.st !== "Idle" && !live.some((a) => a.id === s.head)) bad(`${s.st} but head ${s.head} is not a live Attempt`);
  return v;
}
