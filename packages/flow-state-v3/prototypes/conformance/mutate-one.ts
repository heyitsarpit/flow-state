// One mutant's run: scenarios, then a small search only if they all pass. Prints one JSON line. Spawned by mutate.ts.
import { resolve } from "node:path";
import { makeHarness } from "./drive.ts";
import { payFixture } from "./fixtures/pay.compiled.ts";
import { s1Fixture } from "./fixtures/s1.compiled.ts";
import type { RuntimeModule } from "./harness.ts";
import { runScenarios } from "./main.ts";
import { searchCross } from "./search/cross.search.ts";
import { searchFragStore } from "./search/fragstore.search.ts";
import { searchLike } from "./search/like.search.ts";
import { searchListen } from "./search/listen.search.ts";
import { searchRepairing, searchSession } from "./search/session.search.ts";
import { searchPay } from "./search/pay.search.ts";

const i = process.argv.indexOf("--runtime");
const mod = (await import(resolve(import.meta.dir, process.argv[i + 1]!))) as RuntimeModule;
const make = makeHarness(mod.port);
const killers = runScenarios(make)
  .filter((r) => !r.ok)
  .map((r) => (r.variant ? `${r.id}/${r.variant}` : r.id));
let search = "skipped";
if (killers.length === 0) {
  const o = { depth: 6, maxStates: 3000, deadlineMs: 8_000 };
  const a = searchPay(make, [payFixture], o);
  const b = a.verdict === "failed" ? a : searchLike(make, [s1Fixture], o);
  const d = b.verdict === "failed" ? b : searchCross(make, o);
  const e = d.verdict === "failed" ? d : searchFragStore(make, "nothing", o);
  const f = e.verdict === "failed" ? e : searchSession(make, o);
  const g = f.verdict === "failed" ? f : searchListen(make, "version", o);
  const j = g.verdict === "failed" ? g : searchRepairing(make, o);
  search = j.verdict;
}
console.log(JSON.stringify({ killers, search }));
