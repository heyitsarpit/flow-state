// The real-browser run's Vitest config: the package's browser tests in one installed browser,
// named by FLOW_BROWSER (`chrome` or `safari`), through tools/browser/provider.ts. Run it by
// `nub run test:browser`, which runs each browser alone.
//
// Guards: the run fails when it ran fewer tests than FLOW_BROWSER_EXPECTED (zero included), as a
// browser that never loaded the files would. FLOW_BROWSER_PLANT=drop-last-write plants a fault in
// the IndexedDB adapter as it is served, dropping every batch's last write, so the run shows it
// goes red on a fault only the real store sees.
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import type { Reporter, TestModule } from "vitest/node";
import { pageCommands, realBrowser } from "./provider.ts";

const browser = process.env["FLOW_BROWSER"] ?? "chrome";
const expected = Number(process.env["FLOW_BROWSER_EXPECTED"] ?? "1");
const plant = process.env["FLOW_BROWSER_PLANT"] ?? "";

const planted: Plugin = {
  name: "flow-browser-plant",
  enforce: "pre",
  transform(code, id) {
    if (plant !== "drop-last-write" || !id.endsWith("/src/host/platform/indexeddb.ts")) return;
    const find = "const requests = batch.map((w) =>";
    if (!code.includes(find)) throw new Error("the planted fault's text is gone from indexeddb.ts");
    console.log("browser run: planted drop-last-write in the IndexedDB adapter");

    return code.replace(find, "const requests = batch.slice(0, -1).map((w) =>");
  },
};

const counted: Reporter = {
  onTestRunEnd(modules: ReadonlyArray<TestModule>) {
    const ran = modules.flatMap((m) => [...m.children.allTests()]).filter((t) => t.result().state !== "skipped");
    console.log(`browser run: ${ran.length} tests ran in ${browser}, ${expected} expected at least`);
    if (ran.length < expected) {
      console.error(`browser run: FAILED: ${ran.length} tests ran, fewer than ${expected}`);
      process.exitCode = 1;
    }
  },
};

export default defineConfig({
  plugins: [planted],
  test: {
    root: new URL("../..", import.meta.url).pathname,
    include: ["packages/flow-state-v3/tests/browser/**/*.browser.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    reporters: ["default", counted],
    browser: {
      enabled: true,
      provider: realBrowser(),
      instances: [{ browser }],
      ui: false,
      headless: true,
      commands: { ...pageCommands, __vitest_viewport: () => undefined },
    },
  },
});
