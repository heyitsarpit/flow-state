// Real Safari over WebDriver: `/usr/bin/safaridriver -p <port>`, never the Safari binary. One session at a time, its own window only,
// ended by WebDriver's delete session. Reuses round 10's server. Usage: bun safari/run.ts --only item0,item1,... [--budget-s 270]
import { startServer } from "../round-10/reality/server.ts";

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(k);

  return i > 0 ? process.argv[i + 1]! : d;
};

const only = arg("--only", "item0").split(",");

const budgetS = Number(arg("--budget-s", "270"));

const WEB_PORT = 47811; // fixed: item 0's two sessions must see one origin

const WD_PORT = 47812;

const built = await Bun.build({
  entrypoints: [`${import.meta.dir}/page.ts`],
  target: "browser",
  format: "iife",
});

if (!built.success) throw new Error(built.logs.join("\n"));

const beacons: string[] = [];

const srv = startServer(await built.outputs[0]!.text(), WEB_PORT, {
  hidden: (why) => void beacons.push(why),
});

const say = (k: string, v: unknown) => console.log(`${k} ${JSON.stringify(v)}`);

const driver = Bun.spawn(["/usr/bin/safaridriver", "-p", String(WD_PORT)], {
  stdin: "ignore",
  stdout: "pipe",
  stderr: "pipe",
});

say("safaridriver", { pid: driver.pid });

let sid: string | undefined;

const WD = `http://127.0.0.1:${WD_PORT}`;

