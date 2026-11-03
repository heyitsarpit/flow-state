// The Safari page: the edge's store contract, measured on real IndexedDB with no runtime. run.ts drives it over WebDriver.
// Reuses round 10's adapter (`openDb`, `idbStorage`): the host half the edge hands each batch to.
import { idbStorage, openDb } from "../round-10/reality/idb.ts";

const g = globalThis as any;

g.__t = { loaded: performance.now() };

const now = () => Math.round(performance.now() * 100) / 100;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const req = <T>(r: IDBRequest<T>) =>
  new Promise<T>((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });

const ended = (tx: IDBTransaction) =>
  new Promise<string>((res) => {
    tx.oncomplete = () => res("complete");
    tx.onabort = () => res(`abort:${tx.error?.name ?? "none"}`);
  });

const del = (name: string) =>
  new Promise<string>((res) => {
    const d = indexedDB.deleteDatabase(name);
    d.onsuccess = () => res("deleted");
    d.onerror = () => res(`error:${d.error?.name}`);
    d.onblocked = () => res("blocked");
  });

const all = async (db: IDBDatabase) => Object.fromEntries(await idbStorage(db).load());

const clear = async (db: IDBDatabase) => {
  const tx = db.transaction("kv", "readwrite");
  tx.objectStore("kv").clear();
  await ended(tx);
};

const write = (db: IDBDatabase, writes: { key: string; value: any }[], purpose: string) =>
  new Promise<{ ok: boolean; why?: string; sync: boolean }>((res) => {
    let inside = true;
    idbStorage(db).write(writes, purpose, (ok, why) => res({ ok, why, sync: inside }));
    inside = false;
  });

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

const p99 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.99)];

const r2 = (x: number) => Math.round(x * 100) / 100;

// ── Item 0: does website data outlive a WebDriver session?
g.__seed = async (stamp: string) => {
  const db = await openDb("persist");
  const tx = db.transaction("kv", "readwrite", { durability: "strict" });
  tx.objectStore("kv").put(stamp, "stamp");
  const end = await ended(tx);
  db.close();
  localStorage.setItem("persist", stamp);

  return {
    end,
    persisted: await navigator.storage?.persisted?.(),
    estimate: await navigator.storage?.estimate?.(),
  };
};

g.__readSeed = async () => {
  const dbs = (await indexedDB.databases?.()) ?? "no databases()";
  let idb: unknown = null;

  if (Array.isArray(dbs) && dbs.some((d) => d.name === "persist")) {
    const db = await openDb("persist");
    idb = (await all(db))["stamp"] ?? null;
    db.close();
  }

  return {
    dbs,
    idb,
    local: localStorage.getItem("persist"),
    estimate: await navigator.storage?.estimate?.(),
  };
};

// ── Item 1: one batch is atomic; batches commit in issue order.
g.__atomic = async () => {
  await del("atom");
  const db = await openDb("atom");

  const keys = (n: number, v: string) =>
    Array.from({ length: n }, (_x, i) => ({ key: `k${i}`, value: v }));

  const count = (m: Record<string, string>, v: string) =>
    Object.values(m).filter((x) => x === v).length;

  const out: any = {};
  // a: 100 keys through the adapter, as the edge's batch.
  out.whole = await write(db, keys(100, "old"), "ticket");
  out.wholeLanded = count(await all(db), "old");
  // b: a request error in the middle (ConstraintError from add on a key that exists), not handled: the transaction aborts.
  {
    const tx = db.transaction("kv", "readwrite");
    const s = tx.objectStore("kv");

    for (let i = 0; i < 100; i++) {
      if (i === 50) s.add("dup", "k0");
      else s.put("new-b", `k${i}`);
    }

    out.constraint = await ended(tx);
    out.constraintNewLanded = count(await all(db), "new-b");
  }

  // c: an explicit abort after 1,000 puts of 1 KB.
  {
    const tx = db.transaction("kv", "readwrite");
    const s = tx.objectStore("kv");
    const pad = "y".repeat(1000);

    for (let i = 0; i < 1000; i++) s.put(`new-c|${pad}`, `k${i}`);
    tx.abort();
    out.abort = await ended(tx);
    out.abortNewLanded = Object.values(await all(db)).filter((x) =>
      String(x).startsWith("new-c"),
    ).length;
  }

  // d: a value that cannot be stored, mid-batch, through the adapter: `put` throws, the adapter aborts.
  {
    const ws: any[] = keys(100, "new-d");
    ws[50] = { key: "k50", value: () => 1 };
    out.uncloneable = await write(db, ws, "ticket");
    out.uncloneableNewLanded = count(await all(db), "new-d");
  }

  out.oldStill = count(await all(db), "old");
  db.close();
  await del("atom");

  return out;
};

