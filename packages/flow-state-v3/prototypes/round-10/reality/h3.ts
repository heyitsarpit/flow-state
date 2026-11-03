// H3: who deletes an origin's IndexedDB after a main-process kill? No runtime, no suite: one page, raw IndexedDB, a sentinel committed `strict`, then a kill while strict writes run, then a restart and a read.
// Throwaway profiles under the directory given. The directory is listed after the kill and after the restart, so a loss can be placed. On a wipe the Chrome log is kept, with the previous good cycle's.
// bun conformance/watch.ts --seconds 280 -- bun round-9/reality/h3.ts --kill main --cycles 80 --dir <scratch> --out x.json [--fresh] [--v]
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch } from "../../conformance/bench/cdp.ts";
import { exitScored } from "./score.ts";

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(k);
  return i < 0 ? d : process.argv[i + 1]!;
};
const kind = arg("--kill", "main") as "main" | "tree" | "crash";
const cycles = Number(arg("--cycles", "40"));
const base = arg("--dir", "");
if (!base) throw new Error("--dir: a throwaway directory");
const fresh = process.argv.includes("--fresh"); // a new profile each cycle, as the review's temp profiles; otherwise one profile lives through the run
const gapMs = Number(arg("--gap", "0")); // how long after a kill before the restart; a child of the old browser may still be alive
const noWait = process.argv.includes("--no-wait"); // do not wait for the old browser's children to exit
const verbose = process.argv.includes("--v");
const page = `<!doctype html><title>h3</title>`;
const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response(page, { headers: { "content-type": "text/html" } }) });
const url = `http://127.0.0.1:${server.port}/`;

const IDB = `
globalThis.__open = (n) => new Promise((res, rej) => { const r = indexedDB.open(n, 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
globalThis.__put = (db, k, v) => new Promise((res, rej) => { const t = db.transaction("kv", "readwrite", { durability: "strict" }); t.objectStore("kv").put(v, k); t.oncomplete = () => res(); t.onabort = () => rej(t.error); });
globalThis.__get = (db, k) => new Promise((res, rej) => { const q = db.transaction("kv").objectStore("kv").get(k); q.onsuccess = () => res(q.result ?? null); q.onerror = () => rej(q.error); });
globalThis.__loop = async () => { const db = await __open("flow"); for (let i = 0;; i++) { await __put(db, "n", i); } };
0`;
const walk = (dir: string, out: string[] = []) => {
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else out.push(`${p.slice(dir.length + 1)} ${s.size}`);
  }
  return out;
};
const idbDirs = (profile: string) => {
  // Where this Chrome keeps it: Default/IndexedDB, or a bucket's own folder under Default/WebStorage.
  const found: string[] = [];
  const scan = (d: string) => {
    if (!existsSync(d)) return;
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (!statSync(p).isDirectory()) continue;
      if (n.endsWith(".leveldb")) found.push(p);
      else scan(p);
    }
  };
  scan(join(profile, "Default"));
  return found;
};
const listing = (profile: string) => Object.fromEntries(idbDirs(profile).map((d) => [d.slice(profile.length + 1), walk(d)]));
const children = (profile: string) =>
  Bun.spawnSync(["pgrep", "-f", `--user-data-dir=${profile}`]).stdout.toString().trim().split("\n").filter(Boolean).length;
const reap = (profile: string) => void Bun.spawnSync(["pkill", "-9", "-f", `--user-data-dir=${profile}`]);

