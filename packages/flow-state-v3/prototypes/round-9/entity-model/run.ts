// Random walk over a fake server + the judge. Oracle: at quiescence, every field unmarked equals the server.
import { ABSENT, Store, type E, type Flags } from "./store.ts";

type Cfg = {
  version: boolean;
  feed: "none" | "delta" | "whole";
  order: "fifo" | "shuffle";
  others: boolean;
  ack: Array<"whole" | "part" | "delta" | "none">;
  flags?: Flags;
};
type Row = Record<string, unknown>;
const FIELDS = ["$present", "a", "b", "rev"];
const rng = (s: number) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);

function walk(seed: number, cfg: Cfg, depth: number) {
  const r = rng(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]!;
  const FS = cfg.version ? FIELDS : FIELDS.filter((f) => f !== "rev");
  const st = new Store(FS, cfg.flags);
  const server: Row = { $present: true, a: 0, b: 0, rev: 1 };
  const trace: string[] = [];
  let hello = 0;
  let live = false;
  let frames: Array<{ carries: Row; at: number | undefined; rest: E["rest"] }> = [];
  let lastFrameLanded = 0;
  type Req = { kind: "read" | "part" | "repair"; from: number; snap: Row };
  let reads: Req[] = [];
  type W = { id: string; f: string; v: number; ack: Cfg["ack"][number]; from: number; sent: boolean; lost: boolean; applied: boolean; released: boolean };
  let writes: W[] = [];
  let n = 0;
  const view = (x: Row) => (cfg.version ? x : (({ rev, ...o }) => o)(x));
  const emit = (changed: string[]) => {
    server.rev = (server.rev as number) + 1;
    if (!live || cfg.feed === "none") return;
    const at = cfg.version ? (server.rev as number) : undefined;
    if (!server.$present) {
      frames.push({ carries: tomb(), at, rest: "none" });
      return;
    }
    if (cfg.feed === "whole") frames.push({ carries: view({ ...server }), at, rest: "none" });
    else {
      const c: Row = { $present: true };
      for (const f of changed) c[f] = server[f];
      if (cfg.version) c.rev = server.rev;
      frames.push({ carries: c, at, rest: "unchanged" });
    }
  };
  const tomb = (): Row => {
    const c: Row = {};
    for (const f of FS) c[f] = ABSENT;
    c.$present = false;
    return c;
  };
  const answer = (x: Row, whole: boolean): Pick<E, "carries" | "at" | "rest"> => {
    const at = cfg.version ? (x.rev as number) : undefined;
    if (!x.$present) return { carries: tomb(), at, rest: "none" };
    if (whole) return { carries: view({ ...x }), at, rest: "none" };
    const c: Row = { $present: true, a: x.a };
    if (cfg.version) c.rev = x.rev;
    return { carries: c, at, rest: live && cfg.feed !== "none" ? "unchanged" : "unknown" };
  };
  const repairIfNeeded = () => {
    if (st.wantsRepair() && !reads.some((q) => q.kind === "repair")) {
      for (const d of st.doubts) d.asked = true;
      reads.push({ kind: "repair", from: st.tick(), snap: { ...server } });
    }
  };
  const applyWrite = (w: W) => {
    if (w.applied || !server.$present) return;
    w.applied = true;
    server[w.f] = w.v;
    emit([w.f]);
  };
  const settleSuccess = (w: W) => {
    const touched = cfg.version ? [w.f, "rev"] : [w.f];
    const resp = { ...server };
    const at = cfg.version ? (resp.rev as number) : undefined;
    if (w.ack === "whole") st.judge({ ...answer(resp, true), from: w.from });
    else if (w.ack === "part" || w.ack === "delta") {
      const c: Row = { $present: resp.$present, [w.f]: resp[w.f] };
      if (cfg.version) c.rev = resp.rev;
      st.judge({ carries: resp.$present ? c : tomb(), at, from: w.from, rest: live && cfg.feed !== "none" ? "unchanged" : "unknown" });
    } else {
      st.judge({ carries: { [w.f]: w.v }, at: undefined, from: w.from, rest: "unchanged", claim: true });
      if (cfg.version) {
        const c = st.cells.rev;
        if (c) {
          c.claim = true;
          c.exact = false;
          c.landed = st.tick();
        }
      }
    }
    st.overlays = st.overlays.filter((o) => o.attempt !== w.id);
    // this Attempt's doubts close; and a success on field f closes resolved Attempts' doubts on f
    st.doubts = st.doubts.filter((d) => !(d.attempt === w.id));
    writes = writes.filter((x) => x !== w);
  };
  const actions: Array<[string, () => boolean]> = [
    ["read", () => (reads.push({ kind: "read", from: st.tick(), snap: { ...server } }), true)],
    ["part", () => (reads.push({ kind: "part", from: st.tick(), snap: { ...server } }), true)],
    ["answer.now", () => {
      const q = reads.shift();
      if (!q) return false;
      st.judge({ ...answer({ ...server }, q.kind !== "part"), from: q.from });
      if (q.kind === "repair") st.overlays = st.overlays.filter((o) => !o.ended);
      return true;
    }],
    ["answer.start", () => {
      const q = reads.shift();
      if (!q) return false;
      st.judge({ ...answer(q.snap, q.kind !== "part"), from: q.from });
      if (q.kind === "repair") st.overlays = st.overlays.filter((o) => !o.ended);
      return true;
    }],
    ["write", () => {
      if (writes.some((w) => !w.lost)) return false;
      const f = pick(["a", "b"]);
      const w: W = { id: `w${++n}`, f, v: 100 + n, ack: pick(cfg.ack), from: st.tick(), sent: true, lost: false, applied: false, released: false };
      writes.push(w);
      st.overlays.push({ attempt: w.id, fields: { [f]: w.v } });
      return true;
    }],
    ["write.ok", () => {
      const w = writes.find((x) => !x.lost);
      if (!w) return false;
      if (!server.$present) {
        st.overlays = st.overlays.filter((o) => o.attempt !== w.id);
        writes = writes.filter((x) => x !== w);
        return true;
      }
      applyWrite(w);
      settleSuccess(w);
      return true;
    }],
    ["write.fail", () => {
      const w = writes.find((x) => !x.lost);
      if (!w) return false;
      st.overlays = st.overlays.filter((o) => o.attempt !== w.id);
      writes = writes.filter((x) => x !== w);
      return true;
    }],
    ["write.lost", () => {
      const w = writes.find((x) => !x.lost);
      if (!w) return false;
      w.lost = true;
      const o = st.overlays.find((x) => x.attempt === w.id);
      if (o) o.ended = true;
      for (const f of cfg.version ? [w.f, "rev"] : [w.f]) st.doubts.push({ f, to: null, attempt: w.id });
      return true;
    }],
    ["landLate", () => {
      const w = writes.find((x) => x.lost && !x.applied);
      if (!w) return false;
      applyWrite(w);
      return true;
    }],
    ["retry.ok", () => {
      const w = writes.find((x) => x.lost && !x.released);
      if (!w || !server.$present) return false;
      applyWrite(w);
      settleSuccess(w);
      return true;
    }],
    ["release", () => {
      const w = writes.find((x) => x.lost && !x.released);
      if (!w) return false;
      w.released = true;
      st.doubts = st.doubts.map((d) => (d.attempt === w.id ? { ...d, resolved: true } : d));
      return true;
    }],
    ["expire", () => {
      // settleWithin passed: this request can no longer land. Its window closes now; a read started after it settles the field.
      const w = writes.find((x) => x.lost);
      if (!w) return false;
      const now = st.tick();
      st.doubts = st.doubts.map((d) => (d.attempt === w.id ? { f: d.f, to: now } : d));
      writes = writes.filter((x) => x !== w);
      st.overlays = st.overlays.filter((o) => o.attempt !== w.id);
      return true;
    }],
    ["reload", () => {
      // Requests on the wire become lost to us: reads vanish, writes mark. Cells are persisted; `restored` marks them via the gap.
      st.overlays = [];
      reads = [];
      for (const w of writes)
        if (!w.lost) {
          w.lost = true;
          for (const f of cfg.version ? [w.f, "rev"] : [w.f]) st.doubts.push({ f, to: null, attempt: w.id });
        }
      if (cfg.flags?.volatileDoubts) st.doubts = [];
      st.gap(st.tick());
      live = false;
      frames = [];
      return true;
    }],
    ["hello", () => {
      if (cfg.feed === "none" || live) return false;
      live = true;
      hello = st.tick();
      lastFrameLanded = hello;
      st.gap(hello);
      return true;
    }],
    ["drop", () => {
      if (!live) return false;
      live = false;
      frames = [];
      st.gap(st.tick());
      return true;
    }],
    ["frame", () => {
      if (!frames.length) return false;
      const i = cfg.order === "shuffle" ? Math.floor(r() * frames.length) : 0;
      const [f] = frames.splice(i, 1);
      st.judge({ carries: f!.carries, at: f!.at, from: cfg.order === "fifo" ? lastFrameLanded : hello, rest: f!.rest });
      lastFrameLanded = st.pos;
      return true;
    }],
    ["other", () => {
      if (!cfg.others || !server.$present) return false;
      const f = pick(["a", "b"]);
      server[f] = 500 + ++n;
      emit([f]);
      return true;
    }],
    ["otherRemove", () => {
      if (!cfg.others || !server.$present) return false;
      server.$present = false;
      server.a = server.b = null;
      emit(["$present"]);
      return true;
    }],
    ["otherBack", () => {
      if (!cfg.others || server.$present) return false;
      server.$present = true;
      server.a = 700 + ++n;
      server.b = 700 + ++n;
      emit(["$present", "a", "b"]);
      return true;
    }],
  ];
  const oracle = (when: string) => {
    const told = cfg.version && Object.values(st.cells).some((c) => c.at !== undefined && c.at >= (server.rev as number));
    if (cfg.others && (cfg.feed === "none" || !live) && !told) return; // ordinary staleness with no one to tell us
    for (const f of FS) {
      if (!server.$present && f !== "$present") continue;
      if (server.$present && !(f in st.cells)) continue;
      if (f === "rev" && !cfg.version) continue;
      const s = st.status(f);
      if (s.marked === null && s.value !== server[f])
        throw new Error(`${when}: ${f} shows ${String(s.value)}, server ${String(server[f])}\n${trace.join(" ")}\ncells ${JSON.stringify(st.cells, (k, v) => (typeof v === "symbol" ? "ABSENT" : v))}\ndoubts ${JSON.stringify(st.doubts)}\nseen ${st.seen} staleBefore ${st.staleBefore}`);
    }
  };
  // seed the store
  st.judge({ ...answer({ ...server }, true), from: st.tick() });
  for (let i = 0; i < depth; i++) {
    const [name, act] = pick(actions);
    if (act()) trace.push(name);
    repairIfNeeded();
  }
  // Drain: what is on the wire answers, frames arrive, then look. Lost writes stay lost: they are marked.
  let guard = 0;
  while ((reads.length || frames.length || writes.some((w) => !w.lost)) && guard++ < 200) {
    if (frames.length) {
      trace.push("~frame");
      actions.find((a) => a[0] === "frame")![1]();
    } else if (writes.some((w) => !w.lost)) {
      trace.push("~ok");
      actions.find((a) => a[0] === "write.ok")![1]();
    } else {
      const nm = r() < 0.5 ? "answer.now" : "answer.start";
      trace.push("~" + nm);
      actions.find((a) => a[0] === nm)![1]();
    }
    repairIfNeeded();
  }
  if (guard >= 200) throw new Error(`no drain: ${trace.join(" ")}`);
  oracle("quiet");
  return { reads: trace.filter((t) => /answer/.test(t)).length };
}

