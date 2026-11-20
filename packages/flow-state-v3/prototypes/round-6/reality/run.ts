// Round 6's main proof: the runtime on real IndexedDB, in headless Chrome over raw CDP, against a real local server.
// bun conformance/watch.ts --seconds 500 -- bun round-6/reality/run.ts [--only s3,atom,crash,tabs,desk] --out round-6/reality/results.json
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { launch, type Browser, type Page } from "../../conformance/bench/cdp.ts";
import { startServer } from "./server.ts";

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(k);
  return i < 0 ? d : process.argv[i + 1]!;
};
const only = arg("--only", "s3,atom,crash,tabs,desk").split(",");
const built = await Bun.build({
  entrypoints: [join(import.meta.dir, "page.ts")],
  target: "browser",
  format: "iife",
});
if (!built.success) throw new Error(`bundle: ${built.logs.join("\n")}`);
const srv = startServer(await built.outputs[0]!.text());
const control = (c: object) =>
  fetch(`${srv.url}/_control`, { method: "POST", body: JSON.stringify(c) }).then((r) => r.json());
const truth = () => fetch(`${srv.url}/_truth`).then((r) => r.json()) as Promise<any>;
const out: Record<string, any> = {};
const say = (k: string, v: unknown) => {
  out[k] = v;
  console.log(k, JSON.stringify(v));
};
const browser: Browser = await launch();
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
const A = "Checkout/Pay/shopper";
try {
  // ── S3: what a commit costs. At 1x and 6x.
  if (only.includes("s3")) {
    const p = await open();
    const store: unknown[] = [];
    for (const rate of [1, 6]) {
      await p.send("Emulation.setCPUThrottlingRate", { rate });
      for (const messages of [100, 1000, 10_000])
        for (const mode of ["json", "memo", "clone", "chunks", "log"])
          for (const durability of rate === 1 && messages === 1000
            ? ["relaxed", "strict"]
            : ["relaxed"]) {
            const n = messages >= 10_000 ? 30 : 100;
            store.push({
              rate,
              ...(await p.evaluate(
                `__s3store(${JSON.stringify({ messages, n, durability, mode })})`,
              )),
            });
          }
    }
    say("s3store", store);
    const rtm: unknown[] = [];
    for (const rate of [1, 6]) {
      await p.send("Emulation.setCPUThrottlingRate", { rate });
      for (const size of [100, 1000, 10_000])
        for (const captureMs of [0, 100, 500])
          rtm.push({
            rate,
            ...(await p.evaluate(
              `__s3runtime(${JSON.stringify({ size, n: size >= 10_000 ? 60 : 100, gapMs: 16, captureMs })})`,
            )),
          });
    }
    say("s3runtime", rtm);
    await p.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    p.close();
  }
  // ── Multi-key atomicity and durability under real kills. Each cycle: ten keys in one transaction, in a loop; kill; read back.
  if (only.includes("atom")) {
    const res: any[] = [];
    for (const how of ["crash", "sigkill"] as const)
      for (const durability of ["relaxed", "strict"] as const) {
        let torn = 0;
        let lostAcked = 0;
        let cycles = 0;
        let maxLag = 0;
        const name = `atom-${how}-${durability}`;
        for (let i = 0; i < 14; i++) {
          const p = await open();
          void p
            .evaluate(`__atomLoop(${JSON.stringify({ name, keys: 10, durability, pad: 2000 })})`)
            .catch(() => {});
          await Bun.sleep(150 + Math.random() * 350);
          if (how === "crash") await crash(p);
          else {
            await browser.kill();
            p.close();
            await browser.restart();
          }
          await Bun.sleep(100); // a late /_ack, sent before the kill, may still land: an honest race in our favour only if it arrived
          const q = await open();
          const vals = (await q.evaluate(
            `__atomRead(${JSON.stringify({ name, keys: 10 })})`,
          )) as Array<string | undefined>;
          q.close();
          const acked = (await truth()).acks[name] ?? 0;
          cycles++;
          if (new Set(vals).size !== 1) torn++;
          const got = Number(vals[0] ?? 0);
          if (got < acked) {
            lostAcked++;
            maxLag = Math.max(maxLag, acked - got);
          }
        }
        res.push({ how, durability, cycles, torn, lostAcked, maxLag });
      }
    say("atom", res);
  }
  // ── Pay on real IndexedDB and a real server, killed during writes. Pay is unchanged.
  if (only.includes("crash")) {
    const rows: any[] = [];
    const script = async (
      i: number,
      how: "crash" | "sigkill",
      killMs: number,
      payDelay: number,
    ) => {
      const t0 = Date.now();
      const db = `pay-${how}-${i}`;
      const intentId = `pi-${how}-${i}`;
      const cartId = `c-${how}-${i}`;
      await control({ delay: { pay: payDelay } });
      let p = await open();
      const booted = await p.evaluate(`__boot("pay", ${JSON.stringify({ db })})`);
      await p.evaluate(`__wait("__booted()")`);
      await p.evaluate(`__ensure(${JSON.stringify(A)}, "Checkout/Pay")`);
      await p.evaluate(
        `__send(${JSON.stringify(A)}, "Start", ${JSON.stringify({ cartId, intentId })})`,
      );
      // killMs < 0: the kill leaves with the click, no wait in between, to reach the window before the acknowledgement commits.
      let before: string | null = "raced";
      if (killMs < 0) {
        void p.send("Runtime.evaluate", {
          expression: `__send(${JSON.stringify(A)}, "PayRequested", { paymentMethodId: "visa" })`,
        });
        await Bun.sleep(-killMs - 1);
      } else {
        await p.evaluate(
          `__send(${JSON.stringify(A)}, "PayRequested", { paymentMethodId: "visa" })`,
        );
        await Bun.sleep(killMs);
        before = (await p.evaluate(`__view(${JSON.stringify(A)})?.state`)) as string;
      }
      if (how === "crash") await crash(p);
      else {
        await browser.kill();
        p.close();
        await browser.restart();
      }
      await Bun.sleep(payDelay + 50); // the server finishes what it had, or never heard it
      await control({ delay: { pay: 0 } });
      p = await open();
      await p.evaluate(`__boot("pay", ${JSON.stringify({ db })})`);
      await p.evaluate(`__wait("__booted()")`);
      const restored = await p.evaluate(`__view(${JSON.stringify(A)})`);
      const settled = await p.evaluate(
        `__wait('["PAID","CARD","STUCK","LEFT"].includes(__view(${JSON.stringify(A)})?.state) || __view(${JSON.stringify(A)}) === undefined || __fatal()', 9000)`,
      );
      const final = await p.evaluate(`__view(${JSON.stringify(A)})`);
      const issues = await p.evaluate(`__issues()`);
      const fatal = await p.evaluate(`__fatal()`);
      const lanes = await p.evaluate(`__lanes()`);
      p.close();
      const t = await truth();
      const keys = t.charged.filter((c: any) => c.intent === intentId).map((c: any) => c.key);
      const myKeys = t.journal.filter((j: any) => j.op === "pay" && keys.includes(j.key));
      return {
        how,
        killMs,
        payDelay,
        owner: booted.owner,
        before,
        restored: restored?.state ?? null,
        final: final?.state ?? null,
        settled,
        keys: keys.length,
        arrived: t.journal.filter((j: any) => j.op === "pay" && j.what === "arrived" && j.t > t0)
          .length,
        replays: myKeys.filter((j: any) => j.what === "replayed").length,
        orders: t.orders.filter(([c]: [string]) => c === cartId).length,
        fatal,
        issues: issues.map((x: any) => x.code),
        lanes,
      };
    };
    let i = 0;
    for (const how of ["crash", "sigkill"] as const)
      for (const [killMs, payDelay] of [
        [0, 40],
        [3, 40],
        [8, 40],
        [15, 40],
        [30, 200],
        [60, 200],
        [120, 40],
        [200, 300],
        [5, 0],
        [20, 0],
        [40, 0],
        [80, 0],
        [-1, 40],
        [-1, 40],
        [-1, 40],
        [-2, 40],
        [-2, 40],
        [-3, 40],
        [-3, 40],
        [-4, 40],
      ] as const)
        rows.push(await script(++i, how, killMs, payDelay));
    say("crash", rows);
    say("crashSummary", {
      cycles: rows.length,
      doubleCharge: rows.filter((r) => r.keys > 1).length,
      fatal: rows.filter((r) => r.fatal).length,
      unsettled: rows.filter((r) => !r.settled).length,
      byRestored: rows.reduce(
        (m: any, r) => ((m[String(r.restored)] = (m[String(r.restored)] ?? 0) + 1), m),
        {},
      ),
      byFinal: rows.reduce(
        (m: any, r) => ((m[String(r.final)] = (m[String(r.final)] ?? 0) + 1), m),
        {},
      ),
      replays: rows.reduce((n, r) => n + r.replays, 0),
      issues: [...new Set(rows.flatMap((r) => r.issues))],
    });
  }
  // ── Two tabs: O7.
  if (only.includes("tabs")) {
    const db = "tabs";
    const a = await open();
    const ba = await a.evaluate(`__boot("pay", ${JSON.stringify({ db })})`);
    await a.evaluate(`__wait("__booted()")`);
    await a.evaluate(`__ensure(${JSON.stringify(A)}, "Checkout/Pay")`);
    await a.evaluate(`__send(${JSON.stringify(A)}, "Start", { cartId: "tc", intentId: "ti" })`);
    await a.evaluate(`__flush()`);
    await Bun.sleep(50);
    const b = await open();
    const bb = await b.evaluate(`__boot("pay", ${JSON.stringify({ db })})`);
    await b.evaluate(`__wait("__booted()")`);
    const bSees = await b.evaluate(`__view(${JSON.stringify(A)})`);
    await b.evaluate(`__ensure(${JSON.stringify(A)}, "Checkout/Pay")`);
    await b.evaluate(`__send(${JSON.stringify(A)}, "Start", { cartId: "bad", intentId: "bad" })`);
    await Bun.sleep(300);
    const ev = await b.evaluate(`__ev("SecondTabNoPersistence").length`);
    await crash(a);
    await Bun.sleep(200);
    const c = await open();
    const bc = await c.evaluate(`__boot("pay", ${JSON.stringify({ db })})`);
    await c.evaluate(`__wait("__booted()")`);
    const cSees = await c.evaluate(`__view(${JSON.stringify(A)})?.memory?.intentId`);
    say("tabs", {
      locksAvailable: ba.locks,
      a: ba.owner,
      b: bb.owner,
      bStartsEmpty: bSees === undefined,
      bEvidence: ev,
      afterACrashNewTab: bc.owner,
      diskStillA: cSees,
      bStillOpenWhenCOpened: true,
    });
    b.close();
    c.close();
  }
  // ── An entity flow over real fetch and SSE. Each trace ends by comparing an unmarked record with the server.
  if (only.includes("desk")) {
    const T = "Desk/Tickets/a";
    const T1 = "Ticket|t1";
    const trace = async (name: string, f: (p: Page) => Promise<unknown>) => {
      await control({ fresh: true });
      const p = await open();
      await p.evaluate(
        `__boot("desk", { db: "desk-${name}", persist: false, bounds: { repairMs: 3000 } })`,
      );
      await p.evaluate(`__wait("__booted()")`);
      await p.evaluate(`__ensure(${JSON.stringify(T)}, "Desk/Tickets")`);
      await Bun.sleep(60);
      const extra = await f(p);
      await p.evaluate(`__wait("__idle()", 1200)`);
      await Bun.sleep(200);
      const rec = (await p.evaluate(`__records()[${JSON.stringify(T1)}]`)) as any;
      const t = await truth();
      const row = t.tickets.t1;
      const honest =
        !rec || rec.uncertain || rec.predicted || !row
          ? rec?.uncertain || rec?.predicted || !!row === !!rec?.data
          : rec.data?.archived === row.archived && rec.data?.title === row.title;
      const issues = await p.evaluate(`__issues()`);
      const out_ = {
        name,
        honest,
        shows: rec && {
          title: rec.data?.title,
          archived: rec.data?.archived,
          revision: rec.data?.revision,
          uncertain: rec.uncertain,
          predicted: rec.predicted,
        },
        server: row && { title: row.title, archived: row.archived, revision: row.revision },
        repairs: t.journal.filter((j: any) => j.op === "repair" && j.what === "arrived").length,
        lists: t.journal.filter((j: any) => j.op === "list" && j.what === "arrived").length,
        aborted: t.journal.filter((j: any) => j.what === "client-aborted").map((j: any) => j.op),
        replayed: t.journal.filter((j: any) => j.what === "replayed").length,
        issues: issues.map((x: any) => x.code),
        journal: t.journal
          .filter((j: any) => j.op !== "list")
          .map((j: any) => `${j.op}:${j.what}`)
          .join(" "),
        endings: await p.evaluate(
          `__ev("ending").map((e) => [e.op, e.ch, e.reason ?? e.tag].join(":"))`,
        ),
        ...(extra ? { extra } : {}),
      };
      p.close();
      return out_;
    };
    const send = (p: Page, tag: string, payload: object = {}) =>
      p.evaluate(
        `__send(${JSON.stringify(T)}, ${JSON.stringify(tag)}, ${JSON.stringify(payload)})`,
      );
    const rows: unknown[] = [];
    rows.push(
      await trace("first-load-with-a-feed-open", async (p) => {
        await control({ delay: { list: 300 } });
        await send(p, "Load");
        await Bun.sleep(80);
        await control({ other: { id: "t1", patch: { title: "from another device" } } });
        await Bun.sleep(400);
      }),
    );
    rows.push(
      await trace("archive-204-beside-a-slow-list", async (p) => {
        await send(p, "Load");
        await Bun.sleep(80);
        await control({ delay: { list: 300 } });
        await send(p, "Load");
        await Bun.sleep(50);
        await send(p, "Archive", { id: "t1" });
        await Bun.sleep(500);
      }),
    );
    rows.push(
      await trace("two-lists-answer-out-of-order", async (p) => {
        await control({ delay: { list: 400 } });
        await send(p, "Load");
        await Bun.sleep(30);
        await control({ other: { id: "t1", patch: { title: "second" } }, delay: { list: 0 } });
        await send(p, "Load");
        await Bun.sleep(600);
      }),
    );
    rows.push(
      await trace("a-204-whose-body-dies-then-a-replay", async (p) => {
        await send(p, "Load");
        await Bun.sleep(80);
        await control({ drop: { archive: 1 } });
        await send(p, "Archive", { id: "t1" });
        await Bun.sleep(150);
        const mid = await p.evaluate(`__records()["Ticket|t1"]?.uncertain`);
        await send(p, "Reconcile", { id: "t1" });
        await Bun.sleep(200);
        return { markedWhileUnknown: mid };
      }),
    );
    rows.push(
      await trace("a-reset-the-browser-replays-the-post-itself", async (p) => {
        await send(p, "Load");
        await Bun.sleep(80);
        await control({ reset: { archive: 1 } });
        await send(p, "Archive", { id: "t1" });
        await Bun.sleep(300);
      }),
    );
    rows.push(
      await trace("an-actor-disposed-aborts-its-read-a-write-is-not-aborted", async (p) => {
        await send(p, "Load");
        await Bun.sleep(60);
        await control({ delay: { list: 500, archive: 300 } });
        await send(p, "Load");
        await send(p, "Archive", { id: "t1" });
        await Bun.sleep(30);
        await p.evaluate(`__dispose(${JSON.stringify(T)})`);
        await Bun.sleep(500);
      }),
    );
    rows.push(
      await trace("the-feed-dies-and-comes-back", async (p) => {
        await send(p, "Load");
        await Bun.sleep(80);
        await control({ closeFeeds: true });
        await Bun.sleep(50);
        await control({ other: { id: "t1", patch: { title: "while down" } } });
        await Bun.sleep(2200);
      }),
    );
    rows.push(
      await trace("a-busy-feed-beside-a-rename", async (p) => {
        await send(p, "Load");
        await Bun.sleep(60);
        for (let i = 0; i < 40; i++)
          await control({ other: { id: "t1", patch: { title: `b${i}` } } });
        await send(p, "Rename", { id: "t1", title: "mine" });
        await Bun.sleep(300);
      }),
    );
    say("desk", rows);
  }
} catch (e) {
  say("error", String((e as Error).stack ?? e));
} finally {
  out["peakMb"] = browser.peakMb();
  await browser.close();
  srv.stop();
  const dest = arg("--out", "");
  if (dest) writeFileSync(resolve(process.cwd(), dest), JSON.stringify(out, null, 1) + "\n");
  console.log("peakMb", out["peakMb"]);
  process.exit(0);
}