const wd = async (method: string, path: string, body?: unknown) => {
  const r = await fetch(WD + path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const j: any = await r.json().catch(() => ({}));

  if (!r.ok) throw new Error(`${method} ${path} ${r.status}: ${JSON.stringify(j.value ?? j)}`);

  return j.value;
};

const endSession = async () => {
  if (!sid) return;
  const s = sid;
  sid = undefined;
  await wd("DELETE", `/session/${s}`).catch((e) => say("deleteSessionFailed", String(e)));
  say("sessionEnded", s);
};

let cleaned = false;

const cleanup = async () => {
  if (cleaned) return;
  cleaned = true;
  await endSession();
  driver.kill(); // the safaridriver this script started, by its own pid
  srv.stop();
};

setTimeout(async () => {
  say("budgetExceeded", budgetS);
  await cleanup();
  process.exit(2);
}, budgetS * 1000);

const newSession = async () => {
  for (let i = 0; i < 50; i++) {
    const ok = await fetch(`${WD}/status`)
      .then((r) => r.ok)
      .catch(() => false);

    if (ok) break;
    await Bun.sleep(100);
  }

  const v = await wd("POST", "/session", {
    capabilities: { alwaysMatch: { browserName: "safari" } },
  });

  sid = v.sessionId;
  await wd("POST", `/session/${sid}/timeouts`, { script: 200_000, pageLoad: 30_000 });
  say("session", {
    sid,
    browserVersion: v.capabilities?.browserVersion,
    platform: v.capabilities?.platformName,
  });
};

const go = (path: string) => wd("POST", `/session/${sid}/url`, { url: `${srv.url}${path}` });

const ready = async () => {
  for (let i = 0; i < 200; i++) {
    const v = await wd("POST", `/session/${sid}/execute/sync`, {
      script:
        "return document.readyState === 'complete' && typeof window.__t === 'object' ? location.search || '/' : null",
      args: [],
    }).catch(() => null);

    if (v) return v as string;
    await Bun.sleep(50);
  }

  throw new Error("page not ready");
};

const ev = async (expr: string) => {
  const v = await wd("POST", `/session/${sid}/execute/async`, {
    script: `const done = arguments[arguments.length - 1];
      Promise.resolve().then(() => (${expr})).then((v) => done({ ok: v === undefined ? null : v }), (e) => done({ err: String(e && e.name) + ": " + String(e && e.message) }));`,
    args: [],
  });

  if (v?.err) throw new Error(`${expr}: ${v.err}`);

  return v?.ok;
};

// Fire and do not wait: a script that navigates the page away.
const fire = (js: string) =>
  wd("POST", `/session/${sid}/execute/sync`, {
    script: `setTimeout(() => { ${js} }, 0); return true;`,
    args: [],
  });

try {
  await newSession();
  await go("/?boot");
  await ready();
  say("userAgent", await ev("__ua()"));

  if (only.includes("item0")) {
    const stamp = `s-${Date.now()}`;
    const first = await ev(`__seed(${JSON.stringify(stamp)})`);

    const sameSession = await (async () => {
      await go("/?again");
      await ready();

      return ev("__readSeed()");
    })();

    await endSession();
    await Bun.sleep(1000);
    await newSession();
    await go("/?second");
    await ready();
    const second = await ev("__readSeed()");
    say("item0", {
      stamp,
      first,
      sameSessionAfterNavigate: sameSession,
      secondSession: second,
      kept: second?.idb === stamp,
    });
  }

  if (only.includes("item1")) {
    say("item1.atomic", await ev("__atomic()"));
    say("item1.answer", await ev("__answerTiming(200)"));

    for (const cross of [false, true])
      for (const [durA, durB] of [
        ["relaxed", "relaxed"],
        ["strict", "strict"],
        ["strict", "relaxed"],
        ["relaxed", "strict"],
      ] as const)
        for (const padKeys of [0, 50])
          say(
            "item1.order",
            await ev(`__order(${JSON.stringify({ n: 100, cross, durA, durB, padKeys })})`),
          );
  }

  if (only.includes("item1b")) {
    // A rerun of the one pair whose answers came out of order: more pairs, each arm.
    for (const cross of [false, true])
      for (const [durA, durB] of [
        ["relaxed", "relaxed"],
        ["strict", "strict"],
      ] as const)
        say(
          "item1b.order",
          await ev(`__order(${JSON.stringify({ n: 1000, cross, durA, durB, padKeys: 50 })})`),
        );
  }

  if (only.includes("item2")) {
    say("item2.estimate", await ev("__estimate()"));
    say("item2.quota", await ev(`__quota(${arg("--quota", '{"chunkMB":10,"maxMB":200}')})`));
  }

  if (only.includes("item3")) say("item3", await ev("__lost()"));

  if (only.includes("item4")) {
    const arms = [
      { contract: true, idb: true },
      { contract: false, idb: true },
      { contract: false, idb: false },
      { contract: true, idb: false },
    ];

    for (const [i, a] of arms.entries()) {
      const lock = `bf-${i}-${Date.now()}`;
      await go(`/?a${i}`);
      await ready();
      await ev("__bfReset()");
      const armed = await ev(`__bfArm(${JSON.stringify({ ...a, lock })})`);
      const armedQuery = await ev("navigator.locks.query()");
      // A same-origin navigation the page makes itself, as a link click does.
      await fire(`location.href = "/?b${i}"`);
      await Bun.sleep(800);
      await ready();
      const onB = await ev(`__bfProbe(${JSON.stringify(lock)})`);
      await fire("history.back()");
      await Bun.sleep(1500);
      await ready();
      const back = await ev(`__bfProbe(${JSON.stringify(lock)})`);
      say("item4", {
        ...a,
        armed,
        heldBeforeLeaving: armedQuery,
        bGotLock: onB.got,
        bSawHeld: onB.query,
        back: {
          page: back.page,
          nav: back.nav,
          gotLock: back.got,
          holdingHere: back.holdingHere,
          query: back.query,
        },
        log: back.log,
      });
    }

    // The same, through WebDriver's own navigate and back.
    {
      const lock = `bf-wd-${Date.now()}`;
      await go(`/?awd`);
      await ready();
      await ev("__bfReset()");
      await ev(`__bfArm(${JSON.stringify({ contract: true, idb: true, lock })})`);
      await go(`/?bwd`);
      await ready();
      const onB = await ev(`__bfProbe(${JSON.stringify(lock)})`);
      await wd("POST", `/session/${sid}/back`, {});
      await Bun.sleep(1500);
      await ready();
      const back = await ev(`__bfProbe(${JSON.stringify(lock)})`);
      say("item4.webdriverNav", {
        bGotLock: onB.got,
        back: { page: back.page, nav: back.nav },
        log: back.log,
      });
    }
  }

  if (only.includes("item5")) {
    say("item5.timing", await ev(`__durability({ n: 200, keys: 4, bytes: 1000 })`));
    // A batch issued in pagehide, then navigated away (link-like) or the window closed.
    const trials = Number(arg("--trials", "12"));
    // Each arm its own database, so a transaction that never ends holds only its own arm. Read on the next page at once, bounded.
    const stamp = Date.now();

    const dbOf = (how: string, commit: boolean) =>
      `hide-${how}-${commit ? "commit" : "auto"}-${stamp}`;

    for (const commit of [true, false]) {
      const seen: unknown[] = [];

      for (let i = 0; i < trials; i++) {
        await go(`/?h${i}`);
        await ready();
        await ev(
          `__armHide(${JSON.stringify({ db: dbOf("nav", commit), tag: `nav${i}`, commit, keys: 20 })})`,
        );
        await fire(`location.href = "/?next"`);
        await Bun.sleep(300);
        await ready();
        seen.push(await ev(`__readHide(${JSON.stringify(dbOf("nav", commit))}, 3000)`));
      }

      say("item5.nav", { commit, readOnNextPageAfterEachTrial: seen });
    }

    // Window close: a new window of this session, armed, then closed by WebDriver.
    const main = await wd("GET", `/session/${sid}/window`);

    for (const commit of [true, false]) {
      for (let i = 0; i < Math.min(trials, 6); i++) {
        const w = await wd("POST", `/session/${sid}/window/new`, { type: "tab" });
        await wd("POST", `/session/${sid}/window`, { handle: w.handle });
        await go(`/?w${i}`);
        await ready();
        await ev(
          `__armHide(${JSON.stringify({ db: dbOf("close", commit), tag: `close${i}`, commit, keys: 20 })})`,
        );
        await wd("DELETE", `/session/${sid}/window`);
        await wd("POST", `/session/${sid}/window`, { handle: main });
        await Bun.sleep(300);
      }
    }

    await go("/?read");
    await ready();
    await Bun.sleep(500);

    for (const how of ["nav", "close"])
      for (const commit of [true, false])
        say("item5.hideAtEnd", {
          how,
          commit,
          disk: await ev(`__readHide(${JSON.stringify(dbOf(how, commit))}, 5000)`),
        });
  }

  if (only.includes("item5b")) {
    // Why item 5's pagehide batches did not land: is the page's transaction frozen with it in the cache? Each trial its own database.
    const trials = Number(arg("--trials", "6"));
    const stamp = Date.now();

    for (const commit of [true, false]) {
      const rows: unknown[] = [];
      beacons.length = 0;

      for (let i = 0; i < trials; i++) {
        const db = `hb-${commit}-${i}-${stamp}`;
        await go(`/?reset`);
        await ready();
        await ev("__bfReset()");
        await go(`/?hb${i}`);
        await ready();
        await ev(`__armHide(${JSON.stringify({ db, tag: `hb${commit}${i}`, commit, keys: 20 })})`);
        await fire(`location.href = "/?next"`);
        await Bun.sleep(300);
        await ready();
        const onNext = await ev(`__readHide(${JSON.stringify(db)}, 2000)`);
        await fire("history.back()");
        await Bun.sleep(800);
        await ready();

        const restored = await ev(
          `({ nav: performance.getEntriesByType("navigation")[0]?.type, log: JSON.parse(sessionStorage.getItem("bf.log") ?? "[]").map((e) => e.page + " " + e.what + ":" + (e.persisted ?? e.name ?? e.ms)) })`,
        );

        const afterBack = await ev(`__readHide(${JSON.stringify(db)}, 2000)`);
        const sameConnection = await ev("__readSameConnection()");
        await Bun.sleep(2000);
        const later = await ev(`__readHide(${JSON.stringify(db)}, 2000)`);
        rows.push({
          onNext,
          restored: { ...restored, log: restored.log.slice(-2) },
          afterBack,
          sameConnection,
          later,
        });
      }

      say("item5b.navThenBack", { commit, beacons: [...beacons], rows });
    }

    // A batch out when the page navigates itself away: issued and committed in the same task as the navigation.
    for (const commit of [true, false]) {
      const rows: unknown[] = [];

      for (let i = 0; i < trials; i++) {
        const db = `ig-${commit}-${i}-${stamp}`;
        await go(`/?ig${i}`);
        await ready();
        await fire(
          `__issueThenGo(${JSON.stringify({ db, tag: `ig${i}`, commit, keys: 20, to: "/?next" })})`,
        );
        await Bun.sleep(300);
        await ready();
        rows.push(await ev(`__readHide(${JSON.stringify(db)}, 2000)`));
      }

      say("item5b.issueThenGo", { commit, rows });
    }

    // Tab closed by WebDriver: does pagehide run (beacon), and does its committed batch land?
    beacons.length = 0;
    const main = await wd("GET", `/session/${sid}/window`);
    const rows: unknown[] = [];

    for (let i = 0; i < trials; i++) {
      const db = `cl-${i}-${stamp}`;
      const w = await wd("POST", `/session/${sid}/window/new`, { type: "tab" });
      await wd("POST", `/session/${sid}/window`, { handle: w.handle });
      await go(`/?cl${i}`);
      await ready();
      await ev(`__armHide(${JSON.stringify({ db, tag: `cl${i}`, commit: true, keys: 20 })})`);
      await wd("DELETE", `/session/${sid}/window`);
      await wd("POST", `/session/${sid}/window`, { handle: main });
      await Bun.sleep(500);
      rows.push(await ev(`__readHide(${JSON.stringify(db)}, 2000)`));
    }

    say("item5b.close", { beacons: [...beacons], rows });
  }
} catch (e) {
  say("error", String(e));
} finally {
  await cleanup();
}

process.exit(0);
