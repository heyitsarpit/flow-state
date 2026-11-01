// Exhaustive BFS of proposal-v3 revision 2 T1-T4 (every). No final drain: oracle runs on every reachable state.
export type Cfg = { name: string; pos: boolean; C: boolean; replay: boolean; order: "old" | "new"; moreAt: boolean; doneAt: boolean; retention: boolean; reset: boolean; rooms: number; snapshot: "" | "nohead" | "head"; fills?: boolean; head?: boolean; fromNow?: boolean; dismiss?: boolean; reload?: boolean; signOut?: boolean; late?: boolean; shared?: boolean; stall?: boolean; wait?: boolean; clearLeaveBm?: boolean; leaveWipe?: boolean; fillLeave?: boolean; refresh?: boolean; strictBase?: boolean; resetOn: boolean; sdk: boolean; latestN: number; A: number; D: number; R: number; S: number };
export type Mut = Partial<Record<"holdsIgnored"|"keepRecordOnReset"|"moveDuringRepair"|"passThrough"|"flushOnAbandon"|"proofAnyFirst"|"listenedNotSaved"|"bookmarkNoRestart"|"twoNotices"|"pageUncapped"|"doneNoFreeze"|"noHeldBit"|"voidAtRegistration"|"noLiveBookmarkCheck"|"noStall"|"greetingWrites"|"heldInWait"|"noRaise"|"settleHeldFalse"|"bookmarkHeldTrue"|"noFloor",boolean>>;
type Sig = any;
type S = any;
const init = (c: Cfg): S => ({ greeted: null, fillsOff: c.fills === false, shared: !!c.shared, ep: 1, logs: Array(c.rooms).fill(0).map(() => [] as string[]), ret: 0, room: 0,
  rec: Array(c.rooms).fill(null), mem: [] as string[], acc: [] as string[], base: [] as string[], st: "Off", conn: null, inbox: [], q: [], buf: [], cur: null, read: false, reg: false, noted: false, owed: false, seen: null, n: { A: c.A, D: c.D, R: c.R, S: c.S, X: c.reset ? 1 : 0, T: c.wait ? 1 : 0 }, read0: false, snapDone: false, posted: 0 });
const lastS = (it: string) => Number(it.split(":")[2]);
const item = (s: S, k: number, e: number, q: number) => `${k}:${e}:${q}`;
const log = (s: S) => s.logs[s.room] as string[];
const pos = (c: Cfg, it: string) => c.pos ? Number(it.split(":")[2]) : null;
const holds = (s: S) => s.fillsOff ? false : s.shared ? s.mem.length > 0 : s.mem.some((i: string) => Number(i.split(":")[0]) === s.room);
const turn = (s: S) => { const b = s.rec[s.room]; if (b && s.st !== "Off" && (s.st !== "Pending" || s.mHeldInWait)) { const h = holds(s); b.held = h; } };
const un = (s: S, u: string[]) => { for (const i of u) if (!s.mem.includes(i) && !s.acc.includes(i)) s.acc.push(i); };
function queueMissed(s: S, why: string, m: Mut) { if (s.noted && !m.twoNotices) return; s.noted = true; s.q.push({ k: "missed", u: log(s).slice(), why, g: s.g||0 }); }
function abandon(s: S, m: Mut) { if (m.flushOnAbandon) s.buf.forEach((v: string) => s.q.push({ k: "value", v, move: true })); s.buf = []; s.read = false; s.seen = null; }
function startRepair(s: S, after: number | null, first = false) { s.st = "Repairing"; s.buf = []; s.upper = undefined; s.readHead = null; s.repEp = after != null ? (s.rec[s.room]?.ep ?? s.ep) : s.ep; s.cur = after; s.read = true; s.seen = null; s.firstRead = first; s.anchor = log(s).length ? lastS(log(s).at(-1)!) : 0; }
function connect(s: S, c: Cfg, m: Mut) { let b = s.rec[s.room]; const h = holds(s); s.st = "Connecting"; s.reg = false; s.noted = false; s.owed = false; s.voided = false; s.greeted = null;
  const isVoid = b && !h && (m.noHeldBit ? true : b.held) && c.fills !== false;
  s.mNoFloor = !!m.noFloor; if (isVoid) { s.voided = true; if (!m.voidAtRegistration) { b = s.rec[s.room] = { at: b.floor ?? null, floor: b.floor, ep: s.ep, held: false }; } }
  s.claim = isVoid ? (b?.floor ?? null) : (b?.at ?? null); s.conn = { registered: false, from: s.claim, fromEp: b?.ep ?? null }; s.inbox = []; s.buf = []; s.read = false; }
