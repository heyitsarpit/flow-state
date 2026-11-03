// D144, bugs M7: a real run's result is scored, and its exit says so. Before, every run exited 0 in `finally`, and an error was a line in a JSON file.
// What must be zero wherever it appears: money moved twice, a told-not-charged that charged, a fatal, an unsettled page, a charge with no lane.
// `known` names a counter a run reports on purpose and must not fail on (H3's wipes, a stated Chrome limit), with why.
export const MUST_BE_ZERO = ["twoCharges", "doubleCharge", "toldNotChargedAndCharged", "chargedNoLane", "fatal", "unsettled", "twoKeysBesideAnUndecidedFirst", "lostAcked", "bfcacheZombie"] as const;

export const score = (out: unknown, known: Readonly<Record<string, string>> = {}): { code: 0 | 1; bad: string[] } => {
  const bad: string[] = [];
  const walk = (v: unknown, path: string) => {
    if (v === null || typeof v !== "object") return;
    for (const [k, x] of Object.entries(v)) {
      const p = path ? `${path}.${k}` : k;
      if (k === "error" || k.endsWith(".error")) bad.push(`${p}: ${String(x).slice(0, 160)}`);
      else if (x === "NO ANSWER") bad.push(`${p}: no answer`); // spin.ts: the page never came back
      else if ((MUST_BE_ZERO as readonly string[]).includes(k) && typeof x === "number" && x > 0 && !(k in known)) bad.push(`${p} = ${x}`);
      else walk(x, p);
    }
  };
  walk(out, "");
  return { code: bad.length ? 1 : 0, bad };
};
// What every run calls last, in place of `process.exit(0)`.
export const exitScored = (out: unknown, known: Readonly<Record<string, string>> = {}): never => {
  const s = score(out, known);
  console.log(s.code ? `SCORE FAIL ${s.bad.join("; ")}` : "SCORE PASS");
  process.exit(s.code);
};
