// S4: bun conformance/watch.ts -- bun conformance/bench/s4-run.ts --runtime ../round-6/adapter.ts --out ../round-6/s4.json
// Headless Chrome, raw CDP, a throwaway profile. Reports not run if Chrome cannot start; it fakes nothing. Moved from round-2.
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { launch } from "./cdp.ts";

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(k);
  return i < 0 ? d : process.argv[i + 1]!;
};
const dir = dirname(resolve(import.meta.dir, arg("--runtime", "../../round-6/adapter.ts")));
const dest = arg("--out", "");
const built = await Bun.build({
  entrypoints: [join(import.meta.dir, "s4-page.ts")],
  target: "browser",
  format: "iife",
  minify: false,
  plugins: [
    {
      name: "flow-runtime",
      setup(b) {
        b.onResolve({ filter: /^flow-runtime\// }, (a) => ({
          path: join(dir, `${a.path.slice("flow-runtime/".length)}.ts`),
        }));
      },
    },
  ],
});
if (!built.success) throw new Error("bundle failed");
const code = await built.outputs[0]!.text();
const done = (out: unknown, status = 0) => {
  const t = JSON.stringify(out, null, 1);
  console.log(t);
  if (dest) writeFileSync(resolve(import.meta.dir, dest), t + "\n");
  process.exit(status);
};
let browser;
try {
  browser = await launch();
} catch (e) {
  done({ s4: "not run", why: String(e) }, 1);
}
const b = browser!;
const page = await b.newPage("about:blank");
await page.evaluate(code);
const results: unknown[] = [];
const timer = setTimeout(async () => {
  await b.close();
  done({ s4: "not run", why: "no answer in 240 s", results }, 1);
}, 240_000);
for (const rate of [1, 6]) {
  await page.send("Emulation.setCPUThrottlingRate", { rate });
  for (const actors of [1, 1000])
    results.push({ rate, ...(await page.evaluate(`__run(${actors})`)) });
  for (const size of [1000, 10_000]) {
    results.push({
      rate,
      grow: "atOnce",
      ...(await page.evaluate(`__grow(${size}, { captureMs: 0 })`)),
    });
    results.push({
      rate,
      grow: "coalesced",
      ...(await page.evaluate(`__grow(${size}, { captureMs: 100 })`)),
    });
  }
}
clearTimeout(timer);
const peak = b.peakMb();
const version = b.version;
await b.close();
done({ s4: "ran", browser: version, headless: true, peakMb: peak, results });
