// BFS of T5 + T6 with the fence (latest). Adapter emits into a queue; Flow pulls; machine admits later.
type S = any; export type LM = { noFence?: boolean; noSlotConn?: boolean };
const emitV = (s: S, v: any, m: LM) => { if (m.noFence) { /* slot keeps its place */ const i = s.q.findIndex((x: any) => x.k === "v"); if (i >= 0) s.q[i] = { k: "v", ...v }; else s.q.push({ k: "v", ...v }); return; } const l = s.q.at(-1); if (l?.k === "v") s.q[s.q.length - 1] = { k: "v", ...v }; else { s.q = s.q.filter((x: any, i: number) => !(x.k === "v" && s.q.slice(i + 1).some((y: any) => y.k !== "v"))); s.q.push({ k: "v", ...v }); } };
function moves(s0: S, m: LM): S[] { const o: S[] = []; const go = (f: (s: S) => void) => { const s = JSON.parse(JSON.stringify(s0)); f(s); o.push(s); };
  if (s0.n > 0 && s0.up) go((s) => { s.n--; s.srv++; emitV(s, { v: s.srv, cur: true }, m); });
  if (s0.n > 0 && !s0.up) go((s) => { s.n--; emitV(s, { v: s.srv, cur: false }, m); });
  if (s0.d > 0 && s0.up) go((s) => { s.d--; s.up = false; s.q.push({ k: "down" }); });
  if (!s0.up) go((s) => { s.up = true; s.q.push({ k: "live" }); });
  if (s0.q.length) go((s) => { const x = s.q.shift(); if (x.k === "down") { s.st = "Dropped"; s.conf = false; s.slot = null; s.conn2++; } else if (x.k === "live") { s.st = "Live"; s.conf = false; s.conn2++; } else if (s.st === "Live") { s.last = x.v; s.conf = true; s.lastCur = x.cur; if (x.v !== s.heard) { s.slot = { v: x.v, c: s.conn2, cur: x.cur }; } else s.slot = null; } else { s.last = x.v; s.lastCur = false; } });
  if (s0.slot) go((s) => { if (s.st === "Live" && (m.noSlotConn || s.slot.c === s.conn2)) { s.heard = s.slot.v; if (!s.slot.cur) s.err = "machine heard a cached value"; if (s.conf && s.last !== s.heard) s.err2 = 1; } s.slot = null; });
  return o; }
export function searchL(m: LM) { const st: S = { q: [], up: true, st: "Live", conf: false, last: null, lastCur: false, heard: null, slot: null, srv: 0, n: 4, d: 2, conn2: 0 }; const seen = new Set([JSON.stringify(st)]); let f = [st]; let n = 1;
  while (f.length) { const nx: S[] = []; for (const s of f) { if (s.err) return { n, hit: s.err }; if (s.conf && !s.lastCur) return { n, hit: "row value current but cached" }; if (s.q.filter((x: any) => x.k === "v").length > 1) return { n, hit: "more than one value queued" }; for (const t of moves(s, m)) { const k = JSON.stringify(t); if (!seen.has(k)) { seen.add(k); n++; nx.push(t); } } } f = nx; } return { n, hit: null }; }
