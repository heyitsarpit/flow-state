// The page: round 6's runtime on real timers, real IndexedDB, real fetch. No suite and no fake. run.ts drives it over CDP.
import { getActor } from "../actors.ts";
import { Scheduler } from "effect";
import { growMachine, growActor, message } from "../../conformance/bench/fixture.ts";
import { deskListenFixture, deskFixture } from "../../conformance/fixtures/desk.compiled.ts";
import { payFixture } from "../../conformance/fixtures/pay.compiled.ts";
import { refundsFixture } from "../../conformance/fixtures/refunds.compiled.ts";
import { bareFixture } from "../../conformance/fixtures/round7.compiled.ts";
import { serialBareFixture } from "../../conformance/fixtures/round8.compiled.ts";
import { createRuntime } from "../driver.ts";
import { entities, readAll } from "../entities.ts";
import { sessions } from "../sessions.ts";
import { viewOf } from "../inc.ts";
import { idbStorage, openDb, strictMarker, type Faults, type Stats } from "./idb.ts";
import { realApi } from "./real-api.ts";
import { newTask } from "./task.ts";

const g = globalThis as any;
const evidence: any[] = [];
const issues: any[] = [];
let rt: any;
const stats: Stats = { writes: 0, syncMs: 0, commitMs: 0, failed: 0, keys: 0, bytes: 0 };
// What a real host must be, and the fake was not. Time and ids survive a reload there; here `performance.now` restarts and a counter repeats.
const faults: Faults = { abortPlain: 0, abortAwaited: 0 };
g.__faults = faults;
let beacon = false;
const seen = { hidden: 0, pagehide: 0, visibility: [] as string[] };
g.__seen = seen;
// D80: what `Host.onHidden` is on a page. The beacon says when, before the flush starts, so run.ts can kill during it.
const onHidden = (f: () => void) => {
  const fire = (why: string) => {
    if (beacon) navigator.sendBeacon(`/_hidden?why=${why}`);
    (seen as any)[why === "pagehide" ? "pagehide" : "hidden"]++;
    f();
  };
  document.addEventListener("visibilitychange", () => {
    seen.visibility.push(document.visibilityState);
    if (document.visibilityState === "hidden") fire("hidden");
  });
  addEventListener("pagehide", () => fire("pagehide"));
};
const host = (storage: any) => ({
  onHidden,
  isHidden: () => document.visibilityState === "hidden",
  now: () => Date.now(),
  id: () => `att-${crypto.randomUUID()}`,
  setTimer: (at: number, f: () => void) => {
    const t = setTimeout(f, Math.max(0, at - Date.now()));
    return () => clearTimeout(t);
  },
  later: newTask(), // D122
  scheduler: new Scheduler.MixedScheduler(),
  storage,
});
const lockFor = (name: string): Promise<boolean> =>
  new Promise((res) => {
    if (!navigator.locks) return res(true); // no Web Locks: the plan's O7 asks for a refusal; here we report it
    void navigator.locks.request(name, { ifAvailable: true }, (lock) => {
      res(lock !== null);
      return lock ? new Promise(() => {}) : undefined; // held for the life of the page
    });
  });
// H1's real shape, from the review: a store slowed behind a ticket's batch. A real second readwrite transaction, issued right after that batch and kept open by its own requests, so what follows queues behind it.
let holdMs = 0;
g.__holdAfterTicket = (ms: number) => void (holdMs = ms);
const holding = (db: IDBDatabase, s: ReturnType<typeof idbStorage>) =>
  db === undefined
    ? s
    : {
        ...s,
        write: (w: any, purpose: string, answer: any) => {
          s.write(w, purpose, answer);
          if (purpose === "flush" || holdMs <= 0) return;
          const until = performance.now() + holdMs;
          holdMs = 0;
          const store = db.transaction("kv", "readwrite").objectStore("kv");
          const again = () => {
            if (performance.now() < until) store.get("host/ready").onsuccess = again;
          };
          again();
        },
      };
g.__boot = async (kind: string, o: any = {}) => {
  const api = realApi();
  beacon = !!o.beacon;
  faults.noExplicitCommit = !!o.noExplicitCommit;
  // O7, review L8: the lock first. A second tab opens nothing.
  const owner = o.persist === false ? false : await lockFor(`flow-scope-${o.db ?? "flow"}`);
  let db = owner ? await openDb(o.db ?? "flow") : (undefined as unknown as IDBDatabase);
  if (owner && o.marker !== false) await strictMarker(db); // D85
  if (owner && o.marker === "aged") await new Promise((r) => setTimeout(r, 1500)); // review: a database 1.2 s old lost nothing in 59
  if (owner && o.marker === "reopen") {
    // A stronger try, H3: the database closed and reopened after the marker.
    db.close();
    db = await openDb(o.db ?? "flow");
    await strictMarker(db);
  }
  const machine =
    kind === "pay"
      ? payFixture.make(api)
      : kind === "desk"
        ? (o.listen === false ? deskFixture : deskListenFixture).make(api)
        : kind === "bare"
          ? bareFixture().make(api)
          : kind === "bareSerial"
            ? serialBareFixture().make(api)
            : kind === "refunds"
              ? refundsFixture.make(api)
              : growMachine(o.size ?? 1000, true);
  if (!owner) evidence.push({ kind: "SecondTabNoPersistence" });
  rt = createRuntime({
    host: host(holding(db, idbStorage(db, stats, faults))) as never,
    machines: { [machine.id]: o.persist === false && kind === "desk" ? { ...machine, persisted: false } : machine },
    modules: [entities, sessions],
    bounds: { ...(o.captureMs === undefined ? {} : { captureMs: o.captureMs }), ...o.bounds },
    persistence: owner,
    onEvidence: (e: any[]) => void evidence.push(...e),
    onIssue: (i: any[]) => void issues.push(...i),
  });
  g.__dbName = db?.name;
  return { owner, locks: !!navigator.locks };
};
g.__ensure = (a: string, m: string, input?: unknown) =>
  rt.input({ k: "ensure", actor: a, machine: m, input });