// Two batches issued back to back over the same key. `cross`: on two connections. A is made slow: `padKeys` keys of 10 KB.
g.__order = async (o: {
  n: number;
  cross: boolean;
  durA: IDBTransactionDurability;
  durB: IDBTransactionDurability;
  padKeys: number;
}) => {
  const name = `order-${o.cross}-${o.durA}-${o.durB}-${o.padKeys}`;
  await del(name);
  const a = await openDb(name);
  const b = o.cross ? await openDb(name) : a;
  const pad = "z".repeat(10_000);
  let inOrder = 0;
  let lastWins = 0;
  const gaps: number[] = [];

  for (let i = 0; i < o.n; i++) {
    const done: string[] = [];
    const t0 = performance.now();
    const ta = a.transaction("kv", "readwrite", { durability: o.durA });
    const sa = ta.objectStore("kv");

    for (let k = 0; k < o.padKeys; k++) sa.put(pad, `pad${k}`);
    sa.put(`A${i}`, "o");
    const tb = b.transaction("kv", "readwrite", { durability: o.durB });
    tb.objectStore("kv").put(`B${i}`, "o");
    ta.commit();
    tb.commit();
    const ea = ended(ta).then((e) => void done.push(`A:${e}`));
    const eb = ended(tb).then((e) => void done.push(`B:${e}`));
    await Promise.all([ea, eb]);
    gaps.push(performance.now() - t0);

    if (done[0].startsWith("A")) inOrder++;

    if ((await all(a))["o"] === `B${i}`) lastWins++;
  }

  a.close();

  if (o.cross) b.close();
  await del(name);

  return { ...o, inOrder, lastWins, pairMedianMs: r2(median(gaps)) };
};

// The edge's answer: never inside `write`, always a later task. And how late.
g.__answerTiming = async (n: number) => {
  await del("answer");
  const db = await openDb("answer");
  let sync = 0;
  const ms: number[] = [];

  for (let i = 0; i < n; i++) {
    const t = performance.now();

    const r = await write(
      db,
      [
        { key: "a", value: String(i) },
        { key: "b", value: String(i) },
      ],
      i % 2 ? "flush" : "ticket",
    );

    ms.push(performance.now() - t);

    if (r.sync) sync++;
  }

  db.close();
  await del("answer");

  return { n, answeredInsideWrite: sync, medianMs: r2(median(ms)), p99Ms: r2(p99(ms)) };
};

// ── Item 2: quota.
g.__estimate = async () => ({
  estimate: await navigator.storage?.estimate?.(),
  persisted: await navigator.storage?.persisted?.(),
});

g.__quota = async (o: { chunkMB: number; maxMB: number }) => {
  await del("quota");
  const db = await openDb("quota");
  const before = await navigator.storage.estimate();
  const chunk = "q".repeat(o.chunkMB * 1_000_000);
  const log: any[] = [];
  let failed: any;
  let i = 0;

  for (; i * o.chunkMB < o.maxMB; i++) {
    const ev: any = { i, mb: (i + 1) * o.chunkMB, events: [] as any[] };
    const t0 = performance.now();

    const at = (what: string, extra: object = {}) =>
      ev.events.push({ what, ms: r2(performance.now() - t0), ...extra });

    let tx: IDBTransaction;

    try {
      tx = db.transaction("kv", "readwrite", { durability: "strict" });
      const r = tx.objectStore("kv").put(chunk, `q${i}`);
      r.onsuccess = () => at("request.success");
      r.onerror = () => at("request.error", { name: r.error?.name, message: r.error?.message });
      tx.onerror = () => at("tx.error", { name: tx.error?.name });

      const end = new Promise<void>((res) => {
        tx.oncomplete = () => (at("tx.complete"), res());
        tx.onabort = () => (
          at("tx.abort", { name: tx.error?.name, message: tx.error?.message }),
          res()
        );
      });

      tx.commit();
      await Promise.race([end, sleep(60_000).then(() => at("no answer in 60 s"))]);
    } catch (e: any) {
      at("threw", { name: e?.name, message: e?.message });
    }

    if (ev.events.some((e: any) => e.what !== "request.success" && e.what !== "tx.complete")) {
      failed = ev;
      break;
    }

    if (i % 10 === 0) log.push({ i, mb: ev.mb, ms: ev.events.at(-1)?.ms });
  }

  const atFail = await navigator.storage.estimate();
  // After the failure: does a small batch still commit? Is anything of the failed chunk there?
  const small = await write(db, [{ key: "small", value: "s" }], "ticket");
  const keys = Object.keys(await all(db)).length;
  db.close();
  const deleted = await del("quota");
  const after = await navigator.storage.estimate();

  return {
    ...o,
    chunksCommitted: failed ? failed.i : i,
    failed,
    progress: log,
    before,
    atFail,
    smallAfter: small,
    keysAfter: keys,
    deleted,
    after,
  };
};

