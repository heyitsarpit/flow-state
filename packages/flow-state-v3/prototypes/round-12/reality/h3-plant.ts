// H3's mechanism, tested with no timing at all. A sentinel committed `strict`; the browser stopped; a bare 7-byte LevelDB record header appended to the origin's log, what a process killed between `Append(header)` and `Append(payload)` leaves; open, read, write, stop; open, read.
// With `--no-plant`, the control. `--second quit`: the session after the tear ends cleanly. bun round-9/reality/h3-plant.ts --dir <scratch> --cycles 12 --second tree|quit [--no-plant] --out x.json
import { appendFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch } from "../../conformance/bench/cdp.ts";

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(k);
  return i < 0 ? d : process.argv[i + 1]!;
};
const base = arg("--dir", "");
if (!base) throw new Error("--dir");
const second = arg("--second", "tree");
const plant = !process.argv.includes("--no-plant");
const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response("<!doctype html><title>h3</title>", { headers: { "content-type": "text/html" } }) });
const url = `http://127.0.0.1:${server.port}/`;
const IDB = `globalThis.__open = (n) => new Promise((res, rej) => { const r = indexedDB.open(n, 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
globalThis.__put = (db, k, v) => new Promise((res, rej) => { const t = db.transaction("kv", "readwrite", { durability: "strict" }); t.objectStore("kv").put(v, k); t.oncomplete = () => res(); t.onabort = () => rej(t.error); });
globalThis.__get = (db, k) => new Promise((res, rej) => { const q = db.transaction("kv").objectStore("kv").get(k); q.onsuccess = () => res(q.result ?? null); q.onerror = () => rej(q.error); }); 0`;
const profile = join(base, `plant-${second}-${plant ? "torn" : "control"}-${Date.now()}`);
mkdirSync(profile, { recursive: true });
const logBase = `${profile}-chrome`;
let browser = await launch({ profile, args: ["--enable-logging=stderr", "--v=1"], logFile: logBase });
let starts = 1;
const open = async () => {
  const p = await browser.newPage(url);
  for (let i = 0; i < 100 && (await p.evaluate(`document.readyState`).catch(() => "")) !== "complete"; i++) await Bun.sleep(20);
  await p.evaluate(IDB);
  return p;
};
const logOf = () => {
  const dir = join(profile, "Default/IndexedDB");
  const d = readdirSync(dir).find((n) => n.endsWith(".leveldb"))!;
  const f = readdirSync(join(dir, d)).filter((n) => n.endsWith(".log")).sort().at(-1)!;
  return join(dir, d, f);
};
const read = (p: any) => p.evaluate(`(async () => { const d = await __open("sentinel"); const v = await __get(d, "s"); d.close(); return v; })()`);
const res = { plant, second, cycles: 0, firstOpenSawSentinel: 0, wipedAtSecondOpen: 0, chromeSaidCorruption: 0 };
const say = () => arg("--out", "") && writeFileSync(arg("--out", ""), JSON.stringify(res, null, 1) + "\n");
const cycles = Number(arg("--cycles", "12"));
try {
  for (let i = 0; i < cycles; i++) {
    let p = await open();
    await p.evaluate(`(async () => { const d = await __open("sentinel"); await __put(d, "s", ${Date.now()}); d.close(); })()`);
    await Bun.sleep(200);
    p.close();
    await browser.quit(); // nothing torn by the stop itself
    if (plant) {
      const size = statSync(logOf()).size;
      // 79 bytes, type FULL, a checksum no payload has. Past a block's end it would be padding, so stay inside a block.
      if (32768 - (size % 32768) > 100) appendFileSync(logOf(), Buffer.from([1, 2, 3, 4, 79, 0, 1]));
    }
    await browser.restart();
    starts++;
    p = await open();
    if ((await read(p)) !== null) res.firstOpenSawSentinel++;
    await p.evaluate(`(async () => { const d = await __open("flow"); for (let i = 0; i < 20; i++) await __put(d, "n", i); d.close(); })()`);
    await Bun.sleep(100);
    p.close();
    if (second === "tree") await browser.killTree();
    else await browser.quit();
    await Bun.sleep(300);
    await browser.restart();
    starts++;
    p = await open();
    if ((await read(p)) === null) res.wipedAtSecondOpen++;
    p.close();
    const log = existsSync(`${logBase}.${starts}`) ? await Bun.file(`${logBase}.${starts}`).text() : "";
    if (/Corruption: checksum mismatch|recovering from a corrupted/.test(log)) res.chromeSaidCorruption++;
    res.cycles++;
    say();
  }
} finally {
  await browser.close();
  Bun.spawnSync(["pkill", "-9", "-f", `--user-data-dir=${profile}`]);
  server.stop(true);
  console.log(JSON.stringify(res));
  process.exit(0);
}