g.__send = (a: string, tag: string, payload: unknown = {}) =>
  rt.input({ k: "send", actor: a, event: { tag, payload } });
g.__dispose = (a: string) => rt.input({ k: "dispose", actor: a });
g.__flush = () => rt.flushNow();
g.__view = (a: string) => {
  const w = rt.world();
  const r = (Array.isArray(w.actors) ? getActor(w.actors, a) : w.actors[a])?.root; // a control may run an older runtime's plain table
  return r ? { state: r.leaf, memory: viewOf(r) } : undefined;
};
g.__booted = () => rt.world().boot > 0;
g.__lanes = () =>
  Object.values(rt.world().lanes).map((l: any) => ({
    id: l.id,
    phase: l.head?.phase?.t,
    attempt: l.head?.id,
  }));
g.__records = () => {
  const s = rt.world().ext["entities"];
  return s ? readAll(s) : {};
};
g.__ev = (kind?: string) => (kind ? evidence.filter((e) => e.kind === kind) : evidence);
g.__issues = () => issues;
g.__fatal = () => rt.fatal();
g.__stats = () => stats;
g.__idle = () => !rt.pending() && rt.live() === 0;
g.__wait = async (cond: string, ms = 5000) => {
  const t0 = Date.now();
  // eslint-disable-next-line no-eval
  while (Date.now() - t0 < ms) {
    if ((0, eval)(cond)) return true;
    await new Promise((r) => setTimeout(r, 10));
  }
  return false;
};

// What the disk holds, read by a fresh connection: the oracle, not the runtime's belief.
g.__disk = async (name: string) => {
  const db = await openDb(name);
  const m = await idbStorage(db).load();
  db.close();
  return Object.fromEntries(m);
};
// ── S3 at the store: what a commit costs, no runtime.
const medianOf = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const p99 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.99)]!;
const commit = (
  db: IDBDatabase,
  durability: IDBTransactionDurability,
  f: (s: IDBObjectStore) => void,
) =>
  new Promise<number>((res, rej) => {
    const t = performance.now();
    const tx = db.transaction("kv", "readwrite", { durability });
    f(tx.objectStore("kv"));
    tx.oncomplete = () => res(performance.now() - t);
    tx.onabort = () => rej(tx.error);
  });