// ── Item 3: a lost connection.
g.__lost = async () => {
  const name = "lost";
  await del(name);
  const out: any = {};
  const events: any[] = [];
  const t0 = performance.now();

  const at = (what: string, extra: object = {}) =>
    events.push({ what, ms: r2(performance.now() - t0), ...extra });

  // a: a newer version is asked for; the holder does not close at once.
  const a = await openDb(name);
  a.onversionchange = (e) =>
    at("a.versionchange", { oldVersion: e.oldVersion, newVersion: e.newVersion });
  a.onclose = () => at("a.close");
  const up = indexedDB.open(name, 2);
  up.onblocked = () => at("up.blocked");
  up.onupgradeneeded = () => at("up.upgradeneeded");

  const upDone = new Promise<IDBDatabase>(
    (res) => (up.onsuccess = () => (at("up.success"), res(up.result))),
  );

  await sleep(500);
  // A batch on the connection that was told to go: does it still commit?
  out.writeAfterVersionchange = await write(a, [{ key: "x", value: "1" }], "ticket");
  // A batch issued, then the connection closed at once: the batch still runs to its end (spec: close waits for transactions).
  const pending = write(a, [{ key: "y", value: "1" }], "ticket");
  a.close();
  at("a.close() called");
  out.writeIssuedBeforeClose = await pending;
  // The adapter on a closed connection.
  out.writeOnClosed = await write(a, [{ key: "z", value: "1" }], "ticket");

  try {
    a.transaction("kv", "readonly");
    out.rawTransactionOnClosed = "no throw";
  } catch (e: any) {
    out.rawTransactionOnClosed = e?.name;
  }

  const b = await upDone;
  out.versionAfter = b.version;
  out.disk = await all(b);
  // b: deleteDatabase while open; the holder closes in its versionchange handler.
  b.onversionchange = (e) => {
    at("b.versionchange", { newVersion: e.newVersion });
    b.close();
  };

  out.deleteWhileOpen = await del(name);
  out.writeAfterDelete = await write(b, [{ key: "w", value: "1" }], "ticket");
  // c: reopen after both.
  const c = await openDb(name);
  out.reopenVersion = c.version;
  out.reopenWrite = await write(c, [{ key: "r", value: "1" }], "ticket");
  out.reopenDisk = await all(c);
  c.close();
  await del(name);
  out.events = events;

  return out;
};

// ── Item 4: bfcache with the lock (D148).
const log = (what: string, extra: object = {}) => {
  try {
    const l = JSON.parse(sessionStorage.getItem("bf.log") ?? "[]");
    l.push({ what, at: Date.now(), page: location.search, ...extra });
    sessionStorage.setItem("bf.log", JSON.stringify(l));
  } catch {}
};

addEventListener("pagehide", (e) => log("pagehide", { persisted: e.persisted }));

addEventListener("pageshow", (e) => log("pageshow", { persisted: e.persisted }));

let releaseLock: (() => void) | undefined;

let keepDb: IDBDatabase | undefined;

g.__bfArm = async (o: { contract: boolean; idb: boolean; lock: string }) => {
  const got = await new Promise<boolean>((res) => {
    void navigator.locks.request(o.lock, { ifAvailable: true }, (l) => {
      res(l !== null);

      return l ? new Promise<void>((r) => void (releaseLock = r)) : undefined;
    });
  });

  if (o.idb) keepDb = await openDb("bf");

  if (o.contract) {
    addEventListener("pagehide", (e) => {
      if (!e.persisted) return;
      releaseLock?.();
      releaseLock = undefined;
      g.__left = true;
      log("released");
    });
    addEventListener("pageshow", (e) => {
      if (e.persisted && g.__left) {
        log("reloading");
        location.reload();
      }
    });
  }

  return { got, locks: !!navigator.locks };
};

g.__bfProbe = async (lock: string) => {
  const query = await navigator.locks.query(); // before this page's own request, which would show in it

  const got = await new Promise<boolean>((res) => {
    void navigator.locks.request(lock, { ifAvailable: true }, (l) => {
      res(l !== null);

      return undefined;
    });
  });

  return {
    got,
    query,
    nav: (performance.getEntriesByType("navigation")[0] as any)?.type ?? null,
    log: JSON.parse(sessionStorage.getItem("bf.log") ?? "[]"),
    page: location.search,
    holdingHere: releaseLock !== undefined,
  };
};

g.__bfReset = () => sessionStorage.removeItem("bf.log");