const configs: Array<[string, Cfg]> = [
  ["rec-delta-fifo", { version: true, feed: "delta", order: "fifo", others: true, ack: ["whole", "part", "none"] }],
  ["rec-delta-shuffle", { version: true, feed: "delta", order: "shuffle", others: true, ack: ["whole", "part", "none"] }],
  ["rec-whole-shuffle", { version: true, feed: "whole", order: "shuffle", others: true, ack: ["whole", "none"] }],
  ["rec-nofeed", { version: true, feed: "none", order: "fifo", others: false, ack: ["whole", "part", "none"] }],
  ["rec-nofeed-others", { version: true, feed: "none", order: "fifo", others: true, ack: ["whole", "part", "none"] }],
  ["none-delta-fifo", { version: false, feed: "delta", order: "fifo", others: true, ack: ["whole", "part", "none"] }],
  ["none-whole-shuffle", { version: false, feed: "whole", order: "shuffle", others: true, ack: ["whole", "none"] }],
  ["none-delta-shuffle", { version: false, feed: "delta", order: "shuffle", others: true, ack: ["whole", "none"] }],
  ["none-nofeed", { version: false, feed: "none", order: "fifo", others: false, ack: ["whole", "part", "none"] }],
];
const N = Number(process.argv[2] ?? 20000);
const mut = process.argv[3];
let bad = 0;
for (const [name, cfg] of configs) {
  const c = mut ? { ...cfg, flags: { [mut]: true } } : cfg;
  let fail: string | null = null;
  let answers = 0;
  for (let s = 1; s <= N && !fail; s++) {
    try {
      answers += walk(s * 7919, c, 4 + (s % 40)).reads;
    } catch (e) {
      fail = `seed ${s}: ${(e as Error).message}`;
    }
  }
  console.log(name.padEnd(22), fail ? `FAIL ${fail}` : `ok, ${N} walks, ${(answers / N).toFixed(1)} answers per walk`);
  if (fail) bad++;
}
process.exitCode = bad ? 1 : 0;
