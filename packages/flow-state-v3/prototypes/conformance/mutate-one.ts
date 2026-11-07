// One mutant's run, or the control: the round's gates in order, as items; the first that fails is the kill (`firstFail`). Spawned by mutate.ts.
// D101: suite, `--swap`, typed compare and date check, CLI pins, the round's checks, the 5 s gate, then whole output (D134). A search runs only
// with `--search` (or alone with `--search-only`), by a state budget and an expected verdict, so its answer does not depend on the machine.
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { stated } from "./verdicts/state.ts";

const SEARCH_EXPECT = {
  store: "completed",
  queue: "completed",
  bare: "completed",
  directed: "completed",
  chain: "completed",
} as const;

await stated("mutate-one", async (scope) => {
  const { SCRIPT, SUITE, SUITE_PARENT } = await import("./limits.ts");
  const { plannedCases } = await import("./suite.ts");
  const { final, job } = await import("./verdicts/runner.ts");
  const { isAlone } = await import("./verdicts/spawn.ts");
  const { expect, firstFail, sameCases } = await import("./verdicts/verdict.ts");
  type Item = import("./verdicts/verdict.ts").Item;
  type Scored = import("./verdicts/verdict.ts").Scored;
  const here = import.meta.dir;
  const runtimeArg = process.argv[process.argv.indexOf("--runtime") + 1]!;
  const round = resolve(here, dirname(runtimeArg));
  const serial = process.argv.includes("--serial") || isAlone();
  const runner = scope.runner({ slots: serial ? 1 : 4, mb: 5000, budgetS: null });
  const gateJob = (name: string, gate: string, cmd: readonly string[], b: typeof SUITE, env: Record<string, string> = {}) =>
    job(name, { gate, cmd: ["bun", ...cmd], cwd: here, env, limits: b.limits, contract: "gate" }, b.size);
  const items: Item[] = [];
  const push = (i: Scored) => {
    const unknownBefore = items.filter((x) => "outcome" in x && x.outcome === "unknown").map((x) => x.name);
    items.push(i.outcome === "fail" && unknownBefore.length && firstFail(items) === undefined ? { ...i, detail: { ...(i.detail as object), before: unknownBefore } } : i);
  };
  const stop = () => firstFail(items) !== undefined;
  const searches = async (which: "only" | "after") => {
    const { makeHarness } = await import("./drive.ts");
    const { searchChain } = await import("./search/chain.search.ts");
    const { searchFlush } = await import("./search/flush.search.ts");
    const mod = (await import(resolve(here, runtimeArg))) as import("./harness.ts").RuntimeModule;
    const make = makeHarness(mod.port);
    const item = (name: keyof typeof SEARCH_EXPECT, r: import("./search/engine.ts").Report): Scored => ({
      kind: "search",
      name: `search ${name}`,
      outcome: r.verdict === SEARCH_EXPECT[name] ? "pass" : "fail",
      why: r.verdict === SEARCH_EXPECT[name] ? "" : `${r.verdict}, ${SEARCH_EXPECT[name]} expected${r.failure ? `: ${r.failure.slice(0, 200)}` : ""}`,
      detail: { verdict: r.verdict, states: r.states, failed: r.failure ? [r.failure.slice(0, 200)] : [] },
    });
    if (which === "only") {
      const o = { depth: 12, maxStates: 3_000 };
      push(item("store", searchFlush(make, "serialize", o, false, false, "store")));
      if (!stop()) push(item("queue", searchFlush(make, "serialize", o, false, false, "queue")));
      if (!stop()) push(item("bare", searchFlush(make, "bare", o, true)));
      return;
    }
    push(item("directed", searchFlush(make, "serialize", { depth: 11, maxStates: 8_000 }, false, false, "store")));
    if (!stop()) push(item("chain", searchChain(make, { depth: 4, maxStates: 6_000 })));
  };
  if (process.argv.includes("--search-only")) {
    await searches("only");
    return items;
  }
  const plain = ["main.ts", "--round", "99", "--no-catalog", "--runtime", runtimeArg];
  const swaps = existsSync(join(round, "typed/swaps.ts"));
  const early = [
    gateJob("suite", "suite", plain, SUITE),
    ...(swaps ? [gateJob("swap", "suite", [...plain.slice(0, 4), "--swap", join(round, "typed/swaps.ts"), ...plain.slice(4)], SUITE)] : []),
    ...(swaps ? ["typed/compare.ts", "typed/date-check.ts"].map((f) => gateJob(f, f, [join(round, f)], SCRIPT)) : []),
    ...(existsSync(join(round, "cli/main.ts")) ? [gateJob("cli", "cli", [join(round, "cli/main.ts")], SCRIPT)] : []),
  ];
  const gate5s = gateJob("gate", "gate-5s", ["gate5s.ts", "--runtime", runtimeArg], SUITE_PARENT);
  const started = serial ? undefined : [...early, gate5s].map((j) => runner.run(j));
  const at = async (k: number, j: (typeof early)[number]) => final(await (started ? started[k]! : runner.run(j)));
  const planned = plannedCases(undefined);
  const plainReading = await at(0, early[0]!);
  push(expect("gate", "suite", plainReading, "pass", { kinds: ["case"], holds: sameCases(planned) }));
  for (const [k, j] of early.slice(1).entries()) {
    if (stop()) break;
    const judge = j.name === "swap" ? { kinds: ["case"], holds: sameCases(planned) } : {};
    push(expect("gate", j.name, await at(k + 1, j), "pass", judge));
  }
  if (started && !stop()) await Promise.allSettled(started);
  const checks = existsSync(join(round, "checks")) ? readdirSync(join(round, "checks")).filter((x) => x.endsWith(".ts")).sort() : [];
  for (const f of checks) {
    if (stop()) break;
    push(expect("gate", `checks/${f}`, final(await runner.run(gateJob(`checks/${f}`, `checks/${f}`, [join(round, "checks", f)], SCRIPT))), "pass"));
  }
  if (!stop()) push(expect("gate", "gate", await at(early.length, gate5s), "pass"));
  if (!stop()) push(expect("gate", "output", plainReading, "pass", { kinds: ["output"] }));
  if (!stop() && process.argv.includes("--search")) await searches("after");
  return items;
});
