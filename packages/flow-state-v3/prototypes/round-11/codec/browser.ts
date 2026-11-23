// Round 11, codec/BRIEF.md: a persisted record handed to IndexedDB as a JSON string, or as the Schema-encoded object for structured clone.
// In real headless Chrome over CDP (`conformance/bench/cdp.ts`). Safari is not run here (the Safari run is Arpit's, HANDOFF).
// bun conformance/watch.ts --seconds 240 -- bun round-11/codec/browser.ts
import { join } from "node:path";
import { launch } from "../../conformance/bench/cdp.ts";

const page = `<!doctype html><script>
const msg = (i) => ({ id: "m" + i, author: "u" + (i % 50), text: "hello there ".repeat(8), at: 1700000000000 + i, likes: i % 7, tags: ["a", "b"] });
const record = (n) => ({ memory: { thread: "t1", draft: "typing", messages: Array.from({ length: n }, (_, i) => msg(i)) }, state: "OPEN" });
const med = (xs) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const sync = (f, runs) => { for (let i = 0; i < 3; i++) f(); const xs = []; for (let i = 0; i < runs; i++) { const t = performance.now(); f(); xs.push(performance.now() - t); } return med(xs); };
const open = () => new Promise((ok, no) => { const r = indexedDB.open("codec-bench", 1); r.onupgradeneeded = () => r.result.createObjectStore("s"); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
// One put, timed two ways: the main thread's part (encode and the put call), and until the transaction completes.
const put = (db, make) => new Promise((ok) => { const t = performance.now(); const tx = db.transaction("s", "readwrite", { durability: "relaxed" }); tx.objectStore("s").put(make(), "actor"); const s = performance.now() - t; tx.oncomplete = () => ok([s, performance.now() - t]); });
const puts = async (db, make, runs) => { for (let i = 0; i < 3; i++) await put(db, make); const a = [], b = []; for (let i = 0; i < runs; i++) { const [s, c] = await put(db, make); a.push(s); b.push(c); } return [med(a), med(b)]; };
// A read: the record back, as a value. A string is parsed after; an object is deserialised by IndexedDB itself.
const get = (db, key, after) => new Promise((ok) => { const t = performance.now(); const r = db.transaction("s", "readonly").objectStore("s").get(key); r.onsuccess = () => { after(r.result); ok(performance.now() - t); }; });
const gets = async (db, key, after, runs) => { for (let i = 0; i < 3; i++) await get(db, key, after); const a = []; for (let i = 0; i < runs; i++) a.push(await get(db, key, after)); return med(a); };
const reads = async (db, r, runs) => {
  await new Promise((ok) => { const tx = db.transaction("s", "readwrite"); tx.objectStore("s").put(JSON.stringify(r), "asString"); tx.objectStore("s").put(r, "asObject"); tx.oncomplete = ok; });
  return { getString: await gets(db, "asString", (v) => JSON.parse(v), runs), getObject: await gets(db, "asObject", () => {}, runs) };
};
window.bench = async () => {
  const db = await open();
  const rows = [];
  for (const n of [100, 1000, 10000]) {
    const r = record(n); const s = JSON.stringify(r); const runs = n >= 10000 ? 20 : 60;
    rows.push({ n, kb: Math.round(s.length / 1024),
      stringify: sync(() => JSON.stringify(r), runs), parse: sync(() => JSON.parse(s), runs),
      cloneObject: sync(() => structuredClone(r), runs), cloneString: sync(() => structuredClone(s), runs),
      putString: await puts(db, () => JSON.stringify(r), runs), putObject: await puts(db, () => r, runs), ...(await reads(db, r, runs)) });
  }
  return rows;
};
</script>`;
const srv = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response(page, { headers: { "content-type": "text/html" } }) });
const browser = await launch();
const lines: string[] = [`Chrome ${browser.version}, headless, this Mac. Median ms. put: [main thread, until complete], relaxed durability.`];
try {
  const p = await browser.newPage(`http://127.0.0.1:${srv.port}/`);
  for (let i = 0; i < 100 && (await p.evaluate("typeof window.bench")) !== "function"; i++) await Bun.sleep(30);
  for (const rate of [1, 6]) {
    await p.send("Emulation.setCPUThrottlingRate", { rate });
    const rows = (await p.evaluate("window.bench()", 120_000)) as Array<Record<string, number | number[]>>;
    for (const r of rows) {
      const f = (x: number | number[] | undefined) => (Array.isArray(x) ? `${x[0]!.toFixed(2)}/${x[1]!.toFixed(2)}` : x!.toFixed(3));
      lines.push(`${rate}x n=${r["n"]} (${r["kb"]} KB): stringify ${f(r["stringify"])}, parse ${f(r["parse"])}, clone object ${f(r["cloneObject"])}, clone string ${f(r["cloneString"])}; put string ${f(r["putString"])}, put object ${f(r["putObject"])}; get+parse string ${f(r["getString"])}, get object ${f(r["getObject"])}`);
    }
  }
  p.close();
} finally {
  await browser.close();
  srv.stop(true);
}
console.log(lines.join("\n"));
await Bun.write(join(import.meta.dir, "browser.txt"), lines.join("\n") + "\n");