// ── Item 5: durability.
g.__durability = async (o: { n: number; keys: number; bytes: number }) => {
  const res: any = {
    commitExists: typeof IDBTransaction.prototype.commit === "function",
    durabilityProp: "durability" in IDBTransaction.prototype,
  };

  const pad = "d".repeat(o.bytes);

  for (const durability of ["relaxed", "strict", "default"] as const)
    for (const explicit of [true, false]) {
      const name = `dur-${durability}-${explicit}`;
      await del(name);
      const db = await openDb(name);
      const ms: number[] = [];
      let reported: string | undefined;
      const t0 = Date.now(); // Safari's performance.now is coarse (1 ms): the mean over n is the number

      for (let i = 0; i < o.n; i++) {
        const t = performance.now();
        const tx = db.transaction("kv", "readwrite", { durability });
        reported = (tx as any).durability;
        const s = tx.objectStore("kv");

        for (let k = 0; k < o.keys; k++) s.put(`${i}|${pad}`, `k${k}`);

        if (explicit) tx.commit();
        await ended(tx);
        ms.push(performance.now() - t);
      }

      db.close();
      await del(name);
      res[`${durability}${explicit ? "+commit" : ""}`] = {
        reported,
        meanMs: r2((Date.now() - t0) / o.n),
        medianMs: r2(median(ms)),
        p99Ms: r2(p99(ms)),
      };
    }

  return res;
};

// A batch issued in `pagehide`, then the page goes. `commit` says whether it calls `tx.commit()`.
g.__armHide = async (o: { db: string; tag: string; commit: boolean; keys: number }) => {
  const db = await openDb(o.db);
  addEventListener("pagehide", (e) => {
    navigator.sendBeacon(`/_hidden?why=${o.tag}:${e.persisted}`); // the server hears that the handler ran
    const t0 = Date.now();

    try {
      const tx = db.transaction("kv", "readwrite", { durability: "relaxed" });
      const s = tx.objectStore("kv");
      const pad = "h".repeat(1000);
      const reqs = { ok: 0, err: 0, errName: "" };

      for (let k = 0; k < o.keys; k++) {
        const r = s.put(`${o.tag}|${pad}`, `${o.tag}/${k}`);
        r.onsuccess = () => void reqs.ok++;
        r.onerror = () => void (reqs.err++, (reqs.errName = r.error?.name ?? ""));
      }

      g.__hideDb = db;
      // Whatever the transaction ends in, whenever: in the tab's sessionStorage and to the server.
      tx.oncomplete = () => (
        log("hide.complete", { ms: Date.now() - t0, ...reqs }),
        navigator.sendBeacon(
          `/_hidden?why=${o.tag}:complete:${reqs.ok}ok:${reqs.err}err:${reqs.errName}`,
        )
      );
      tx.onabort = () => (
        log("hide.abort", { name: tx.error?.name, ms: Date.now() - t0, ...reqs }),
        navigator.sendBeacon(`/_hidden?why=${o.tag}:abort:${tx.error?.name}`)
      );

      if (o.commit) tx.commit();
    } catch (err: any) {
      log("hide.threw", { name: err?.name, message: err?.message });
      navigator.sendBeacon(`/_hidden?why=${o.tag}:threw:${err?.name}`);
    }
  });

  return true;
};

// A batch out when the page leaves by its own navigation, not issued in pagehide: issue, then go, in one task.
g.__issueThenGo = async (o: {
  db: string;
  tag: string;
  commit: boolean;
  keys: number;
  to: string;
}) => {
  const db = await openDb(o.db);
  const tx = db.transaction("kv", "readwrite", { durability: "relaxed" });
  const s = tx.objectStore("kv");
  const pad = "i".repeat(1000);

  for (let k = 0; k < o.keys; k++) s.put(`${o.tag}|${pad}`, `${o.tag}/${k}`);

  if (o.commit) tx.commit();
  location.href = o.to;

  return true;
};

// Bounded: a store held by a transaction that never ends would hang the read for ever.
g.__readHide = async (name: string, ms = 5000) => {
  const t0 = Date.now();
  const hung = (what: string) => sleep(ms).then(() => ({ hung: what, afterMs: Date.now() - t0 }));
  const db = await Promise.race([openDb(name), hung("open")]);

  if (!(db instanceof IDBDatabase)) return db;
  const m = await Promise.race([all(db), hung("read")]);
  db.close();

  if ((m as any).hung) return m;
  const tags: Record<string, number> = {};

  for (const k of Object.keys(m)) {
    const t = k.split("/")[0];
    tags[t] = (tags[t] ?? 0) + 1;
  }

  return tags;
};

// The same connection that issued the pagehide batch, after a return from the cache.
g.__readSameConnection = async () => {
  const db: IDBDatabase | undefined = g.__hideDb;

  if (!db) return "no connection";

  try {
    return Object.keys(await all(db)).length;
  } catch (e: any) {
    return `threw ${e?.name}`;
  }
};

g.__ua = () => navigator.userAgent;
