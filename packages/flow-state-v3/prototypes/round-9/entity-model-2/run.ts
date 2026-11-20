// Random walk over a fake server + the judge of entity-proposal-2.
// Usage: node --experimental-transform-types --no-warnings run.ts <walks> [suite] [flags,comma,separated]
// Oracles, all at quiescence:
//   (a) under-marking: every unmarked field equals the server, with a per-field, by-name excuse for "others changed it and nobody told us"
//   (b) stuck: no conflict left with nothing in flight, unless the version truly cannot pass what we hold
//   (c) exit: one whole read, asked now, ends every mark that does not name a reason; a given-up Attempt reads `unconfirmed`, not `uncertain`
//   (d) scope: a field nothing touched is never `uncertain`
//   (e) spurious: no doubt between values Schema equivalence calls equal
//   (f) late: after (c), a lost write lands; its fields must still be marked
import { ABSENT, MAX_ASKS, Store, type Flags, type Conflict } from "./store.ts";

type Cfg = {
  version: boolean;
  collection?: boolean;
  feed: "none" | "delta" | "whole";
  order: "fifo" | "shuffle";
  others: boolean;
  ack: Array<"whole" | "part" | "none">;
  covers?: boolean; // the session declares `.covers`; false: only records it has delivered
  uncovered?: boolean; // a live session whose `.covers` excludes this record: no frames, no gap
};
type World = {
  tie?: boolean;
  resetOnBack?: boolean;
  answers?: boolean;
  lag?: boolean;
  boxed?: boolean;
  arrivalLie?: boolean;
  lossy?: boolean;
  noDedupe?: boolean;
  feedOmitsDerived?: boolean;
  noAlsoChanges?: boolean;
};
type Row = Record<string, unknown>;
type Kind = "held" | "free" | "volatile"; // free: bare, allow, cancel: no hold. volatile: a non-persisted machine's write on a persisted entity
const rng = (s: number) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);

export const stat = { walks: 0, repairs: 0, maxRepairs: 0, raised: 0, spurious: 0, wentBackEnds: 0, marksQuiet: 0, fieldsQuiet: 0, refreshes: 0, openEnds: 0, finalOpenFields: 0, overdue: 0 };

