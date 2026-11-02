// bun search/run.ts --which pay|payFixed|like --runtime ../round-2/adapter.ts --depth 8 --states 400000 --seconds 500
// Run under watch.ts. One process at a time.
import { resolve } from "node:path";
import { makeHarness, swapFixtures } from "../drive.ts";
import { payFixture } from "../fixtures/pay.compiled.ts";
import { payFixedFixture } from "../fixtures/pay.fixed.ts";
import { s1Fixture } from "../fixtures/s1.compiled.ts";
import type { RuntimeModule } from "../harness.ts";
import { searchCross } from "./cross.search.ts";
import { searchFlush } from "./flush.search.ts";
import { searchCrash } from "./crash.search.ts";
import { searchFrag } from "./frag.search.ts";
import { searchFragStore } from "./fragstore.search.ts";
import { searchListen } from "./listen.search.ts";
import { searchRepairing, searchSession } from "./session.search.ts";
import { searchLike } from "./like.search.ts";
import { searchOdd } from "./odd.search.ts";
import { searchPay } from "./pay.search.ts";

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(k);
  return i < 0 ? d : process.argv[i + 1]!;
};
const mod = (await import(
  resolve(import.meta.dir, arg("--runtime", "../../round-6/adapter.ts"))
)) as RuntimeModule;
if (arg("--swap", "")) swapFixtures((await import(resolve(import.meta.dir, arg("--swap", "")))).swaps);
const make = makeHarness(mod.port);
const o = {
  depth: Number(arg("--depth", "8")),
  maxStates: Number(arg("--states", "400000")),
  deadlineMs: Number(arg("--seconds", "280")) * 1000,
};
const which = arg("--which", "pay");
if (which === "oddall") {
  const { searchOddAll } = await import("../scenarios/round5.scenario.ts");
  const { oddAllFixture } = await import("../fixtures/oddall.compiled.ts");
  const n = searchOddAll(() => {
    const h = make();
    h.start({ machines: [oddAllFixture], seed: 1 });
    return h;
  });
  console.log(JSON.stringify({ search: which, verdict: "completed", combinations: n }));
  process.exit(0);
}
const r =
  which === "pay"
    ? searchPay(make, [payFixture], o)
    : which === "payFixed"
      ? searchPay(make, [payFixedFixture], { ...o, pins: [] })
      : which.startsWith("flush.")
        ? searchFlush(make, which.split(".")[1] as never, o, which.includes(".tight"), which.includes(".wide"), which.includes(".directed") ? "store" : which.includes(".queue") ? "queue" : which.includes(".burst") ? "burst" : which.includes(".wipe") ? "wipe" : false)
      : which === "crash"
        ? searchCrash(make, o)
      : which === "crash5s"
        ? searchCrash(make, o, { captureMs: 5000 })
      : which === "cross"
        ? searchCross(make, o)
        : which === "frag"
          ? searchFrag(make, o)
          : which === "odd"
            ? searchOdd(make, o)
            : which === "session"
              ? searchSession(make, o)
              : which.startsWith("listen.")
                ? searchListen(
                    make,
                    which.split(".")[1] as never,
                    o,
                    which.endsWith(".noload") ? "none" : "load",
                  )
                : which === "repairing"
                  ? searchRepairing(make, o)
                  : which.startsWith("fragstore.")
                    ? searchFragStore(make, which.split(".")[1] as never, o)
                    : searchLike(make, [s1Fixture], o);
console.log(JSON.stringify({ search: which, ...r }, null, 1));
process.exitCode = r.verdict === "failed" ? 1 : 0;
