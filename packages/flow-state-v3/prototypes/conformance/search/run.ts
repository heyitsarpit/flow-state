// bun search/run.ts --which pay|payFixed|like|... --runtime ../../round-14/adapter.ts --depth 4 --states 4000 --expect completed|closed|inconclusive
// Ends on its state budget, never on a clock; its verdict is one `search` item: pass iff the search's verdict is the one expected.
import { stated } from "../verdicts/state.ts";

await stated("search", async () => {
  const { resolve } = await import("node:path");
  const arg = (k: string) => {
    const i = process.argv.indexOf(k);
    return i < 0 ? undefined : process.argv[i + 1];
  };
  const need = (k: string) => {
    const v = arg(k);
    if (v === undefined) throw new Error(`search/run.ts: ${k} is required`);
    return v;
  };
  const depth = Number(need("--depth"));
  const maxStates = Number(need("--states"));
  const expect = need("--expect");
  if (!["completed", "closed", "inconclusive"].includes(expect)) throw new Error(`search/run.ts: --expect ${expect}: only completed, closed or inconclusive can be expected`);
  const { makeHarness, swapFixtures } = await import("../drive.ts");
  const { payFixture } = await import("../typed/pay.ts");
  const { payFixedFixture } = await import("../fixtures/pay.fixed.ts");
  const { s1Fixture } = await import("../typed/stores.ts");
  const { searchChain } = await import("./chain.search.ts");
  const { engine } = await import("./engine.ts");
  const { searchCross } = await import("./cross.search.ts");
  const { searchFlush } = await import("./flush.search.ts");
  const { searchCrash } = await import("./crash.search.ts");
  const { searchFrag } = await import("./frag.search.ts");
  const { searchFragStore } = await import("./fragstore.search.ts");
  const { searchListen } = await import("./listen.search.ts");
  const { searchRepairing, searchSession } = await import("./session.search.ts");
  const { searchLike } = await import("./like.search.ts");
  const { searchOdd } = await import("./odd.search.ts");
  const { searchPay } = await import("./pay.search.ts");
  const mod = (await import(resolve(import.meta.dir, arg("--runtime") ?? "../../round-6/adapter.ts"))) as import("../harness.ts").RuntimeModule;
  if (arg("--swap")) swapFixtures((await import(resolve(import.meta.dir, arg("--swap")!))).swaps);
  const make = makeHarness(mod.port);
  // A read that hides the page (FLOW_TEST_FLUSH's probes) writes to the parent, so it keeps one parent per action.
  engine.onePre = !process.env["FLOW_TEST_FLUSH"];
  const o = { depth, maxStates };
  const which = arg("--which") ?? "pay";
  const t0 = performance.now(); // evidence only: the human line below, never the verdict
  if (which === "oddall") {
    const { searchOddAll } = await import("../scenarios/round5.scenario.ts");
    const { oddAllFixture } = await import("../fixtures/oddall.compiled.ts");
    const n = searchOddAll(() => {
      const h = make();
      h.start({ machines: [oddAllFixture], seed: 1 });
      return h;
    });
    console.log(JSON.stringify({ search: which, verdict: "completed", combinations: n }));
    return [{ kind: "search", name: which, outcome: n > 0 && expect === "completed" ? "pass" : "fail", why: n > 0 ? "" : "no combination", detail: { verdict: n > 0 ? "completed" : "vacuous", combinations: n } }];
  }
  const r =
    which === "pay"
      ? searchPay(make, [payFixture], o)
      : which === "payFixed"
        ? searchPay(make, [payFixedFixture], { ...o, pins: [] })
        : which.startsWith("flush.")
          ? searchFlush(make, which.split(".")[1] as never, o, which.includes(".tight"), which.includes(".wide"), which.includes(".directed") ? "store" : which.includes(".queue") ? "queue" : which.includes(".burst") ? "burst" : which.includes(".wipe") ? "wipe" : which.includes(".capture") ? "capture" : false)
          : which === "chain"
            ? searchChain(make, o)
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
                          ? searchListen(make, which.split(".")[1] as never, o, which.endsWith(".noload") ? "none" : "load")
                          : which === "repairing"
                            ? searchRepairing(make, o)
                            : which.startsWith("fragstore.")
                              ? searchFragStore(make, which.split(".")[1] as never, o)
                              : searchLike(make, [s1Fixture], o);
  console.log(JSON.stringify({ search: which, ...r }, null, 1));
  console.log(`SEARCH-COST ${which}: ${((performance.now() - t0) / 1000).toFixed(1)} s, ${Math.round(process.memoryUsage().rss / 1e6)} MB resident at the end`); // evidence only
  const detail = {
    verdict: r.verdict,
    states: r.states,
    edges: r.edges,
    steps: r.steps,
    depthCompleted: r.depthCompleted,
    perDepth: r.perDepth,
    ...(r.failure !== undefined ? { failure: r.failure } : {}),
    ...(r.deadActions ? { deadActions: r.deadActions } : {}),
  };
  const ok = r.verdict === expect;
  return [{ kind: "search", name: which, outcome: ok ? "pass" : "fail", why: ok ? "" : `${r.verdict}, ${expect} expected${r.failure ? `: ${r.failure.slice(0, 300)}` : ""}`, detail }];
});
