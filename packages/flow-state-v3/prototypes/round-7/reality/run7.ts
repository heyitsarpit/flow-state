// Round 7's reality: real IndexedDB, a real server, real kills. No fake.
// bun conformance/watch.ts --seconds 590 -- bun round-7/reality/run7.ts --only h1 --driver round-7 --out x.json
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { launch, type Browser, type Page } from "../../conformance/bench/cdp.ts";
import { startServer } from "./server.ts";

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(k);
  return i < 0 ? d : process.argv[i + 1]!;
};
const only = arg("--only", "h1").split(",");
const driver = arg("--driver", "round-7"); // a control: the same page on an older runtime
const scale = Number(arg("--n", "1"));
const dest = arg("--out", "");
const built = await Bun.build({
  entrypoints: [join(import.meta.dir, "page.ts")],
  target: "browser",
  format: "iife",
  plugins:
    driver === "round-7"
      ? []
      : [
          {
            name: "older-runtime",
            setup(b) {
              b.onResolve({ filter: /^\.\.\/(driver|entities|sessions|inc)\.ts$/ }, (a) => ({
                path: resolve(import.meta.dir, `../../${driver}`, a.path.slice(3)),
              }));
            },
          },
        ],
});
if (!built.success) throw new Error(`bundle: ${built.logs.join("\n")}`);
let onHiddenHook: ((why: string) => void) | undefined;
const srv = startServer(await built.outputs[0]!.text(), 0, { hidden: (w) => onHiddenHook?.(w) });
const control = (c: object) =>
  fetch(`${srv.url}/_control`, { method: "POST", body: JSON.stringify(c) }).then((r) => r.json());
const truth = () => fetch(`${srv.url}/_truth`).then((r) => r.json()) as Promise<any>;
const out: Record<string, any> =
  dest && existsSync(dest) ? JSON.parse(readFileSync(dest, "utf8")) : {};
const say = (k: string, v: unknown) => {
  out[`${driver}:${k}`] = v;
  console.log(k, JSON.stringify(v));
  if (dest) writeFileSync(dest, JSON.stringify(out, null, 1) + "\n");
};
const browser: Browser = await launch({ throttled: process.argv.includes("--throttled") });
out["browser"] = browser.version;
const open = async (b: Browser = browser): Promise<Page> => {
  const p = await b.newPage(srv.url);
  for (let i = 0; i < 100; i++) {
    const r = await p
      .send("Runtime.evaluate", { expression: "typeof __boot" })
      .catch(() => undefined);
    if (r?.result?.result?.value === "function") return p;
    await Bun.sleep(30);
  }
  throw new Error("page did not load");
};
const crash = async (p: Page) => {
  void p.send("Page.crash").catch(() => {});
  await Bun.sleep(150);
  p.close();
};
const sigkill = async (p: Page) => {
  await browser.kill();
  p.close();
  await browser.restart();
};
const kill = (how: "crash" | "sigkill", p: Page) => (how === "crash" ? crash(p) : sigkill(p));
const J = JSON.stringify;
const A = "Checkout/Pay/shopper";
const B = "Lab/Bare/a";
const count = (rows: any[], f: (r: any) => unknown) =>
  rows.reduce((m: any, r) => ((m[String(f(r))] = (m[String(f(r))] ?? 0) + 1), m), {});
let run = 0;
const bootPay = async (db: string, o: object = {}) => {
  const p = await open();
  const b = await p.evaluate(`__boot("pay", ${J({ db, ...o })})`);
  await p.evaluate(`__wait("__booted()")`);
  return { p, b };
};
const keysOf = (t: any, intent: string) =>
  t.charged.filter((c: any) => c.intent === intent).map((c: any) => c.key);
