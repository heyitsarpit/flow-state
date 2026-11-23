// bun conformance/watch.ts --rss-mb 1800 --seconds 280 -- bun round-9/reality/spin.ts [--runtime-page spin-page.ts]. D122's claims, in real Chrome.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch } from "../../conformance/bench/cdp.ts";

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(k);
  return i < 0 ? d : process.argv[i + 1]!;
};
const built = await Bun.build({ entrypoints: [join(import.meta.dir, arg("--page", "spin-page.ts"))], target: "browser", format: "iife" });
if (!built.success) throw new Error(`bundle: ${built.logs.join("\n")}`);
const js = await built.outputs[0]!.text();
const server = Bun.serve({
  port: 0,
  fetch: (r) => (new URL(r.url).pathname === "/page.js" ? new Response(js, { headers: { "content-type": "text/javascript" } }) : new Response(`<!doctype html><title>spin</title><script src="/page.js"></script>`, { headers: { "content-type": "text/html" } })),
});
const browser = await launch();
const out: Record<string, unknown> = { browser: browser.version };
const say = (k: string, v: unknown) => {
  out[k] = v;
  console.log(k, JSON.stringify(v));
};
try {
  const open = async () => {
    const p = await browser.newPage(`http://localhost:${server.port}/`);
    for (let i = 0; i < 100; i++) {
      const r = await p.send("Runtime.evaluate", { expression: "!!globalThis.__ready" }).catch(() => undefined);
      if (r?.result?.result?.value === true) return p;
      await Bun.sleep(30);
    }
    throw new Error("page did not load");
  };
  const run = async (name: string, expr: string, ms = 90_000) => {
    const p = await open();
    const t = await Promise.race([p.evaluate(expr), Bun.sleep(ms).then(() => "FROZE: no answer")]);
    say(name, t);
    p.close();
  };
  await run("spin.promise", `__spin({how:"promise",ms:2000})`, 15_000);
  await run("spin.promise.failing", `__spin({how:"promise",fail:true,ms:2000})`, 15_000);
  await run("spin.sync", `__spin({how:"sync",ms:2000})`, 15_000);
  await run("spin.sync.failing", `__spin({how:"sync",fail:true,ms:2000})`, 15_000);
  await run("spin.promise.setTimeoutHost", `__spin({how:"promise",later:"timeout",ms:2000})`, 15_000);
  await run("press.beside.spin", `__press({how:"promise",n:50})`);
  for (const [name, o] of [
    ["rows.1000.promise", { n: 1000, how: "promise" }],
    ["rows.1000.sync", { n: 1000, how: "sync" }],
    ["rows.1000.promise.noYield", { n: 1000, how: "promise", drainMs: 1e9 }],
    ["rows.1000.sync.noYield", { n: 1000, how: "sync", drainMs: 1e9 }],
    ["rows.1000.promise.setTimeoutHost", { n: 1000, how: "promise", later: "timeout" }],
    ["rows.5000.promise", { n: 5000, how: "promise" }],
    ["rows.5000.promise.noYield", { n: 5000, how: "promise", drainMs: 1e9 }],
    ["rows.200.one.dup", { n: 200, how: "promise", dup: "one" }],
    ["rows.300.tenth.dup", { n: 300, how: "promise", dup: "tenth" }],
    ["rows.200.all.dup", { n: 200, how: "promise", dup: "all" }],
    ["rows.200.all.dup.sync", { n: 200, how: "sync", dup: "all" }],
    ["writes.1000.promise", { n: 1000, how: "promise", event: "Writes" }],
  ] as const)
    await run(name, `__rows(${JSON.stringify(o)})`);
  // Hidden and frozen: as far as a throwaway headless browser can show them.
  {
    const p = await open();
    const started = p.evaluate(`__rows({n:5000,how:"promise"})`);
    await p.send("Page.setWebLifecycleState", { state: "frozen" }).catch((e: unknown) => say("freeze.error", String(e)));
    await Bun.sleep(1000);
    await p.send("Page.setWebLifecycleState", { state: "active" }).catch((e: unknown) => say("thaw.error", String(e)));
    say("rows.5000.frozen1s", await Promise.race([started, Bun.sleep(30_000).then(() => "NO ANSWER")]));
    p.close();
  }
} finally {
  await browser.close();
  server.stop(true);
  writeFileSync(arg("--out", join(import.meta.dir, "results-spin.json")), JSON.stringify(out, null, 1));
}
