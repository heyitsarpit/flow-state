// S4: bun round-2/s4-run.ts. Local Chrome, raw CDP over a WebSocket, no dependency, a throwaway profile. Reports not run if
// Chrome cannot start unattended; it fakes nothing.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const built = await Bun.build({
  entrypoints: [join(import.meta.dir, "s4.ts")],
  target: "browser",
  format: "iife",
  minify: false,
});
if (!built.success) throw new Error("bundle failed");
const code = await built.outputs[0]!.text();
const profile = mkdtempSync(join(tmpdir(), "flow-s4-"));
const PORT = 9333;
const chrome = Bun.spawn(
  [
    CHROME,
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ],
  { stdout: "ignore", stderr: "ignore" },
);
const done = (out: unknown, status = 0) => {
  console.log(JSON.stringify(out, null, 1));
  chrome.kill(9);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {}
  process.exit(status);
};
let pages: any[] | undefined;
console.error("chrome up?");
for (let i = 0; i < 60 && !pages; i++) {
  await Bun.sleep(250);
  try {
    pages = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()) as any[];
  } catch {}
}
if (!pages) done({ s4: "not run", why: "Chrome's debugging port did not answer" }, 1);
const page = pages!.find((p) => p.type === "page")!;
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => {
  ws.onopen = r;
  ws.onerror = j;
});
let id = 0;
const wait = new Map<number, (v: any) => void>();
ws.onmessage = (e) => {
  const m = JSON.parse(String(e.data));
  if (m.id) wait.get(m.id)?.(m);
};
const send = (method: string, params: object = {}) =>
  new Promise<any>((r) => {
    const n = ++id;
    wait.set(n, r);
    ws.send(JSON.stringify({ id: n, method, params }));
  });
const version = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()) as any;
console.error("loading", code.length);
const load = await send("Runtime.evaluate", { expression: code });
console.error("loaded", JSON.stringify(load).slice(0, 300));
if (load.result?.exceptionDetails)
  done({ s4: "not run", why: load.result.exceptionDetails.text }, 1);
const results: unknown[] = [];
setTimeout(() => done({ s4: "not run", why: "no answer in 150 s", results }, 1), 150_000);
for (const rate of [1, 6]) {
  await send("Emulation.setCPUThrottlingRate", { rate });
  for (const actors of [1, 1000]) {
    const r = await send("Runtime.evaluate", {
      expression: `__run(${actors})`,
      awaitPromise: true,
      returnByValue: true,
      timeout: 120000,
    });
    if (r.result?.exceptionDetails)
      done(
        { s4: "failed", rate, actors, why: r.result.exceptionDetails.exception?.description },
        1,
      );
    results.push({ rate, ...r.result.result.value });
  }
}
done({ s4: "ran", browser: version.Browser, headless: true, results });
