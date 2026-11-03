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
      else if ((MUST_BE_ZERO as readonly string[]).includes(k) && !(typeof x === "number" && Number.isFinite(x))) bad.push(`${p} = ${String(x)}: not a count`); // re-audit M1
      else if ((MUST_BE_ZERO as readonly string[]).includes(k) && x > 0 && !(k in known)) bad.push(`${p} = ${x}`);
      else walk(x, p);
    }
  };
  walk(out, "");
  return { code: bad.length ? 1 : 0, bad };
};
// Re-audit M1: a run that ran nothing is not a pass. Each mode `run.ts` was asked for must report its sections, with every counter its kind
// declares, as a number. Rows: an array that must not be empty, each with these counters. An object: these counters at its top.
type Need = { readonly rows?: readonly string[]; readonly counters?: readonly string[]; readonly equal?: Readonly<Record<string, unknown>> };
export const MODES: Readonly<Record<string, Readonly<Record<string, Need>>>> = {
  s3: { s3store: { rows: [] }, s3runtime: { rows: [] } },
  atom: { atom: { rows: ["lostAcked", "cycles"] } },
  crash: { crash: { rows: [] }, crashSummary: { counters: ["cycles", "doubleCharge", "chargedNoLane", "fatal", "unsettled"] } },
  // Re-audit L5: the green arm must have been cached and reloaded, or it says nothing about bfcache.
  bfcache: { bfcache: { counters: ["bfcacheZombie"], equal: { cached: true, back: "reload" } } },
  tabs: { tabs: { counters: [] } },
  desk: { desk: { rows: [] } },
};
export const scoreAsked = (out: unknown, asked: readonly string[], known: Readonly<Record<string, string>> = {}): { code: 0 | 1; bad: string[] } => {
  const { bad } = score(out, known);
  const o = (out ?? {}) as Record<string, any>;
  if (asked.length === 0) bad.push("no mode asked for");
  for (const mode of asked) {
    const need = MODES[mode];
    if (!need) {
      bad.push(`${mode}: no such mode`);
      continue;
    }
    for (const [section, n] of Object.entries(need)) {
      const v = o[section];
      const num = (x: unknown) => typeof x === "number" && Number.isFinite(x);
      if (v === undefined) bad.push(`${mode}: ${section} did not report`);
      else if (n.rows) {
        if (!Array.isArray(v) || v.length === 0) bad.push(`${mode}: ${section} has no rows`);
        else for (const [i, r] of v.entries()) for (const c of n.rows) if (!num(r?.[c])) bad.push(`${mode}: ${section}[${i}].${c} is not a count`);
      } else {
        if (typeof v !== "object" || v === null) bad.push(`${mode}: ${section} is not an object`);
        else {
          for (const c of n.counters ?? []) if (!num(v[c])) bad.push(`${mode}: ${section}.${c} is not a count`);
          for (const [k, want] of Object.entries(n.equal ?? {})) if (v[k] !== want) bad.push(`${mode}: ${section}.${k} = ${JSON.stringify(v[k])}, wanted ${JSON.stringify(want)}`);
        }
      }
    }
  }
  return { code: bad.length ? 1 : 0, bad };
};
// What every run calls last, in place of `process.exit(0)`. `asked`: the modes this run was asked for, when its kinds are declared above.
export const exitScored = (out: unknown, known: Readonly<Record<string, string>> = {}, asked?: readonly string[]): never => {
  const s = asked ? scoreAsked(out, asked, known) : score(out, known);
  console.log(s.code ? `SCORE FAIL ${s.bad.join("; ")}` : "SCORE PASS");
  process.exit(s.code);
};