g.__s3store = async (o: {
  messages: number;
  n: number;
  durability: IDBTransactionDurability;
  mode: string;
}) => {
  const db = await openDb(`s3-${o.mode}-${o.messages}-${o.durability}`);
  const msgs = Array.from({ length: o.messages }, (_x, i) => message(i));
  const record = () => ({ key: "a", memory: { count: 0, messages: msgs } });
  const sync: number[] = [];
  const total: number[] = [];
  const CHUNK = 256;
  const pieces = new WeakMap<object, string>();
  const memoEncode = (m: readonly object[]) => {
    const parts: string[] = [];
    for (const x of m) {
      let t = pieces.get(x);
      if (!t) {
        t = JSON.stringify(x);
        pieces.set(x, t);
      }
      parts.push(t);
    }
    return `{"key":"a","memory":{"count":0,"messages":[${parts.join(",")}]}}`;
  };
  if (o.mode === "chunks" || o.mode === "log") {
    // Seed what is already on disk, not timed.
    await commit(db, "relaxed", (s) => {
      for (let i = 0; i < Math.ceil(o.messages / CHUNK); i++)
        s.put(JSON.stringify(msgs.slice(i * CHUNK, (i + 1) * CHUNK)), `chunk/${i}`);
    });
  }
  for (let i = 0; i < o.n; i++) {
    const added = message(o.messages + i);
    msgs.push(added);
    const t0 = performance.now();
    let ms = 0;
    const p = commit(db, o.durability, (s) => {
      if (o.mode === "json") s.put(JSON.stringify(record()), "actor");
      else if (o.mode === "memo") s.put(memoEncode(msgs), "actor");
      else if (o.mode === "clone") s.put(record(), "actor");
      else if (o.mode === "log") s.put(JSON.stringify(added), `log/${i}`);
      else if (o.mode === "chunks") {
        // The array by fixed chunks: only the last one changes. Skeleton beside it, in one transaction.
        const at = Math.floor((msgs.length - 1) / CHUNK);
        s.put(JSON.stringify(msgs.slice(at * CHUNK)), `chunk/${at}`);
        s.put(JSON.stringify({ key: "a", count: 0, chunks: at + 1, length: msgs.length }), "actor");
      }
      ms = performance.now() - t0;
    });
    sync.push(ms);
    total.push(await p);
  }
  db.close();
  await new Promise((r) => {
    const d = indexedDB.deleteDatabase(db.name);
    d.onsuccess = d.onerror = r;
  });
  return {
    ...o,
    syncMedianMs: Math.round(medianOf(sync) * 100) / 100,
    syncP99Ms: Math.round(p99(sync) * 100) / 100,
    commitMedianMs: Math.round(medianOf(total) * 100) / 100,
    commitP99Ms: Math.round(p99(total) * 100) / 100,
  };
};
// ── S3 on the runtime: a persisted machine on real IndexedDB, a value at a time, at chat pace.
g.__s3runtime = async (o: { size: number; n: number; gapMs: number; captureMs: number }) => {
  const db = await openDb(`s3rt-${o.size}-${o.captureMs}`);
  const st: Stats = { writes: 0, syncMs: 0, commitMs: 0, failed: 0, keys: 0, bytes: 0 };
  const m = growMachine(o.size, true);
  const r = createRuntime({
    host: host(idbStorage(db, st)) as never,
    machines: { [m.id]: m },
    modules: [],
    bounds: { captureMs: o.captureMs },
    onEvidence: () => {},
    onIssue: () => {},
  });
  await new Promise<void>((res) => {
    const c = setInterval(() => {
      if (r.world().boot > 0) {
        clearInterval(c);
        res();
      }
    }, 1);
  });
  r.input({ k: "ensure", actor: growActor, machine: m.id, input: {} });
  await new Promise((res) => setTimeout(res, Math.max(50, o.captureMs * 2)));
  st.writes = st.syncMs = st.commitMs = st.keys = st.bytes = 0;
  const turns: number[] = [];
  let long = 0;
  const po = new PerformanceObserver((l) => void (long += l.getEntries().length));
  let longLate = 0;
  try {
    po.observe({ type: "longtask" });
  } catch {}
  const t0 = performance.now();
  for (let i = 0; i < o.n; i++) {
    const t = performance.now();
    r.input({
      k: "send",
      actor: growActor,
      event: { tag: "Add", payload: { message: message(o.size + i) } },
    });
    turns.push(performance.now() - t);
    await new Promise((res) => setTimeout(res, o.gapMs));
  }
  await new Promise((res) => setTimeout(res, Math.max(50, o.captureMs * 2)));
  const secs = (performance.now() - t0) / 1000;
  longLate = po.takeRecords().length; // M3: what `disconnect` would have thrown away
  long += longLate;
  po.disconnect();
  db.close();
  await new Promise((res) => {
    const d = indexedDB.deleteDatabase(db.name);
    d.onsuccess = d.onerror = res;
  });
  return {
    ...o,
    turnMedianMs: Math.round(medianOf(turns) * 100) / 100,
    turnP99Ms: Math.round(p99(turns) * 100) / 100,
    writes: st.writes,
    writeSyncMs: Math.round((st.syncMs / Math.max(1, st.writes)) * 100) / 100,
    commitMs: Math.round((st.commitMs / Math.max(1, st.writes)) * 100) / 100,
    mbWritten: Math.round((st.bytes / 1e6) * 10) / 10,
    longTasks: long,
    longTasksOnlyInTakeRecords: longLate,
    seconds: Math.round(secs * 10) / 10,
  };
};
// ── Atomicity and durability, for run.ts to kill.
g.__atomLoop = async (o: {
  name: string;
  keys: number;
  durability: IDBTransactionDurability;
  pad: number;
}) => {
  const db = await openDb(o.name);
  const pad = "x".repeat(o.pad);
  let n = Date.now();
  for (;;) {
    n++;
    const v = n;
    await new Promise<void>((res, rej) => {
      const tx = db.transaction("kv", "readwrite", { durability: o.durability });
      const s = tx.objectStore("kv");
      for (let k = 0; k < o.keys; k++) s.put(`${v}|${pad}`, `k${k}`);
      tx.oncomplete = () => res();
      tx.onabort = () => rej(tx.error);
    });
    // Told after the commit returned: what we claimed was durable.
    void fetch(`/_ack?k=${o.name}&n=${v}`, { keepalive: true }).catch(() => {});
  }
};
g.__atomRead = async (o: { name: string; keys: number }) => {
  const db = await openDb(o.name);
  const map = await idbStorage(db).load();
  const vals = Array.from({ length: o.keys }, (_x, k) => map.get(`k${k}`)?.split("|")[0]);
  db.close();
  return vals;
};