function walk(seed: number, cfg: Cfg, depth: number, W: World, fl: Flags) {
  const r = rng(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]!;
  const FS = cfg.version ? ["$present", "a", "b", "t", "rev"] : ["$present", "a", "b", "t"];
  const st = new Store(fl);
  st.perCollection = !!cfg.collection && !fl.perCollectionBehind;
  const box = (x: unknown) => (W.boxed && typeof x === "number" ? { n: x } : x);
  const unbox = (x: unknown) => (W.boxed && typeof x === "object" && x !== null ? (x as { n: unknown }).n : x);
  const server: Row = { $present: true, a: 0, b: 0, t: 0, rev: 1 };
  const trace: string[] = [];
  let hello = 0;
  let live = false;
  let delivered = false;
  type Frame = { carries: Row; at: number | undefined };
  let frames: Frame[] = [];
  let lastFrameLanded = 0;
  type Req = { kind: "read" | "part" | "repair" | "refresh"; from: number; snap: Row; clock: number; pick?: "a" | "b" };
  let reads: Req[] = [];
  type W_ = { id: string; f: string; v: number; ack: Cfg["ack"][number]; kind: Kind; basedOn?: number; from: number; lost: boolean; applied: boolean; refused: boolean };
  let writes: W_[] = [];
  const dup: W_[] = [];
  let n = 0;
  let clock = 0;
  let lastBack = 0;
  let reloaded = false;
  let repairs = 0;
  const untold: Record<string, { clock: number; rev: number }> = {};
  const proven: Record<string, number> = {};
  const touched = new Set<string>();
  let lastChangeSnap: Row = { ...server };
  let snapshot: { cells: string; seen: unknown } | null = null;
  const answersLive = [{ pick: "a" as const, gen: 0 }, { pick: "b" as const, gen: 0 }];
  st.covered = () => live && (!!cfg.covers || delivered) && !cfg.uncovered;

  const tomb = (): Row => {
    const c: Row = {};
    for (const f of FS) c[f] = ABSENT;
    c.$present = false;
    return c;
  };
  const view = (x: Row): Row => {
    const o: Row = { $present: x.$present, a: box(x.a), b: box(x.b), t: box(x.t) };
    if (cfg.version) o.rev = x.rev;
    return o;
  };
  const verAt = (x: Row) => (cfg.version ? (x.rev as number) : undefined);
  const emit = (changed: string[], own = false) => {
    if (server.$present) server.t = (server.a as number) + (server.b as number);
    lastChangeSnap = { ...server };
    const bump = !(W.tie && r() < 0.5);
    if (bump) server.rev = (server.rev as number) + 1;
    clock++;
    const all = [...changed, "t", "rev"];
    for (const f of all) touched.add(f);
    const feeding = live && cfg.feed !== "none" && !cfg.uncovered;
    if (!feeding && !own) for (const f of all) untold[f] = { clock, rev: bump && !cfg.collection && !W.resetOnBack ? (server.rev as number) : 0 };
    if (!feeding) return;
    if (W.lossy && r() < 0.2) return;
    const at = verAt(server);
    if (!server.$present) return void frames.push({ carries: tomb(), at });
    if (cfg.feed === "whole") return void frames.push({ carries: view(server), at });
    const c: Row = { $present: true };
    for (const f of changed) c[f] = box(server[f]);
    if (!W.feedOmitsDerived) c.t = box(server.t);
    if (cfg.version) c.rev = server.rev;
    frames.push({ carries: c, at });
  };
  const partOf = (x: Row, f: "a" | "b"): Row => {
    if (!x.$present) return tomb();
    const c: Row = fl.noPresent ? { [f]: box(x[f]) } : { $present: true, [f]: box(x[f]) };
    if (cfg.version) c.rev = x.rev;
    return c;
  };
  const prove = (c: Row, at: number) => {
    for (const f of Object.keys(c)) proven[f] = Math.max(proven[f] ?? 0, at);
  };
  const land = (q: Req, x: Row, atClock: number) => {
    const carries = q.kind === "part" ? partOf(x, "a") : q.kind === "refresh" ? partOf(x, q.pick!) : x.$present ? view(x) : tomb();
    // Restarted versions: H2 promises only a read asked after everything we knew. An older answer can look newer and replace a proof.
    if (W.resetOnBack) {
      const asked = Object.values(st.cells).every((c) => q.from >= c.landed) && q.from >= lastBack;
      for (const f of Object.keys(carries)) if (!asked) proven[f] = 0;
      if (asked) prove(carries, atClock);
    } else prove(carries, atClock);
    st.judge({ carries, at: verAt(x), from: q.from, ...(q.kind === "refresh" ? { origin: "refresh" as const } : {}) });
    if (q.kind === "repair") st.overlays = st.overlays.filter((o) => !o.ended);
  };
  const ask = () => {
    if (st.wantsRepair() && !reads.some((q) => q.kind === "repair")) {
      st.asking();
      stat.repairs++;
      repairs++;
      reads.push({ kind: "repair", from: st.tick(), snap: { ...server }, clock });
    }
    if (W.answers)
      for (const an of answersLive) {
        const fields = [an.pick, ...(cfg.version ? ["rev"] : [])];
        if (st.gen > an.gen && fields.some((f) => st.clearable(f)) && !reads.some((q) => q.kind === "refresh" && q.pick === an.pick)) {
          an.gen = st.gen;
          stat.refreshes++;
          reads.push({ kind: "refresh", pick: an.pick, from: st.tick(), snap: { ...server }, clock });
        }
      }
  };
  const applyWrite = (w: W_, own = true) => {
    if (w.applied || !server.$present) return;
    if (w.basedOn !== undefined && server.rev !== w.basedOn) {
      w.refused = true;
      return;
    }
    w.applied = true;
    server[w.f] = w.v;
    emit([w.f], own);
  };
  const end = (w: W_) => {
    st.overlays = st.overlays.filter((o) => o.attempt !== w.id);
    st.closeAttempt(w.id);
    writes = writes.filter((x) => x !== w);
  };
  const settleSuccess = (w: W_) => {
    if (w.refused) return end(w); // a 412: definite. A guarded first send cannot land either
    const resp = { ...server };
    const at = verAt(resp);
    const touch = [w.f, ...(W.noAlsoChanges ? [] : ["t"]), ...(cfg.version ? ["rev"] : [])];
    let carried: Row = {};
    if (w.ack === "whole") carried = resp.$present ? view(resp) : tomb();
    else if (w.ack === "part" && resp.$present) carried = partOf(resp, w.f as "a" | "b");
    else if (w.ack === "part") carried = tomb();
    if (Object.keys(carried).length) {
      if (!W.resetOnBack) prove(carried, clock);
      else for (const f of Object.keys(carried)) proven[f] = 0;
      st.judge({ carries: carried, at, from: w.from });
    }
    for (const f of touch) {
      if (f in carried) continue;
      if (fl.alsoChangesClean && f === "t") continue;
      st.claim(f, f === w.f ? { v: box(w.v) } : undefined, w.from);
    }
    if (fl.noDedupe2) dup.push(w);
    end(w);
    if (fl.rule32Clears)
      st.doubts = st.doubts.filter((d) => !(d.kind === "open" && d.given !== null));
  };
  const lostWrite = (w: W_) => {
    w.lost = true;
    const o = st.overlays.find((x) => x.attempt === w.id);
    if (o) o.ended = true;
    const given = w.kind === "free" ? st.tick() : null;
    for (const f of [w.f, ...(W.noAlsoChanges ? [] : ["t"]), ...(cfg.version ? ["rev"] : [])]) st.open(f, w.id, given, w.basedOn);
  };

  const actions: Array<[string, () => boolean]> = [
    ["read", () => (reads.push({ kind: "read", from: st.tick(), snap: { ...server }, clock }), true)],
    ["part", () => (reads.push({ kind: "part", from: st.tick(), snap: { ...server }, clock }), true)],
    ["answer.now", () => {
      const q = reads.shift();
      if (!q) return false;
      land(q, { ...server }, clock);
      return true;
    }],
    ["answer.start", () => {
      const q = reads.shift();
      if (!q) return false;
      land(q, q.snap, q.clock);
      return true;
    }],
    ["answer.fail", () => {
      const q = reads.shift();
      if (!q) return false;
      if (q.kind === "repair") for (const d of st.doubts) if (d.kind === "conflict") d.asked = false;
      return true;
    }],
    ["write", () => {
      if (writes.some((w) => !w.lost)) return false;
      const f = pick(["a", "b"]);
      const kind = pick<Kind>(["held", "free", "volatile"]);
      const guard = cfg.version && !cfg.collection && !W.resetOnBack && r() < 0.25 && st.cells.rev?.exact ? (st.cells.rev.at as number) : undefined;
      const w: W_ = { id: `w${++n}`, f, v: 100 + n, ack: pick(cfg.ack), kind, ...(guard === undefined ? {} : { basedOn: guard }), from: st.tick(), lost: false, applied: false, refused: false };
      writes.push(w);
      touched.add(f);
      touched.add("t");
      touched.add("rev");
      st.overlays.push({ attempt: w.id, fields: { [f]: box(w.v) } });
      return true;
    }],
    ["write.ok", () => {
      const w = writes.find((x) => !x.lost);
      if (!w) return false;
      if (!server.$present) return end(w), true;
      applyWrite(w);
      settleSuccess(w);
      return true;
    }],
    ["write.fail", () => {
      const w = writes.find((x) => !x.lost);
      if (!w) return false;
      end(w);
      return true;
    }],
    ["write.lost", () => {
      const w = writes.find((x) => !x.lost);
      if (!w) return false;
      lostWrite(w);
      return true;
    }],
    ["landLate", () => {
      const w = writes.find((x) => x.lost && !x.applied && !x.refused);
      if (!w) return false;
      applyWrite(w);
      return true;
    }],
    ["retry.ok", () => {
      // Only a Held lane can re-send: a persisted hold, or a volatile lane in the same session.
      const w = writes.find((x) => x.lost && x.kind !== "free" && !st.doubts.some((d) => d.kind === "open" && d.attempt === x.id && d.given !== null));
      if (!w || !server.$present) return false;
      if (W.noDedupe && !w.applied) dup.push({ ...w });
      applyWrite(w);
      settleSuccess(w);
      return true;
    }],
    ["dup.land", () => {
      const w = dup.shift();
      if (!w || !server.$present) return false;
      server[w.f] = w.v;
      emit([w.f], true);
      return true;
    }],
    ["release", () => {
      const w = writes.find((x) => x.lost && !st.doubts.some((d) => d.kind === "open" && d.attempt === x.id && d.given !== null));
      if (!w) return false;
      st.give(w.id, st.tick());
      return true;
    }],
    ["reload", () => {
      reloaded = true;
      if (W.lag) return false; // a reload forgets the floor: lag after a reload is the stated limit, not this suite
      if (snapshot) {
        st.cells = JSON.parse(snapshot.cells, (_, v) => (v === "$ABSENT" ? ABSENT : v));
        st.seen = snapshot.seen as number | undefined;
      }
      st.overlays = [];
      reads = [];
      const boot = st.tick();
      // Conflicts are memory. `store/unsettled` is what survives: written ahead of every first send.
      st.doubts = st.doubts.filter((d) => d.kind === "open");
      for (const w of writes)
        if (!w.lost) {
          w.lost = true;
          for (const f of [w.f, ...(W.noAlsoChanges ? [] : ["t"]), ...(cfg.version ? ["rev"] : [])]) st.doubts.push({ kind: "open", f, attempt: w.id, given: null, quiet: false, ...(w.basedOn === undefined ? {} : { basedOn: w.basedOn }) });
        }
      for (const w of writes) {
        const row = !(fl.noRowFree && w.kind === "free") && !(fl.noRowVolatile && w.kind === "volatile");
        if (!row) st.closeAttempt(w.id);
        else if (w.kind !== "held") for (const d of st.doubts) if (d.kind === "open" && d.attempt === w.id && d.given === null) d.given = boot; // no lane came back: given up by the reload
      }
      if (fl.volatileDoubts) st.doubts = [];
      for (const d of st.doubts) if (d.kind === "open") d.quiet = false;
      if (st.doubts.length) st.forced = true;
      for (const c of Object.values(st.cells)) c.landed = Math.min(c.landed, boot); // restored: normalised to the boot floor
      if (!fl.reloadNoGap) st.gap(boot);
      live = false;
      delivered = false;
      frames = [];
      return true;
    }],
    ["hello", () => {
      if (cfg.feed === "none" || live) return false;
      live = true;
      delivered = false;
      hello = st.tick();
      lastFrameLanded = hello;
      for (const f of Object.keys(untold)) if (!cfg.uncovered) delete untold[f]; // a session starts: the gap mark now owes these
      if ((!cfg.uncovered || fl.gapEntityWide) && !fl.helloNoGap) st.gap(hello);
      return true;
    }],
    ["drop", () => {
      if (!live) return false;
      live = false;
      delivered = false;
      frames = [];
      if ((!cfg.uncovered || fl.gapEntityWide) && !fl.dropNoGap) st.gap(st.tick());
      return true;
    }],
    ["frame", () => {
      if (!frames.length) return false;
      const i = cfg.order === "shuffle" && !W.arrivalLie ? Math.floor(r() * frames.length) : W.arrivalLie ? Math.floor(r() * frames.length) : 0;
      const [f] = frames.splice(i, 1);
      delivered = true;
      prove(f!.carries, clock);
      st.judge({ carries: f!.carries, at: f!.at, from: cfg.order === "fifo" || W.arrivalLie ? lastFrameLanded : hello });
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
      server.a = server.b = server.t = null;
      emit(["$present", "a", "b"]);
      return true;
    }],
    ["otherBack", () => {
      if (!cfg.others || server.$present) return false;
      server.$present = true;
      if (W.resetOnBack) {
        server.rev = 0;
        lastBack = st.tick();
      }
      server.a = 700 + ++n;
      server.b = 700 + ++n;
      emit(["$present", "a", "b"]);
      return true;
    }],
    ["elsewhere", () => {
      if (!cfg.collection) return false; // the collection's version moves; this record does not
      server.rev = (server.rev as number) + 1;
      return true;
    }],
    ["answer.lag", () => {
      if (!W.lag) return false;
      const q = reads.shift();
      if (!q) return false;
      const lagged = { ...q.snap, ...(r() < 0.5 ? { a: 0, b: 0, t: 0, rev: 1, $present: true } : {}) }; // a replica behind the write
      land(q, lagged, 0); // a replica proves nothing about others' changes; our own write's floor still has to catch it
      return true;
    }],
  ];
  const act = (nm: string) => actions.find((a) => a[0] === nm)![1]();
  const fail = (why: string): never => {
    throw new Error(`${why}\n${trace.join(" ")}\ncells ${JSON.stringify(st.cells, (_, v) => (typeof v === "symbol" ? "ABSENT" : v))}\ndoubts ${JSON.stringify(st.doubts)}\nseen ${st.seen} staleBefore ${st.staleBefore} server ${JSON.stringify(server)}`);
  };
  const excused = (f: string) => {
    if (!cfg.others || (live && cfg.feed !== "none" && !cfg.uncovered)) return false;
    const u = untold[f];
    if (!u || u.clock <= (proven[f] ?? 0)) return false;
    if (cfg.version && u.rev > 0) {
      const maxAt = Math.max(0, ...Object.values(st.cells).map((c) => (c.exact && c.at !== undefined ? c.at : 0)));
      if (maxAt >= u.rev) return false; // a version told us something moved past this change: it owes a mark
    }
    return true;
  };
  const oracleA = (when: string) => {
    for (const f of FS) {
      if (!server.$present && f !== "$present") continue;
      if (server.$present && !(f in st.cells)) continue;
      if (excused(f)) continue;
      if (f === "rev" && cfg.collection) continue; // the collection's version is not this record's value
      const s = st.status(f);
      if (s.marked === null && unbox(s.value) !== server[f]) fail(`${when}: ${f} shows ${String(unbox(s.value))}, server ${String(server[f])}`);
    }
  };
  const canPass = (f: string) => {
    const c = st.cells[f];
    if (!cfg.version || !c || c.at === undefined) return true;
    return (server.rev as number) > c.at;
  };
  // seed the store
  st.judge({ carries: view(server), at: verAt(server), from: st.tick() });
  for (let i = 0; i < depth; i++) {
    const [name, a] = pick(actions);
    if (a()) trace.push(name);
    ask();
    if (fl.__snapshots !== false && r() < 0.2) snapshot = { cells: JSON.stringify(st.cells, (_, v) => (typeof v === "symbol" ? "$ABSENT" : v)), seen: st.seen };
  }
  // Drain: what is on the wire answers, frames arrive. Lost writes stay lost: they are marked.
  let guard = 0;
  while ((reads.length || frames.length || writes.some((w) => !w.lost)) && guard++ < 300) {
    if (frames.length) {
      trace.push("~frame");
      act("frame");
    } else if (writes.some((w) => !w.lost)) {
      trace.push("~ok");
      act("write.ok");
    } else {
      const nm = r() < 0.5 ? "answer.now" : "answer.start";
      trace.push("~" + nm);
      act(nm);
    }
    ask();
  }
  if (guard >= 300) fail("no drain (repair loop?)");
  stat.repairs += 0;
  stat.maxRepairs = Math.max(stat.maxRepairs, repairs);
  stat.raised += st.conflictsRaised;
  stat.spurious += st.spurious;
  // (e)
  if (st.spurious) fail(`spurious doubt: ${st.spurious} between equal values`);
  // (a)
  oracleA("quiet");
  // (d) scope
  for (const f of FS) if (!touched.has(f) && st.status(f).marked === "uncertain") fail(`scope: ${f} is uncertain and nothing touched it`);
  if (cfg.collection) for (const f of FS) if (st.status(f).marked === "unconfirmed:behind") fail(`scope: ${f} marked behind by a collection's version`);
  // (d') a flap of a session whose `.covers` excludes this record says nothing about it
  if (cfg.uncovered && !reloaded) for (const f of FS) if (st.status(f).marked === "unconfirmed:gap") fail(`scope: ${f} marked by a gap in a session that does not cover it`);
  // (b) stuck
  for (const d of st.doubts)
    if (d.kind === "conflict") {
      if (d.wentBack && !canPass(d.f)) continue; // named: VersionWentBack
      if (d.asks >= MAX_ASKS) {
        stat.overdue++; // named: RepairOverdue. Three asks, each overtaken. The exit oracle still has to clear it
        continue;
      }
      fail(`stuck: conflict on ${d.f} with nothing in flight`);
    }
  for (const f of FS) {
    stat.fieldsQuiet++;
    const m = st.status(f).marked;
    if (m && m !== "absent" && m !== "missing") stat.marksQuiet++;
  }
  // (c) exit: one whole read, asked now
  const from = st.tick();
  prove(view(server), clock);
  st.judge({ carries: server.$present ? view(server) : tomb(), at: verAt(server), from });
  st.overlays = st.overlays.filter((o) => !o.ended);
  for (const f of FS) {
    if (!server.$present && f !== "$present") continue;
    const s = st.status(f);
    if (s.marked === null || s.marked === "absent" || s.marked === "missing") continue;
    const mine = st.doubts.filter((d) => d.f === f);
    if (mine.some((d) => d.kind === "conflict")) {
      const c = mine.find((d) => d.kind === "conflict") as Conflict;
      if (c.wentBack && !canPass(f)) {
        stat.wentBackEnds++;
        continue;
      }
      fail(`exit: ${f} still in conflict after a fresh whole read`);
    }
    if (mine.some((d) => d.kind === "open")) {
      stat.finalOpenFields++;
      const anyHeld = mine.some((d) => d.kind === "open" && d.given === null);
      if (!anyHeld && s.marked !== "unconfirmed:mayLand") fail(`level: ${f} reads ${s.marked} with its Attempt given up and a read after that`);
      continue; // named: MayStillLand
    }
    if (W.resetOnBack && s.marked === "unconfirmed:behind" && (st.seen as number) > (server.rev as number)) continue; // named: VersionWentBack, `seen` cannot come down
    fail(`exit: ${f} reads ${s.marked} after a fresh whole read`);
  }
  if (st.doubts.some((d) => d.kind === "open")) stat.openEnds++;
  oracleA("after a fresh read");
  // (f) late: the thing the marks exist for
  const late = writes.find((w) => w.lost && !w.applied && !w.refused);
  if (late && r() < 0.7) {
    trace.push("~landLate");
    applyWrite(late);
    while (frames.length) {
      trace.push("~frame");
      act("frame");
    }
    oracleA("after a late landing");
  }
  return { reads: trace.filter((t) => /answer/.test(t)).length };
}