const settled = `["PAID","CARD","STUCK","LEFT"].includes(__view(${J(A)})?.state) || __view(${J(A)}) === undefined || __fatal()`;
try {
  // ── H1 on real IndexedDB. A real `tx.abort()` on the plain batch, the awaited ack commits. The review's trace.
  if (only.includes("h1")) {
    const rows: any[] = [];
    for (let i = 0; i < 12 * scale; i++) {
      const id = `${driver}-h1-${++run}`;
      const db = `db-${id}`;
      const intentId = `pi-${id}`;
      await control({ delay: { pay: 2500 } });
      let { p } = await bootPay(db, { captureMs: 100 });
      await p.evaluate(`__ensure(${J(A)}, "Checkout/Pay")`);
      await p.evaluate(`__send(${J(A)}, "Start", ${J({ cartId: `c-${id}`, intentId })})`);
      await Bun.sleep(250);
      // On the edge a first send is one awaited batch, so "plain" aborts the next plain batch, and "awaited" aborts the first send itself.
      await p.evaluate(arg("--abort", "plain") === "awaited" ? `__faults.abortAwaited = 1` : `__faults.abortPlain = 1`);
      await p.evaluate(`__send(${J(A)}, "PayRequested", { paymentMethodId: "visa" })`);
      await Bun.sleep(1400); // the retry would have fired by now
      const failures = await p.evaluate(`__issues().filter(x => x.code === "StorageFailure").length`);
      await crash(p);
      await control({ delay: { pay: 0 } });
      p = (await bootPay(db, { captureMs: 100 })).p;
      const restored = await p.evaluate(`__view(${J(A)})`);
      await p.evaluate(`__wait(${J(settled)}, 6000)`);
      const notice = await p.evaluate(`__view(${J(A)})?.memory?.notice`);
      if ((await p.evaluate(`__view(${J(A)})?.state`)) === "CARD") {
        await p.evaluate(`__send(${J(A)}, "PayRequested", { paymentMethodId: "visa" })`);
        await p.evaluate(`__wait(${J(settled)}, 6000)`);
      }
      const final = await p.evaluate(`__view(${J(A)})?.state`);
      p.close();
      await Bun.sleep(2600);
      const keys = keysOf(await truth(), intentId);
      rows.push({ failures, restored: restored?.state, notice, final, keys: keys.length });
    }
    say(`h1-${arg("--abort", "plain")}`, {
      cycles: rows.length,
      twoCharges: rows.filter((r) => r.keys > 1).length,
      toldNotCharged: rows.filter((r) => r.keys > 0 && /haven't been charged/.test(r.notice ?? "")).length,
      failuresSeen: rows.filter((r) => r.failures > 0).length,
      restored: count(rows, (r) => r.restored),
      final: count(rows, (r) => r.final),
      rows,
    });
  }
  // ── A batch fails after a newer one landed (O3), on the bare machine, on real IndexedDB.
  if (only.includes("order")) {
    const rows: any[] = [];
    for (let i = 0; i < 10 * scale; i++) {
      const db = `db-${driver}-order-${++run}`;
      const p = await open();
      await p.evaluate(`__boot("bare", ${J({ db, captureMs: 0 })})`);
      await p.evaluate(`__wait("__booted()")`);
      await p.evaluate(`__ensure(${J(B)}, "Lab/Bare")`);
      await p.evaluate(`__faults.abortPlain = 1`);
      // In one task: the first batch aborts, the second commits, and the abort is reported after.
      await p.evaluate(`(__send(${J(B)}, "Note", {text:"old"}), __send(${J(B)}, "Note", {text:"new"}))`);
      await Bun.sleep(1300);
      const disk = await p.evaluate(`__disk(${J(db)})`);
      rows.push(JSON.parse(disk[`actor/${B}`]).root.memory.note);
      p.close();
    }
    say("order", { cycles: rows.length, onDisk: count(rows, (r) => r) });
  }
  // ── Real quota. CDP's override is a real QuotaExceededError from Chrome's quota manager.
  if (only.includes("quota")) {
    const res: any = {};
    {
      const id = `${driver}-quota-${++run}`;
      const db = `db-${id}`;
      const p = await open();
      const quotaR = await p.send("Storage.overrideQuotaForOrigin", { origin: srv.url, quotaSize: 40_000 });
      await p.evaluate(`__boot("grow", ${J({ db, size: 2000, captureMs: 0 })})`).catch((e) => (res.bootFailed = String(e)));
      await p.evaluate(`__wait("__booted()", 3000)`);
      const G = "Bench/Grow/a";
      await p.evaluate(`__ensure(${J(G)}, "Bench/Grow")`);
      await p.evaluate(`__send(${J(G)}, "Tick", {})`);
      await Bun.sleep(3500);
      res.grow = {
        override: quotaR?.error ?? "ok",
        issues: count(await p.evaluate(`__issues()`), (x) => x.code),
        statsFailed: (await p.evaluate(`__stats()`)).failed,
        liveCount: (await p.evaluate(`__view(${J(G)})?.memory?.count`)),
        onDiskWhileFull: Object.keys(await p.evaluate(`__disk(${J(db)})`)),
        fatal: await p.evaluate(`__fatal()`),
      };
      const writes0 = (await p.evaluate(`__stats()`)).writes;
      await p.send("Storage.overrideQuotaForOrigin", { origin: srv.url, quotaSize: 500_000_000 });
      await Bun.sleep(8200);
      const disk = await p.evaluate(`__disk(${J(db)})`);
      res.grow.afterRoomMade = disk[`actor/${G}`] ? JSON.parse(disk[`actor/${G}`]).root.memory.count : null;
      res.grow.retriesWhileWaiting = (await p.evaluate(`__stats()`)).writes - writes0;
      await p.send("Storage.overrideQuotaForOrigin", { origin: srv.url });
      p.close();
    }
    // Pay when the disk is full: its ack cannot land. Nothing may leave.
    {
      const rows: any[] = [];
      for (let i = 0; i < 6 * scale; i++) {
        const id = `${driver}-quota-${++run}`;
        const db = `db-${id}`;
        const intentId = `pi-${id}`;
        const { p } = await bootPay(db, { captureMs: 0 });
        await p.evaluate(`__ensure(${J(A)}, "Checkout/Pay")`);
        await p.evaluate(`__send(${J(A)}, "Start", ${J({ cartId: `c-${id}`, intentId })})`);
        await Bun.sleep(80);
        await p.send("Storage.overrideQuotaForOrigin", { origin: srv.url, quotaSize: 10 });
        await p.evaluate(`__send(${J(A)}, "PayRequested", { paymentMethodId: "visa" })`);
        await Bun.sleep(600);
        const v = await p.evaluate(`__view(${J(A)})`);
        const iss = await p.evaluate(`__issues()`);
        const ev = await p.evaluate(`__ev("ending").map(e => [e.op, e.channel ?? e.ch, e.reason ?? e.tag].join(":"))`);
        await p.send("Storage.overrideQuotaForOrigin", { origin: srv.url });
        p.close();
        const t = await truth();
        rows.push({ state: v?.state, notice: v?.memory?.notice, ending: ev.at(-1), issues: [...new Set(iss.map((x: any) => x.code))], keys: keysOf(t, intentId).length });
      }
      res.pay = { cycles: rows.length, charged: rows.filter((r) => r.keys > 0).length, states: count(rows, (r) => r.state), endings: count(rows, (r) => r.ending), issues: count(rows, (r) => r.issues.join("+")) };
    }
    say("quota", res);
  }
  // ── The kill table, Pay unchanged, no sleep before the reopen, brand-new databases, oracle `charged && no lane`.
  if (only.includes("kills")) {
    const rows: any[] = [];
    const cycle = async (how: "crash" | "sigkill", killMs: number, payDelay: number, marker: boolean) => {
      const id = `${driver}-k-${++run}`;
      const db = `db-${id}`;
      const intentId = `pi-${id}`;
      const cartId = `c-${id}`;
      await control({ delay: { pay: payDelay } });
      let { p } = await bootPay(db, { marker });
      await p.evaluate(`__ensure(${J(A)}, "Checkout/Pay")`);
      await p.evaluate(`__send(${J(A)}, "Start", ${J({ cartId, intentId })})`);
      const click = `__send(${J(A)}, "PayRequested", { paymentMethodId: "visa" })`;
      if (killMs < 0) {
        void p.send("Runtime.evaluate", { expression: click });
        await Bun.sleep(-killMs - 1);
      } else {
        await p.evaluate(click);
        await Bun.sleep(killMs);
      }
      await kill(how, p);
      await control({ delay: { pay: 0 } });
      p = (await bootPay(db, { marker })).p;
      const restored = await p.evaluate(`__view(${J(A)})`);
      const lanes = await p.evaluate(`__lanes()`);
      const ended = await p.evaluate(`__wait(${J(settled)}, 9000)`);
      const final = await p.evaluate(`__view(${J(A)})`);
      const iss = await p.evaluate(`__issues()`);
      const fatal = await p.evaluate(`__fatal()`);
      const endings = await p.evaluate(`__ev("ending").filter(e => e.op === "pay").map(e => (e.channel ?? e.ch) + ":" + (e.reason ?? e.tag))`);
      p.close();
      await Bun.sleep(payDelay + 30);
      const t = await truth();
      const keys = keysOf(t, intentId);
      const myJ = t.journal.filter((j: any) => j.op === "pay" && keys.includes(j.key));
      rows.push({
        how, killMs, payDelay, marker,
        restored: restored?.state ?? null,
        lanes: lanes.length,
        final: final?.state ?? null,
        ended,
        keys: keys.length,
        replays: myJ.filter((j: any) => j.what === "replayed").length,
        placeKeys: new Set(t.journal.filter((j: any) => j.op === "place" && j.what === "applied").map((j: any) => j.key)).size > 0 ? t.orders.filter(([c]: [string]) => c === cartId).length : 0,
        fatal,
        notSent: endings.some((e: string) => /Restored/.test(e) && e.startsWith("failure")),
        unknown: endings.some((e: string) => /Restored/.test(e) && e.startsWith("unknown")),
        issues: iss.map((x: any) => x.code),
        told: /haven't been charged/.test(final?.memory?.notice ?? ""),
      });
    };
    for (const how of ["crash", "sigkill"] as const)
      for (const [k, d] of [[0, 40], [3, 40], [8, 40], [15, 40], [30, 200], [60, 200], [120, 40], [200, 300], [5, 0], [20, 0], [40, 0], [80, 0], [-1, 40], [-1, 40], [-1, 40], [-2, 40], [-2, 40], [-3, 40], [-3, 40], [-4, 40]] as const)
        await cycle(how, k, d, true);
    const lost = rows.filter((r) => r.keys > 0 && r.restored === null && r.lanes === 0);
    say("kills", {
      cycles: rows.length,
      doubleCharge: rows.filter((r) => r.keys > 1).length,
      chargedNoLane: lost.length,
      toldNotChargedAndCharged: rows.filter((r) => r.told && r.keys > 0).length,
      fatal: rows.filter((r) => r.fatal).length,
      unsettled: rows.filter((r) => !r.ended).length,
      notSentRestored: rows.filter((r) => r.notSent).length,
      unknownRestored: rows.filter((r) => r.unknown).length,
      replays: rows.reduce((n, r) => n + r.replays, 0),
      restored: count(rows, (r) => r.restored),
      final: count(rows, (r) => r.final),
      issues: [...new Set(rows.flatMap((r) => r.issues))],
      lost,
      rows,
    });
  }
  // ── H3's table: SIGKILL within milliseconds of the click, brand-new database. With and without the marker.
  if (only.includes("h3")) {
    const rows: any[] = [];
    const n = 60 * scale;
    for (const marker of (arg("--markers", "true,false").split(",").map((x) => (x === "true" ? true : x === "false" ? false : x)) as boolean[]))
      for (let i = 0; i < n; i++) {
        const id = `${driver}-h3-${++run}`;
        const db = `db-${id}`;
        const intentId = `pi-${id}`;
        await control({ delay: { pay: 0 } });
        const { p } = await bootPay(db, { marker, captureMs: 0 });
        await p.evaluate(`__ensure(${J(A)}, "Checkout/Pay")`);
        // No `before` read, no other wait: the first writes of a first visit.
        void p.send("Runtime.evaluate", { expression: `__send(${J(A)}, "Start", ${J({ cartId: `c-${id}`, intentId })}), __send(${J(A)}, "PayRequested", { paymentMethodId: "visa" })` });
        await Bun.sleep(1 + (i % 8));
        await sigkill(p);
        const q0 = await open();
        const onDisk = Object.keys(await q0.evaluate(`__disk(${J(db)})`));
        q0.close();
        const q = (await bootPay(db, { marker })).p;
        const lanes = await q.evaluate(`__lanes()`);
        const state = await q.evaluate(`__view(${J(A)})?.state`);
        q.close();
        await Bun.sleep(20);
        const keys = keysOf(await truth(), intentId);
        rows.push({ marker, keys: keys.length, lanes: lanes.length, state: state ?? null, charged: keys.length > 0, onDisk });
      }
    const of = (m: unknown) => {
      const r = rows.filter((x) => x.marker === m);
      return { cycles: r.length, charged: r.filter((x) => x.charged).length, chargedNoLane: r.filter((x) => x.charged && x.lanes === 0 && x.state !== "PAID" && x.state !== "PLACING").length, doubleCharge: r.filter((x) => x.keys > 1).length, states: count(r, (x) => x.state) };
    };
    say(`h3-${arg("--markers", "both")}`, { marker: of(true), noMarker: of(false), reopen: of("reopen"), rows });
  }
  // ── M1: a machine with no reconcile. Killed right after a success. Live B; does it come back as a hold?
  if (only.includes("bare")) {
    const rows: any[] = [];
    for (const how of ["crash", "sigkill"] as const)
      for (const k of [0, 5, 20, 50, 80, 150])
        for (let i = 0; i < 4 * scale; i++) {
          const id = `${driver}-b-${++run}`;
          const db = `db-${id}`;
          const cap = driver === "round-7" ? {} : { captureMs: 100 };
          const p = await open();
          await p.evaluate(`__boot("bare", ${J({ db, ...cap })})`);
          await p.evaluate(`__wait("__booted()")`);
          await p.evaluate(`__ensure(${J(B)}, "Lab/Bare")`);
          await p.evaluate(`__send(${J(B)}, "Go", {})`);
          await p.evaluate(`__wait('__view(${J(B)})?.state === "B"', 3000)`);
          await Bun.sleep(k);
          await kill(how, p);
          const q = await open();
          await q.evaluate(`__boot("bare", ${J({ db, ...cap })})`);
          await q.evaluate(`__wait("__booted()")`);
          await Bun.sleep(100);
          const s = await q.evaluate(`__view(${J(B)})?.state`);
          const ls = await q.evaluate(`__lanes()`);
          q.close();
          rows.push({ how, k, state: s ?? null, held: ls.length > 0 });
        }
    say("bare", { cycles: rows.length, states: count(rows, (r) => r.state), held: rows.filter((r) => r.held).length, byKill: count(rows, (r) => `${r.how} ${r.k}: ${r.state}`) });
  }
  // ── D80: 0, 100, 500, 5,000 ms, by the same runtime bench as round 6, with busy measured. 10,000 at 6x is a stress test, not a target.
  if (only.includes("cost")) {
    const rows: any[] = [];
    const p = await open();
    await p.evaluate(`__boot("grow", ${J({ db: "unused-cost", size: 1, persist: false })})`);
    for (const rate of [1, 6]) {
      await p.send("Emulation.setCPUThrottlingRate", { rate });
      for (const size of [1000, 10_000])
        for (const captureMs of [0, 100, 500, 5000]) {
          await p.send("Performance.enable", { timeDomain: "threadTicks" }).catch(() => {});
          const before = await p.send("Performance.getMetrics");
          const n = captureMs === 5000 ? 960 : 240;
          const r: any = await p.evaluate(`__s3runtime(${J({ size, n, gapMs: 16, captureMs })})`, 180_000);
          const after = await p.send("Performance.getMetrics");
          const m = (x: any, k: string) => x.result.metrics.find((y: any) => y.name === k)?.value ?? 0;
          const busy = (m(after, "TaskDuration") - m(before, "TaskDuration")) / (m(after, "Timestamp") - m(before, "Timestamp"));
          rows.push({ rate, ...r, busyPct: Math.round(busy * 100), mbPerSec: Math.round((r.mbWritten / r.seconds) * 10) / 10 });
          console.log(J(rows.at(-1)));
        }
    }
    // M3: the 42% against "0 long tasks": the same case at n = 60 and 240.
    await p.send("Emulation.setCPUThrottlingRate", { rate: 6 });
    const lt: any[] = [];
    for (const n of [60, 240]) {
      lt.push(await p.evaluate(`__s3runtime(${J({ size: 10_000, n, gapMs: 16, captureMs: 100 })})`, 120_000));
    }
    await p.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    p.close();
    say("cost", { rows, longTaskCheck: lt });
  }
  // ── The edge's real table. E2 at the review's 72 cycles: a batch aborts, memory moves on, a kill at each offset. W with no lane is the bug.
  if (only.includes("e2")) {
    const rows: any[] = [];
    for (const mode of ["awaited", "plain"] as const)
      for (const k of [0, 2, 5, 10, 25, 50])
        for (let i = 0; i < 6; i++) {
          const db = `db-e2-${++run}`;
          const p = await open();
          await p.evaluate(`__boot("bare", ${J({ db, captureMs: 0 })})`);
          await p.evaluate(`__wait("__booted()")`);
          await p.evaluate(`__ensure(${J(B)}, "Lab/Bare")`);
          await Bun.sleep(30);
          await p.evaluate(mode === "awaited" ? `__faults.abortAwaited = 1` : `__faults.abortPlain = 1`);
          void p.send("Runtime.evaluate", { expression: `__send(${J(B)}, "Go", {}), __send(${J(B)}, "Note", {text:"x"})` });
          await Bun.sleep(k);
          await sigkill(p);
          const q = await open();
          await q.evaluate(`__boot("bare", ${J({ db })})`);
          await q.evaluate(`__wait("__booted()")`);
          const s = await q.evaluate(`__view(${J(B)})?.state`);
          const l = await q.evaluate(`__lanes()`);
          q.close();
          rows.push({ mode, k, state: s ?? null, lanes: l.length });
        }
    say("e2", { cycles: rows.length, waitsForNothing: rows.filter((r) => r.state === "W" && r.lanes === 0).length, by: count(rows, (r) => `${r.mode} ${r.state} lanes=${r.lanes}`) });
  }
  // ── H3's question on the edge: a batch out at hide can cost an ack. How often does a charge become a hold? Measured at the worst moment: hide right when the success turn runs.
  if (only.includes("hideout")) {
    const rows: any[] = [];
    for (const how of ["navigate", "tab+kill"] as const)
      for (const lag of [0, 2, 10, 50])
        for (let i = 0; i < 5; i++) {
          const db = `db-ho-${++run}`;
          let beacons = 0;
          const p = await open();
          await p.evaluate(`__boot("bare", ${J({ db, beacon: true })})`);
          await p.evaluate(`__wait("__booted()")`);
          await p.evaluate(`__ensure(${J(B)}, "Lab/Bare")`);
          await p.evaluate(`__flush()`);
          await p.evaluate(`__send(${J(B)}, "Go", {})`);
          await p.evaluate(`__wait('__view(${J(B)})?.state === "B"', 3000)`);
          await Bun.sleep(lag);
          let killed = false;
          if (how === "navigate") void p.send("Page.navigate", { url: "about:blank" }).catch(() => {});
          else {
            onHiddenHook = () => {
              beacons++;
              if (!killed) {
                killed = true;
                void browser.kill();
              }
            };
            // Bounded: the kill can land while this tab is still connecting.
            const other = await Promise.race([browser.newPage("about:blank").catch(() => undefined), Bun.sleep(800).then(() => undefined)]);
            if (other) void other.send("Page.bringToFront").catch(() => {});
          }
          await Bun.sleep(how === "navigate" ? 300 : 400);
          onHiddenHook = undefined;
          if (killed) {
            p.close();
            await browser.restart();
          } else if (how !== "navigate") p.close();
          const q = await open();
          const d = await q.evaluate(`__disk(${J(db)})`);
          console.log(how, lag, Object.keys(d).length);
          q.close();
          const rec = d[`actor/${B}`] ? JSON.parse(d[`actor/${B}`]) : null;
          rows.push({ how, lag, leaf: rec?.root?.leaf, lane: Object.keys(d).some((x) => x.startsWith("lane/")) });
          if (how === "navigate") p.close();
        }
    say("hideout", { cycles: rows.length, hold: rows.filter((r) => r.lane).length, by: count(rows, (r) => `${r.how} ${r.lag}ms ${r.leaf} lane=${r.lane}`) });
  }
  // ── Two tabs, D26: the second tab declines a persisted commit. And a frozen owner.
  if (only.includes("tabs2")) {
    const db = `db-t2-${++run}`;
    const intentId = "pi-t2";
    const a = await open();
    await a.evaluate(`__boot("pay", ${J({ db })})`);
    await a.evaluate(`__wait("__booted()")`);
    await a.evaluate(`__ensure(${J(A)}, "Checkout/Pay")`);
    await a.evaluate(`__send(${J(A)}, "Start", ${J({ cartId: "t2", intentId })})`);
    await a.evaluate(`__flush()`);
    const b = await open();
    const bb = await b.evaluate(`__boot("pay", ${J({ db })})`);
    await b.evaluate(`__wait("__booted()")`);
    await b.evaluate(`__ensure(${J(A)}, "Checkout/Pay")`);
    await b.evaluate(`__send(${J(A)}, "Start", ${J({ cartId: "t2", intentId })})`);
    await b.evaluate(`__send(${J(A)}, "PayRequested", { paymentMethodId: "visa" })`);
    await Bun.sleep(400);
    const view = await b.evaluate(`__view(${J(A)})`);
    const end = await b.evaluate(`__ev("ending").map(e => (e.channel ?? e.ch) + ":" + (e.reason ?? e.tag))`);
    const t = await truth();
    a.close();
    b.close();
    say("tabs2", { secondOwner: bb.owner, state: view?.state, notice: view?.memory?.notice, endings: end, keys: keysOf(t, intentId).length });
  }
  // ── The two plants a fake cannot see: every batch commits, and durability follows the ticket.
  if (only.includes("spy")) {
    const p = await open();
    const r = await p.evaluate(`(async () => {
      const seen = [];
      const make = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function (...a) {
        const tx = make.apply(this, a);
        const row = { durability: a[2]?.durability, commit: false };
        seen.push(row);
        const c = tx.commit.bind(tx);
        tx.commit = () => { row.commit = true; return c(); };
        return tx;
      };
      await __boot("bare", { db: "db-spy-${++run}" });
      await __wait("__booted()");
      __ensure(${J(B)}, "Lab/Bare");
      __flush();
      await new Promise((r) => setTimeout(r, 40));
      __send(${J(B)}, "Note", { text: "x" });
      __flush();
      await new Promise((r) => setTimeout(r, 40));
      __send(${J(B)}, "Go", {});
      await new Promise((r) => setTimeout(r, 200));
      IDBDatabase.prototype.transaction = make;
      return seen;
    })()`);
    p.close();
    say("spy", { txs: r.filter((x: any) => x.durability), commitAlways: r.filter((x: any) => x.durability).every((x: any) => x.commit) });
  }
  // ── D80's flush. What survives when the page goes hidden, or leaves, and is killed then. See cli notes in RESULTS.
  if (only.includes("hide")) {
    const G = "Bench/Grow/a";
    const rows: any[] = [];
    const noCommit = process.argv.includes("--no-explicit-commit");
    const cycle = async (trigger: string, killMs: number | "at-beacon" | "none", size: number) => {
      let beacons = 0;
      onHiddenHook = () => void beacons++;
      const db = `db-${driver}-hide-${++run}`;
      const p = await open();
      await p.evaluate(`__boot("grow", ${J({ db, size, beacon: true, captureMs: 5000, noExplicitCommit: noCommit })})`);
      await p.evaluate(`__wait("__booted()")`);
      await p.evaluate(`__ensure(${J(G)}, "Bench/Grow")`);
      await p.evaluate(`__flush()`); // the actor's first record, so a loss reads as a count
      await Bun.sleep(40);
      await p.evaluate(`__send(${J(G)}, "Tick", {}), __send(${J(G)}, "Tick", {}), __send(${J(G)}, "Tick", {})`);
      const started = Date.now();
      let killed = false;
      const doKill = async () => {
        if (killed) return;
        killed = true;
        await browser.kill();
      };
      if (killMs === "at-beacon") onHiddenHook = () => (beacons++, void doKill());
      // The real triggers.
      let fired: any = null;
      if (trigger === "navigate") void p.send("Page.navigate", { url: "about:blank" });
      else if (trigger === "reload") void p.send("Page.reload");
      else if (trigger === "closeTab") p.close();
      else if (trigger === "newTab") {
        // The hidden event can kill the browser while this tab is still connecting: that is the point of the case.
        const other = await browser.newPage("about:blank").catch(() => undefined);
        await other?.send("Page.bringToFront").catch(() => {});
        (p as any)._other = other;
      } else if (trigger === "kill-only") {
        /* nothing: the baseline */
      } else if (trigger === "crash-now") void p.send("Page.crash").catch(() => {});
      if (killMs !== "at-beacon" && killMs !== "none") {
        await Bun.sleep(killMs as number);
        await doKill();
      } else if (killMs === "at-beacon") {
        for (let i = 0; i < 100 && !killed; i++) await Bun.sleep(10);
        if (!killed) await doKill();
      } else await Bun.sleep(400);
      onHiddenHook = undefined;
      if (killed) {
        p.close();
        await browser.restart();
      } else if (trigger !== "closeTab") {
        // A crashed target never answers: bounded here, or the run hangs.
        fired = await Promise.race([
          p.evaluate(`typeof __seen === "undefined" ? null : __seen`, 800).catch(() => null),
          Bun.sleep(1000).then(() => null),
        ]);
        (p as any)._other?.close();
        p.close();
      }
      const q = await open();
      const disk = await q.evaluate(`__disk(${J(db)})`);
      q.close();
      const rec = disk[`actor/${G}`] ? JSON.parse(disk[`actor/${G}`]) : null;
      rows.push({ trigger, killMs, size, count: rec?.root?.memory?.count ?? null, ms: Date.now() - started, fired, beacons });
    };
    const N = 6 * scale;
    let failedCycles = 0;
    const guarded = cycle;
    const safe = async (...a: Parameters<typeof cycle>) => {
      try {
        await guarded(...a);
      } catch {
        failedCycles++; // the harness lost the page; the cycle says nothing, and is counted
        await browser.restart().catch(() => {});
      }
    };
    for (const size of arg("--sizes", "100,10000").split(",").map(Number)) {
      for (let i = 0; i < N; i++) await safe("kill-only", 20, size);
      for (let i = 0; i < N; i++) await safe("navigate", "none", size);
      for (let i = 0; i < N; i++) await safe("reload", "none", size);
      for (let i = 0; i < N; i++) await safe("navigate", "at-beacon", size);
      for (const k of [0, 2, 5, 10, 25, 50])
        for (let i = 0; i < N; i++) await safe("navigate", k, size);
      for (let i = 0; i < N; i++) await safe("newTab", "none", size);
      for (let i = 0; i < N; i++) await safe("newTab", "at-beacon", size);
      for (let i = 0; i < N; i++) await safe("crash-now", "none", size);
      for (let i = 0; i < N; i++) await safe("closeTab", "none", size);
    }
    const tbl: Record<string, any> = {};
    for (const r of rows) {
      const k = `${r.size} ${r.trigger} ${r.killMs}`;
      const t = (tbl[k] ??= { cycles: 0, newest: 0, older: 0, nothing: 0, beacon: 0 });
      t.cycles++;
      if (r.count === 3) t.newest++;
      else if (r.count === null) t.nothing++;
      else t.older++;
      if (r.beacons > 0) t.beacon++;
    }
    say(`hide-${noCommit ? "autocommit-" : "commit-"}${arg("--sizes", "all")}`, { failedCycles, tbl, rows });
  }
} catch (e) {
  say("error", String((e as Error).stack ?? e));
} finally {
  out["peakMb"] = browser.peakMb();
  await browser.close();
  srv.stop();
  if (dest) writeFileSync(dest, JSON.stringify(out, null, 1) + "\n");
  console.log("peakMb", out["peakMb"]);
  process.exit(0);
}