function place(s: S, c: Cfg, m: Mut) { if (c.wait) { s.st = "Pending"; s.conn = null; s.inbox = []; s.q = []; s.buf = []; s.read = false; } else connect(s, c, m); }
function register(s: S, c: Cfg, m: Mut, a: string, at?: number) {
  const first = !s.reg; s.reg = true; s.owed = false; s.noted = false; s.g = (s.g||0)+1; let b = s.rec[s.room]; const h = holds(s);
  if (!b && !h) { s.greeted = null; if (c.C && at != null && !m.greetingWrites) s.greeted = at; if (!m.listenedNotSaved && (!c.C || (at != null && m.greetingWrites))) s.rec[s.room] = { at: at ?? null, ep: s.ep, held: false }; s.ever = s.ever || {}; if (!s.ever[s.room]) { s.ever[s.room] = 1; if (!c.C || c.fromNow) for (const i of (s.snapLog ?? s.conn?.atReg ?? log(s))) if (!s.base.includes(i)) s.base.push(i); } if (c.C) startRepair(s, null, true); else s.st = "Live"; return; }
  if (!b) { b = s.rec[s.room] = { at: null, ep: s.ep, held: h }; }
  if (a === "proof" && (s.claim != null || !first || m.proofAnyFirst)) { if (s.st === "Repairing") return; s.st = "Live"; return; }
  if (s.voided && first) { s.voided = false; const fl = b.floor ?? null; s.rec[s.room] = { at: fl, floor: b.floor, ep: s.ep, held: false }; s.greeted = c.C ? (at ?? null) : null; if (c.C) { startRepair(s, fl, fl == null); return; } queueMissed(s, "Unproven", m); if (at != null && s.q.at(-1)?.k === "missed") s.q.at(-1).setAt = at; s.st = "Live"; return; }
  if (b.at != null) { if (c.C && !((s.stalls||0) >= 1 && !m.noStall)) startRepair(s, b.at); else { queueMissed(s, (s.stalls||0) >= 1 ? "Lost" : "Unproven", m); s.st = "Live"; } return; }
  s.greeted = c.C ? (at ?? null) : null; queueMissed(s, "Unproven", m); if (!c.C && at != null && s.q.at(-1)?.k === "missed") s.q.at(-1).setAt = at; if (c.C) startRepair(s, null, true); else s.st = "Live";
}
function onSig(s: S, c: Cfg, m: Mut, x: Sig) {
  if (s.st === "Waiting" || s.st === "Off" ) throw new Error("cannot occur " + x.k + " in " + s.st);
  if (x.k === "live") { if (s.st === "Repairing") { if (x.a === "proof") return; abandon(s, m); s.noted = false; startRepair(s, s.rec[s.room]?.at ?? null, s.rec[s.room]?.at == null); return; } register(s, c, m, x.a, x.at); return; }
  if (x.k === "reset") { s.g = (s.g||0)+1; abandon(s, m); const wasNone = !s.rec[s.room] && !holds(s); s.reg = true; s.noted = false; s.rec[s.room] = { at: 0, ep: x.ep, held: !!s.rec[s.room]?.held }; s.st = "Live"; if (!wasNone) queueMissed(s, "Reset", m); else log(s).forEach((i) => { if (!s.base.includes(i)) s.base.push(i); }); if (c.C) startRepair(s, 0); return; }
  if (x.k === "down") { abandon(s, m); s.st = "Dropped"; return; }
  if (x.k === "fail") { if (x.overflow && s.st === "Repairing" && s.moved !== true) s.stalls = (s.stalls||0) + 1; abandon(s, m); s.st = "Waiting"; s.conn = null; s.reg = false; s.inbox = []; return; }
  const v = x.v;
  if (s.st === "Connecting") { register(s, c, m, "live"); }
  if (s.st === "Dropped") { if (!s.rec[s.room] && !holds(s)) { s.rec[s.room] = { at: null, ep: s.ep, held: false }; s.q.push({ k: "value", v, move: true }); return; } if (!s.owed) { s.noted = false; queueMissed(s, "Unproven", m); s.owed = true; } s.q.push({ k: "value", v, move: true }); return; }
  if (s.st === "Repairing") { if (m.passThrough) { s.q.push({ k: "value", v, move: false }); return; } s.buf.push(v); return; }
  s.q.push({ k: "value", v, move: true });
}
function complete(s: S, at: number | null) { s.read = false; s.stalls = 0; const p = at ?? s.seen ?? s.greeted; s.q.push({ k: "settle", at: p ?? null, ep: s.repEp ?? s.ep, make: true }); if (false) s.q.push({ k: "settle", at: p, ep: s.repEp ?? s.ep, first: s.firstRead }); for (const v of s.buf) s.q.push({ k: "value", v, move: true }); s.buf = []; s.st = "Live"; }
function page(s: S, c: Cfg, m: Mut) {
  const L = log(s); if (s.repEp !== s.ep) { queueMissed(s, "Lost", m); s.repEp = s.ep; s.cur = null; s.seen = null; s.firstRead = true; s.upper = undefined; s.readHead = null; return; } const after = s.cur as number | null; if (c.fromNow && after == null) { complete(s, null); return; } if (s.firstRead) for (const i of L) if (lastS(i) <= s.ret && !s.base.includes(i)) s.base.push(i); let head = L.length ? lastS(L.at(-1)!) : (s.ret || 0); if (c.order === "new") { if (s.readHead == null) s.readHead = head; head = s.readHead; }
  if (after != null && c.retention && after < s.ret) { queueMissed(s, "Lost", m); s.q.at(-1) && (s.q.at(-1).u = L.filter((i: string) => lastS(i) <= s.ret)); s.cur = s.ret; return; }
  const rest = L.filter((i) => (after == null ? lastS(i) > s.ret : lastS(i) > after) && lastS(i) > s.ret);
  if (after == null && c.latestN) { const pg = rest.slice(-c.latestN); pg.forEach((v) => { s.q.push({ k: "value", v, move: false, frozen: true }); if (c.pos) s.seen = lastS(v); }); complete(s, c.doneAt ? head : null); return; }
  if (c.order === "old") {
    const pg = rest.slice(0, 1); pg.forEach((v) => { s.q.push({ k: "value", v, move: !!m.moveDuringRepair, frozen: true }); s.seen = c.pos ? lastS(v) : s.seen; });
    if (rest.length > 1) { s.cur = lastS(pg[0]); if (c.moreAt) s.q.push({ k: "settle", at: lastS(pg[0]), ep: s.repEp }); return; }
    if (pg.length) s.cur = lastS(pg[0]);
    complete(s, c.doneAt ? head : null); return;
  }
  // newest first: walk back from the newest; cur holds the upper bound in `upper`
  const upper = s.upper ?? Infinity; const r2 = rest.filter((i) => lastS(i) < upper); const pg = r2.slice(-1);
  pg.forEach((v) => { s.q.push({ k: "value", v, move: !!m.moveDuringRepair, frozen: true }); });
  if (r2.length > 1) { s.upper = lastS(pg[0]); return; }
  s.upper = undefined; complete(s, c.doneAt ? head : (pg.length ? lastS(pg[0]) : null));
}
function commit(s: S, c: Cfg, m: Mut): string | null {
  const d = s.q.shift(); if (!d) return null;
  if (d.k === "value") {
    if (s.disStrict?.includes(d.v)) s.err = `O6 ${d.v} came back after a clear`;
    if (!c.late && c.order === "old" && c.pos && !c.latestN && !c.retention) for (const i of log(s)) if (Number(i.split(":")[1]) === Number(d.v.split(":")[1]) && Number(d.v.split(":")[0]) === s.room && lastS(i) < lastS(d.v) && !s.mem.includes(i) && !s.acc.includes(i) && !(s.dis ?? []).includes(i) && !s.base.includes(i)) return `O3 ${d.v} delivered past ${i}`;
    if (!s.mem.includes(d.v)) s.mem.push(d.v);
    if (d.move && Number(d.v.split(":")[0]) === s.room) { const p = pos(c, d.v); if (!s.rec[s.room]) { if (!m.listenedNotSaved) s.rec[s.room] = { at: null, ep: s.ep }; } if (p != null && s.rec[s.room]) s.rec[s.room] = { ...s.rec[s.room], at: p, ep: Number(d.v.split(":")[1]) }; }
    turn(s);
  } else if (d.k === "missed") { un(s, d.u); s.notices = (s.notices || 0) + 1; if (d.setAt != null && s.rec[s.room] && s.rec[s.room].at == null) s.rec[s.room].at = d.setAt; turn(s); }
  else { if (d.at != null) { s.rec[s.room] = { held: m.settleHeldFalse ? false : holds(s), ...s.rec[s.room], at: d.at, ep: d.ep }; s.moved = true; s.stalls = 0; } else if (d.make && !s.rec[s.room]) s.rec[s.room] = { at: null, ep: d.ep, held: m.settleHeldFalse ? false : holds(s) }; }
  return null;
}
export function oracle(s: S, c: Cfg): string | null {
  const b = s.rec[s.room]; const dis = s.dis ?? [];
  if (!(c.late && !s.lDone) && s.st !== "Off" && s.st !== "Pending" && !(s.voided && !s.reg) && b && b.at != null) for (const i of log(s)) if (Number(i.split(":")[1]) === b.ep && lastS(i) <= b.at && !s.mem.includes(i) && !s.acc.includes(i) && !dis.includes(i) && !s.base.includes(i) && (lastS(i) > s.ret || !s.firstRead)) return `O1 bookmark ${b.at} passes ${i}`;
  if (!(c.late && !s.lDone) && s.st === "Live" && s.conn?.registered && s.inbox.length === 0 && s.q.length === 0 && s.buf.length === 0) for (const i of log(s)) if (!s.mem.includes(i) && !s.acc.includes(i) && !dis.includes(i) && !s.base.includes(i) && lastS(i) > s.ret) return `O2 quiet Live owes ${i}`;
  if (((c.C && (c.doneAt || c.head)) || (c.replay && c.snapshot === "head")) && (s.notices||0) > 0 && s.logs.every((l: string[]) => l.length === 0) && s.ep === 1) return `O5 false notice on an empty feed`;
  const ms = s.q.filter((d: any) => d.k === "missed").map((d: any) => d.g); if (new Set(ms).size < ms.length) return `O4 two notices for one interruption`;
  return null;
}
function moves(s0: S, c: Cfg, m: Mut): S[] {
  const out: S[] = []; const go = (f: (s: S) => void) => { const s = JSON.parse(JSON.stringify(s0)); f(s); out.push(s); };
  if ((s0.st !== "Off" || c.retention) && s0.n.A > 0) go((s) => { s.n.A--; const L = log(s); const q = (L.length ? lastS(L.at(-1)!) : (s.epBase||0)) + 1; const it = item(s, s.room, s.ep, q); L.push(it); if (s.conn?.registered) { if (s.inbox.filter((x: any) => x.k === "value").length >= 2) { s.conn = null; s.inbox.push({ k: "fail", overflow: true }); } else s.inbox.push({ k: "value", v: it }); } else if (s.conn) { s.conn.posted = [...(s.conn.posted ?? []), it]; } });
  if (s0.st === "Off" && c.late && !s0.snapLog) go((s) => { s.snapLog = log(s).slice(); place(s, c, m); });
  if (s0.st === "Off" && !c.late && !(c.snapshot && (c as any).nonEmpty && !s0.snapDone && !log(s0).length)) go((s) => { if (c.snapshot && !s.snapDone) { s.snapDone = true; s.snapLog = log(s).slice(); log(s).forEach((i: string) => s.mem.push(i)); if (c.snapshot === "head" && log(s).length) s.rec[s.room] = { at: c.pos ? lastS(log(s).at(-1)!) : null, ep: s.ep, held: m.bookmarkHeldTrue ? true : holds(s) }; if (c.snapshot === "head" && !log(s).length) s.rec[s.room] = { at: 0, ep: s.ep, held: !!m.bookmarkHeldTrue }; } place(s, c, m); });
  if (c.snapshot && s0.st === "Off" && !s0.snapDone && s0.n.A > 0) go((s) => { s.n.A--; const q = log(s).length + 1; log(s).push(item(s, s.room, s.ep, q)); });
  if (s0.conn && !s0.conn.registered && s0.st === "Connecting") go((s) => { s.conn.registered = true; s.conn.atReg = log(s).slice(); const headAt = c.head ? (log(s).length ? lastS(log(s).at(-1)!) : 0) : undefined; const f = s.conn.from; const e = s.conn.fromEp;
    if (f != null && e !== s.ep) s.inbox.push({ k: "reset", ep: s.ep });
    else if (f != null && c.replay && f >= s.ret) { s.inbox.push({ k: "live", a: "proof" }); log(s).filter((i: string) => lastS(i) > f).forEach((v: string) => s.inbox.push({ k: "value", v })); }
    else if (c.sdk && f == null) s.inbox.push({ k: "live", a: "proof" });
    else s.inbox.push({ k: "live", a: "unproven", at: headAt }); });
  if (s0.conn && s0.n.D > 0) go((s) => { s.n.D--; s.conn = null; s.inbox.push({ k: "fail" }); });
  if (s0.st === "Waiting" || s0.st === "Pending") go((s) => connect(s, c, m));
  if (c.wait && (s0.st === "Pending" || s0.st === "Connecting") && (s0.n.T ?? 0) > 0) go((s) => { s.n.T--; s.mHeldInWait = !!m.heldInWait; turn(s); });
  if (c.fillLeave && s0.q[0]?.k === "value" && s0.n.R > 0) go((s) => { s.n.R--; const v = s.q.shift().v; if (!s.mem.includes(v)) s.mem.push(v); const b = s.rec[s.room]; if (b && !m.noRaise && holds(s)) b.held = true; s.st = "Off"; s.conn = null; s.inbox = []; s.q = []; s.buf = []; s.read = false; });
  if (c.refresh && s0.st === "Live" && !s0.rfDone && s0.conn?.registered) go((s) => { s.rfDone = true; s.mem = []; s.rec[s.room] = { at: null, ep: s.ep, held: false }; s.q = s.q.filter((d: any) => d.k !== "settle"); s.q.forEach((d: any) => { if (d.k === "value") d.move = false; }); if (c.C) startRepair(s, null, true); else { s.noted = false; s.g = (s.g||0)+1; queueMissed(s, "Unproven", m); const x = s.q.pop(); if (x) s.q.unshift(x); } });
  if (c.dismiss && s0.st !== "Off" && !s0.dDone && s0.mem.length) go((s) => { s.dDone = true; s.dis = [...(s.dis ?? []), ...s.mem]; const at0 = s.rec[s.room]?.at; const frozenOk = (i: string) => at0 != null && lastS(i) <= at0 && !s.q.some((d: any) => d.v === i) && !s.inbox.some((x: any) => x.v === i) && !s.buf.includes(i); if (s.st === "Live" && s.conn?.registered) s.disStrict = [...(s.disStrict ?? []), ...s.mem.filter(frozenOk)]; s.mem = []; turn(s); });
  if (c.reload && s0.st !== "Off" && !s0.rlDone) go((s) => { s.rlDone = true; s.mem = []; s.q = []; s.buf = []; s.inbox = []; s.conn = null; s.read = false; place(s, c, m); });
  if (c.signOut && s0.st === "Off" && !s0.soDone && s0.mem.length) go((s) => { s.soDone = true; s.mem = []; });
  if (c.late && s0.st !== "Off" && s0.snapLog && !s0.lDone) go((s) => { s.lDone = true; s.snapLog.forEach((i: string) => { if (!s.mem.includes(i)) s.mem.push(i); }); const h = s.snapLog.length ? lastS(s.snapLog.at(-1)) : 0; const wasLive = s.st === "Live" || s.st === "Dropped" || s.st === "Repairing"; s.rec[s.room] = { at: h, ep: s.ep, held: m.bookmarkHeldTrue ? true : holds(s) }; s.q = s.q.filter((d: any) => d.k !== "settle"); s.q.forEach((d: any) => { if (d.k === "value") d.move = false; }); if (wasLive && !m.noLiveBookmarkCheck) { abandon(s, m); s.noted = false; s.q.forEach((d: any) => { if (d.k === "value") d.move = false; }); if (c.C) { if (s0.st === "Repairing") { startRepair(s, h); s.repEp = s.ep; } } else { s.g = (s.g||0)+1; queueMissed(s, "Unproven", m); const x = s.q.pop(); if (x) s.q.unshift(x); } } turn(s); });
  if (s0.st === "Repairing" && s0.read && (m.pageUncapped || !s0.q.some((d: any) => d.frozen))) go((s) => page(s, c, m));
  if (s0.inbox.length && !(s0.st === "Repairing" && s0.buf.length >= 2 && s0.inbox[0].k === "value")) go((s) => { const x = s.inbox.shift(); onSig(s, c, m, x); });
  if (s0.q.length) go((s) => { const e = commit(s, c, m); if (e) s.err = e; });
  if (s0.st !== "Off" && s0.n.R > 0) { go((s) => { s.n.R--; s.st = "Off"; s.stalls = 0; s.moved = false; s.conn = null; s.inbox = []; s.q = []; s.buf = []; s.read = false; s.upper = undefined; });
    if (c.leaveWipe && s0.st !== "Off") go((s) => { s.n.R--; s.st = "Off"; s.mem = []; s.conn = null; s.inbox = []; s.q = []; s.buf = []; s.read = false; s.upper = undefined; });
    if (c.clearLeaveBm && s0.st === "Live" && s0.conn?.registered && s0.mem.length && !s0.dDone && !s0.q.length && !s0.inbox.length) go((s) => { s.n.R--; s.dDone = true; s.dis = [...(s.dis ?? []), ...s.mem]; const at = s.rec[s.room]?.at; if (at != null) s.disStrict = [...(s.disStrict ?? []), ...s.mem.filter((i: string) => lastS(i) <= at)]; s.mem = []; s.rec[s.room] = { ...s.rec[s.room], held: false }; s.st = "Off"; s.conn = null; s.inbox = []; s.q = []; s.buf = []; s.read = false; });
    if (c.resetOn) go((s) => { s.n.R--; s.stalls = 0; s.st = "Off"; s.conn = null; s.inbox = []; s.q = []; s.buf = []; s.read = false; s.mem = s.mem.filter((i: string) => Number(i.split(":")[0]) !== s.room); s.ever = {}; s.base = []; s.acc = []; if (!m.keepRecordOnReset) s.rec[s.room] = null; }); }
  if (c.rooms > 1 && s0.st !== "Off" && s0.n.S > 0) go((s) => { s.n.S--; s.st = "Off"; s.mem = c.shared ? ["9:9:9"] : []; s.room = (s.room + 1) % c.rooms; s.conn = null; s.inbox = []; s.q = []; s.buf = []; s.read = false; s.upper = undefined; place(s, c, m); });
  if (c.retention && s0.st === "Off" && s0.ret === 0 && log(s0).length >= 1) go((s) => { s.ret = lastS(log(s).at(-1)!); });
  if (c.reset && s0.n.X > 0 && s0.st !== "Off") go((s) => { s.n.X--; s.ep++; s.epBase = 0; s.logs = s.logs.map(() => []); s.ret = 0; if (s.conn) { s.conn = null; s.inbox.push({ k: "fail" }); } });
  return out;
}
export function search(c: Cfg, m: Mut, cap = 120000, par?: Map<string,string>) {
  const seen = new Set<string>(); let frontier = [init(c)]; seen.add(JSON.stringify(frontier[0])); let n = 1;
  while (frontier.length) { const nx: S[] = []; for (const s of frontier) { const e = s.err ?? oracle(s, c); if (e) { if (par) { const ch:string[]=[]; let k:string|undefined=JSON.stringify(s); while(k){const x=JSON.parse(k);ch.unshift(`${x.st} log=${x.logs[x.room]} mem=${x.mem} rec=${JSON.stringify(x.rec[x.room])} in=${x.inbox.map((i:any)=>i.k+(i.v??i.a??""))} q=${x.q.map((d:any)=>d.k+(d.v??d.at??""))} buf=${x.buf} cur=${x.cur} ret=${x.ret} ep=${x.ep}`);k=par.get(k);} console.log(ch.slice(-16).join("\n")); } return { states: n, hit: e, capped: false }; } for (const t of moves(s, c, m)) { const k = JSON.stringify(t); if (!seen.has(k)) { seen.add(k); par?.set(k, JSON.stringify(s)); n++; nx.push(t); if (n >= cap) return { states: n, hit: null, capped: true }; } } } frontier = nx; }
  return { states: n, hit: null, capped: false };
}
