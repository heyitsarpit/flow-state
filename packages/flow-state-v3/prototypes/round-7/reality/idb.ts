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
  // The edge's host half: one transaction per batch, `commit()` always, so a page that is going away still commits what it issued. The answer is `oncomplete` or `onabort`.
  write: (
    writes: ReadonlyArray<{ key: string; value: string | undefined }>,
    purpose: string,
    answer: (ok: boolean, why?: string) => void,
  ) => {
    const t0 = performance.now();
    let tx: IDBTransaction | undefined;
    try {
      tx = db.transaction("kv", "readwrite", { durability: purpose === "flush" ? "relaxed" : "strict" });
      const started = tx;
      started.oncomplete = () => {
        if (stats) stats.commitMs += performance.now() - t0;
        answer(true);
      };
      started.onabort = () => {
        if (stats) stats.failed++;
        answer(false, started.error?.name ?? "aborted");
      };
      const s = started.objectStore("kv");
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
      const plain = purpose === "flush";
      if (faults && plain && faults.abortPlain > 0) {
        faults.abortPlain--;
        started.abort();
      } else if (faults && !plain && faults.abortAwaited > 0) {
        faults.abortAwaited--;
        started.abort();
      } else if (!faults?.noExplicitCommit) started.commit();
    } catch (e) {
      if (tx !== undefined) tx.abort();
      else setTimeout(() => answer(false, String(e)), 0);
    }
  },
});