const base: Array<[string, Cfg]> = [
  ["rec-delta-fifo", { version: true, feed: "delta", order: "fifo", others: true, ack: ["whole", "part", "none"], covers: true }],
  ["rec-delta-shuffle", { version: true, feed: "delta", order: "shuffle", others: true, ack: ["whole", "part", "none"], covers: true }],
  ["rec-whole-shuffle", { version: true, feed: "whole", order: "shuffle", others: true, ack: ["whole", "none"], covers: true }],
  ["rec-nofeed", { version: true, feed: "none", order: "fifo", others: false, ack: ["whole", "part", "none"] }],
  ["rec-nofeed-others", { version: true, feed: "none", order: "fifo", others: true, ack: ["whole", "part", "none"] }],
  ["none-delta-fifo", { version: false, feed: "delta", order: "fifo", others: true, ack: ["whole", "part", "none"], covers: true }],
  ["none-whole-shuffle", { version: false, feed: "whole", order: "shuffle", others: true, ack: ["whole", "none"], covers: true }],
  ["none-delta-shuffle", { version: false, feed: "delta", order: "shuffle", others: true, ack: ["whole", "none"], covers: true }],
  ["none-nofeed", { version: false, feed: "none", order: "fifo", others: false, ack: ["whole", "part", "none"] }],
  ["rec-delta-nocovers", { version: true, feed: "delta", order: "shuffle", others: true, ack: ["whole", "part", "none"], covers: false }],
  ["coll-nofeed", { version: true, collection: true, feed: "none", order: "fifo", others: true, ack: ["whole", "part", "none"] }],
  ["coll-delta-shuffle", { version: true, collection: true, feed: "delta", order: "shuffle", others: true, ack: ["whole", "part", "none"], covers: true }],
  ["uncovered-session", { version: true, feed: "delta", order: "fifo", others: true, ack: ["whole", "part", "none"], uncovered: true }],
];
const suites: Record<string, World> = {
  base: {},
  ties: { tie: true },
  restart: { resetOnBack: true },
  answers: { answers: true },
  boxed: { boxed: true },
  // The trust list: each is a claim. These SHOULD fail, and that is what the list is for.
  "trust.lag": { lag: true },
  "trust.restartFeed": { resetOnBack: true },
  "trust.arrival": { arrivalLie: true },
  "trust.lossy": { lossy: true },
  "trust.dedupe": { noDedupe: true },
  "trust.feedOmitsDerived": { feedOmitsDerived: true },
  "trust.noAlsoChanges": { noAlsoChanges: true },
};

