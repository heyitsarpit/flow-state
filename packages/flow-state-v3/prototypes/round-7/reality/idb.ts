// A thin IndexedDB adapter for `Host.storage`. One object store, keys as given. Prior art: codebases/mono/packages/replicache/src/kv/idb-store.ts
// (relaxed durability, no microtask between creating a transaction and using it), codebases/db/packages/offline-transactions/src/storage/
// IndexedDBAdapter.ts. A batch is one transaction: all or nothing, by IndexedDB's own contract, which run.ts checks.
export const openDb = (name: string): Promise<IDBDatabase> =>
  new Promise((res, rej) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => void r.result.createObjectStore("kv");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
export type Stats = {
  writes: number;
  syncMs: number;
  commitMs: number;
  failed: number;
  keys: number;
  bytes: number;
};
// D85: a host commits this, strictly, and waits, before it says ready. H3: an acknowledged write vanished on a database moments old. The cause is not established.
export const strictMarker = (db: IDBDatabase): Promise<void> =>
  new Promise((res, rej) => {
    const tx = db.transaction("kv", "readwrite", { durability: "strict" });
    tx.objectStore("kv").put(String(Date.now()), "host/ready");
    tx.oncomplete = () => res();
    tx.onabort = () => rej(tx.error);
  });
// Round 7: a real `tx.abort()`, as a quota failure gives; the answer comes by `onabort`, later. Counted down by the page.
export type Faults = { abortPlain: number; abortAwaited: number; noExplicitCommit?: boolean };
export const idbStorage = (db: IDBDatabase, stats?: Stats, faults?: Faults) => ({
  load: (): Promise<ReadonlyMap<string, string>> =>
    new Promise((res, rej) => {
      const tx = db.transaction("kv", "readonly");
      const s = tx.objectStore("kv");
      const ks = s.getAllKeys();
      const vs = s.getAll();
      tx.oncomplete = () =>
        res(new Map(ks.result.map((k, i) => [String(k), vs.result[i] as string])));
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    }),
  write: (
    writes: ReadonlyArray<{ key: string; value: string | undefined }>,
    _purpose: string,
    then?: (ok: boolean) => void,
    failed?: (why: string) => void,
    landed?: () => void,
  ) => {
    const t0 = performance.now();
    const say = (why: string) => {
      if (stats) stats.failed++;
      if (then) then(false);
      else failed?.(why);
    };
    try {
      // O6: an awaited write is strict: it must be on disk when it says so. A plain one is relaxed.
      const tx = db.transaction("kv", "readwrite", { durability: then ? "strict" : "relaxed" });
      const s = tx.objectStore("kv");
      for (const w of writes) {
        if (w.value === undefined) s.delete(w.key);
        else s.put(w.value, w.key);
        if (stats) {
          stats.keys++;
          stats.bytes += w.value?.length ?? 0;
        }
      }
      if (stats) {
        stats.writes++;
        stats.syncMs += performance.now() - t0;
      }
      tx.oncomplete = () => {
        if (stats) stats.commitMs += performance.now() - t0;
        then?.(true);
        landed?.();
      };
      tx.onabort = () => say(String(tx.error));
      tx.onerror = () => undefined; // onabort follows
      if (faults && !then && faults.abortPlain > 0) {
        faults.abortPlain--;
        tx.abort();
      } else if (faults && then && faults.abortAwaited > 0) {
        faults.abortAwaited--;
        tx.abort();
      } else if (!faults?.noExplicitCommit) tx.commit(); // D80: see RESULTS. A page being destroyed loses a transaction that was only due to auto-commit
    } catch (e) {
      say(String(e));
    }
  },
});
