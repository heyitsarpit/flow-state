// The second pass: the suite at the runtime's own default interval, with no bound named. A flush happens before a disk read and before a storage fault, since those cases mean "after the
// write". A kill gets no flush: what that loses is the point. gate-5s-expected.txt names what may fail, with its reason. bun conformance/gate5s.ts --runtime ../round-7/adapter.ts
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { stated } from "./verdicts/state.ts";

await stated("gate-5s", async (scope) => {
  const { SUITE } = await import("./limits.ts");
  const { final, job } = await import("./verdicts/runner.ts");
  const { describe } = await import("./verdicts/read.ts");
  const { isScored, sameCases } = await import("./verdicts/verdict.ts");
  const { plannedCases } = await import("./suite.ts");
  const i = process.argv.indexOf("--runtime");
  const runtime = process.argv[i + 1] ?? "../round-13/adapter.ts";
  const runner = scope.runner({ slots: 1, mb: SUITE.size.peakMb, budgetS: null });
  const r = final(
    await runner.run(
      job(
        "suite at the default interval",
        {
          gate: "suite",
          cmd: ["bun", join(import.meta.dir, "main.ts"), "--round", "10", "--no-catalog", "--runtime", runtime],
          cwd: import.meta.dir,
          env: { FLOW_RUNTIME_DEFAULT: "1", FLOW_TEST_FLUSH: "reads,faults" },
          limits: SUITE.limits,
          contract: "gate",
        },
        SUITE.size,
      ),
    ),
  );
  if (r.answer !== "stated") {
    console.log(`GATE-5S could not run: ${describe(r)}`);
    return [{ kind: "gate-5s", name: "gate-5s", outcome: r.answer === "bound" ? "fail" : "unknown", why: describe(r) }];
  }
  const always = r.verdict.items.filter(isScored).filter((x) => x.kind === "threw" || x.kind === "machine");
  if (always.length) return always.map((x) => ({ ...x, kind: "gate-5s", name: `gate-5s ${x.name}` }));
  const partial = sameCases(plannedCases(undefined))(r.verdict);
  if (partial !== null) return [{ kind: "gate-5s", name: "gate-5s", outcome: "fail", why: partial }];
  const cases = r.verdict.items.filter(isScored).filter((x) => x.kind === "case" || x.kind === "work-bound");
  const failed = new Map(cases.filter((x) => x.outcome === "fail").map((x) => [x.name, x.why] as const));
  // Round 8: the review's worry about a free-text allow list. A listed case must still fail as it was read to fail.
  const allowed = new Map(
    readFileSync(resolve(import.meta.dir, "gate-5s-expected.txt"), "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => {
        const c = l.split(" | ");
        return [c[0]!, c.at(-1)!] as const;
      }),
  );
  const unexpected = [...failed.keys()].filter((x) => !allowed.has(x));
  const differently = [...failed].filter(([k, why]) => allowed.has(k) && !why.startsWith(allowed.get(k)!)).map(([k]) => k);
  const passedNow = [...allowed.keys()].filter((x) => !failed.has(x));
  console.log(`GATE-5S  ${failed.size} failed, ${allowed.size} expected; unexpected: ${unexpected.join(" ") || "none"}; failing differently: ${differently.join(" ") || "none"}; expected but passed: ${passedNow.join(" ") || "none"}`);
  const bad = unexpected.length > 0 || differently.length > 0;
  return [
    {
      kind: "gate-5s",
      name: "gate-5s",
      outcome: bad ? "fail" : "pass",
      why: bad ? `unexpected: ${unexpected.join(" ") || "none"}; failing differently: ${differently.join(" ") || "none"}` : "",
      detail: { failed: [...unexpected, ...differently], passedNow },
    },
  ];
});