const res = { kind, fresh, gapMs, noWait, cycles: 0, ok: 0, wiped: 0, noSentinelYet: 0, errors: 0, wipes: [] as unknown[], childrenSeenAtRestart: 0 };
const out = arg("--out", "");
const say = () => out && writeFileSync(out, JSON.stringify(res, null, 1) + "\n");
const t0 = Date.now();
let profile = join(base, `p-${kind}-${Date.now()}`);
mkdirSync(profile, { recursive: true });
const logBase = join(base, `log-${kind}-${Date.now()}`);
const args = verbose ? ["--enable-logging=stderr", "--v=1"] : [];
let browser = await launch({ profile, args, logFile: logBase });
let starts = 1;
const openPage = async () => {
  const p = await browser.newPage(url);
  for (let i = 0; i < 100; i++) {
    const v = await p.evaluate(`document.readyState`).catch(() => undefined);
    if (v === "complete") break;
    await Bun.sleep(20);
  }
  await p.evaluate(IDB);
  return p;
};
// The sentinel: committed, strict, well before the kill, on another database of the same origin.
const seed = async () => {
  const p = await openPage();
  await p.evaluate(`(async () => { const d = await __open("sentinel"); await __put(d, "s", ${Date.now()}); d.close(); })()`);
  await Bun.sleep(300);
  return p;
};
let p = await seed();
let lastGood = 0;
try {
  for (let i = 0; i < cycles && Date.now() - t0 < Number(arg("--seconds", "250")) * 1000; i++) {
    void p.evaluate(`__loop()`).catch(() => {});
    await Bun.sleep(30 + Math.random() * 120);
    if (kind === "main") await browser.killMain();
    else if (kind === "tree") await browser.killTree();
    else await browser.crashBrowser();
    p.close();
    let left = children(profile);
    if (!noWait) {
      for (let k = 0; k < 200 && left > 0; k++) {
        await Bun.sleep(25);
        left = children(profile);
      }
      if (left > 0) reap(profile);
    } else if (left > 0) res.childrenSeenAtRestart++;
    if (gapMs) await Bun.sleep(gapMs);
    const afterKill = listing(profile);
    // The bytes as the kill left them, before Chrome reads them: the wipe's evidence is otherwise gone by the first open.
    const pre = join(base, "pre");
    rmSync(pre, { recursive: true, force: true });
    for (const d of idbDirs(profile)) cpSync(d, join(pre, d.split("/").at(-1)!), { recursive: true });
    await browser.restart();
    starts++;
    const afterRestart = listing(profile);
    p = await openPage();
    const dbs = await p.evaluate(`indexedDB.databases().then(x => x.map(d => d.name).sort().join(","))`);
    const sentinel = await p.evaluate(`(async () => { const d = await __open("sentinel"); const v = await __get(d, "s"); d.close(); return v; })()`);
    const afterOpen = listing(profile);
    res.cycles++;
    if (sentinel === null) {
      res.wiped++;
      const keep = join(base, `wipe-${kind}-${res.wiped}-${Date.now()}`);
      mkdirSync(keep, { recursive: true });
      for (const [n, s] of [["bad", starts], ["good", lastGood]] as const)
        if (s && existsSync(`${logBase}.${s}`)) cpSync(`${logBase}.${s}`, join(keep, `chrome-${n}.log`));
      for (const d of idbDirs(profile)) cpSync(d, join(keep, d.split("/").at(-1)!), { recursive: true });
      if (existsSync(join(base, "pre"))) cpSync(join(base, "pre"), join(keep, "pre"), { recursive: true });
      res.wipes.push({ cycle: i, dbs, keep, afterKill, afterRestart, afterOpen });
      await p.evaluate(`(async () => { const d = await __open("sentinel"); await __put(d, "s", ${Date.now()}); d.close(); })()`);
      await Bun.sleep(100);
    } else {
      res.ok++;
      lastGood = starts;
    }
    say();
    if (verbose) for (let s = 1; s < starts; s++) if (s !== lastGood) rmSync(`${logBase}.${s}`, { force: true });
    if (fresh) {
      p.close();
      await browser.close();
      reap(profile);
      rmSync(profile, { recursive: true, force: true });
      profile = join(base, `p-${kind}-${Date.now()}`);
      mkdirSync(profile, { recursive: true });
      browser = await launch({ profile, args, logFile: logBase });
      starts = 1;
      p = await seed();
    }
  }
} finally {
  p.close();
  await browser.close();
  reap(profile);
  server.stop(true);
  say();
  console.log(JSON.stringify({ ...res, wipes: res.wipes.length, peakMb: browser.peakMb() }));
  // D144: H3 measures Chrome's own wipes, with no runtime in the page. A wipe is its result, not a failure; an error in the harness is.
  exitScored({ ...(res.errors > 0 ? { error: `${res.errors} harness errors` } : {}) });
}