const N = Number(process.argv[2] ?? 20000);
const suiteName = process.argv[3] ?? "base";
const fl: Flags = Object.fromEntries((process.argv[4] ?? "").split(",").filter(Boolean).map((m) => [m, true]));
const W = suites[suiteName]!;
const only = process.argv[5];
let bad = 0;
const cfgs =
  suiteName === "trust.lag" ? base.filter(([n]) => n.startsWith("rec-"))
  : suiteName === "restart" ? base.filter(([n]) => n.includes("nofeed")) // what H2 promises: reads
  : suiteName === "trust.restartFeed" ? base.filter(([n]) => n.includes("shuffle") && !n.startsWith("none"))
  : base;
for (const [name, cfg] of cfgs) {
  if (only && !name.includes(only)) continue;
  let fail: string | null = null;
  let answers = 0;
  for (let s = 1; s <= N && !fail; s++) {
    try {
      stat.walks++;
      answers += walk(s * 7919, cfg, 4 + (s % 40), W, fl).reads;
    } catch (e) {
      fail = `seed ${s}: ${(e as Error).message}`;
    }
  }
  console.log(name.padEnd(22), fail ? `FAIL ${fail}` : `ok, ${N} walks, ${(answers / N).toFixed(1)} answers per walk`);
  if (fail) bad++;
}
console.log(
  `suite ${suiteName} flags [${Object.keys(fl).join(",")}] fails ${bad}/${cfgs.length}; walks ${stat.walks}; repairs ${stat.repairs}; max repairs in one walk ${stat.maxRepairs}; conflicts raised ${stat.raised}; refreshes ${stat.refreshes}; fields marked at quiet ${stat.marksQuiet}/${stat.fieldsQuiet} (${((100 * stat.marksQuiet) / Math.max(1, stat.fieldsQuiet)).toFixed(1)}%); walks ending MayStillLand ${stat.openEnds}; ending VersionWentBack (fields) ${stat.wentBackEnds}; RepairOverdue ${stat.overdue}`,
);
process.exitCode = bad ? 1 : 0;
