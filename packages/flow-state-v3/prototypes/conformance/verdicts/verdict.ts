import { Result, Schema } from "effect";
import type { Reading } from "./read.ts";

export const Outcome = Schema.Literals(["pass", "fail", "unknown"]);
export type Outcome = typeof Outcome.Type;

export const Scored = Schema.Struct({
  kind: Schema.String,
  name: Schema.String,
  outcome: Outcome,
  why: Schema.String,
  detail: Schema.optionalKey(Schema.Json),
});
export const Noted = Schema.Struct({
  kind: Schema.String,
  name: Schema.String,
  note: Schema.String,
  detail: Schema.optionalKey(Schema.Json),
});
export const Item = Schema.Union([Scored, Noted]);
export type Scored = typeof Scored.Type;
export type Noted = typeof Noted.Type;
export type Item = typeof Item.Type;

export const Verdict = Schema.Struct({
  gate: Schema.String,
  run: Schema.String,
  items: Schema.Array(Item),
});
export type Verdict = typeof Verdict.Type;

export const MARK = "VERDICT ";
export const EXIT = { pass: 0, fail: 1, unknown: 2 } as const satisfies Record<Outcome, number>;
export const ALWAYS_JUDGED: readonly string[] = ["threw", "machine"];

export const isScored = (i: Item): i is Scored => "outcome" in i;
export const judged = (items: readonly Item[], kinds?: readonly string[]): readonly Scored[] =>
  items.filter(isScored).filter((i) => kinds === undefined || kinds.includes(i.kind) || ALWAYS_JUDGED.includes(i.kind));

export const outcomeOf = (items: readonly Item[], kinds?: readonly string[]): Outcome => {
  const s = judged(items, kinds);
  if (s.length === 0 || s.some((i) => i.outcome === "fail")) return "fail";
  return s.some((i) => i.outcome === "unknown") ? "unknown" : "pass";
};
export const firstFail = (items: readonly Item[], kinds?: readonly string[]): Scored | undefined =>
  judged(items, kinds).find((i) => i.outcome === "fail");
export const unknowns = (items: readonly Item[]): readonly string[] =>
  items.filter(isScored).filter((i) => i.outcome === "unknown").map((i) => i.name);
export const noted = (items: readonly Item[]): readonly Noted[] => items.filter((i): i is Noted => !isScored(i));

export const encode = (v: Verdict): string => `${MARK}${JSON.stringify(v)}`;

export type Unstated =
  | { readonly kind: "silent" }
  | { readonly kind: "garbled"; readonly issue: string }
  | { readonly kind: "duplicate"; readonly count: number }
  | { readonly kind: "foreign"; readonly gate: string; readonly run: string };

const decodeVerdict = Schema.decodeUnknownResult(Verdict);

export const theVerdict = (
  stdout: string,
  expect: { readonly gate: string; readonly run: string },
): Result.Result<Verdict, Unstated> => {
  const lines = stdout.split("\n");
  const marked = lines.filter((l) => l.startsWith(MARK));
  if (marked.length === 0) return Result.fail({ kind: "silent" });
  if (marked.length > 1) return Result.fail({ kind: "duplicate", count: marked.length });
  const last = lines.filter((l) => l.trim() !== "").at(-1);
  if (last !== marked[0]) return Result.fail({ kind: "garbled", issue: "the VERDICT line is not the last line" });
  let json: unknown;
  try {
    json = JSON.parse(marked[0]!.slice(MARK.length));
  } catch (e) {
    return Result.fail({ kind: "garbled", issue: `not JSON: ${(e as Error).message}` });
  }
  const v = decodeVerdict(json);
  if (Result.isFailure(v)) return Result.fail({ kind: "garbled", issue: String(v.failure).slice(0, 300) });
  if (v.success.gate !== expect.gate || v.success.run !== expect.run)
    return Result.fail({ kind: "foreign", gate: v.success.gate, run: v.success.run });
  return Result.succeed(v.success);
};

export type Holds = (v: Verdict) => string | null;
export type Judge = { readonly kinds?: readonly string[]; readonly holds?: Holds };

const failedNames = (v: Verdict, kinds?: readonly string[]) =>
  judged(v.items, kinds)
    .filter((i) => i.outcome === "fail")
    .map((i) => i.name);

export const expect = (kind: string, name: string, r: Reading, want: "pass" | "fail", judge: Judge = {}): Scored => {
  if (r.answer === "none") return { kind, name, outcome: "unknown", why: describeCause(r) };
  if (r.answer === "bound")
    return want === "fail" && judge.holds === undefined
      ? { kind, name, outcome: "pass", why: "answered by memory" }
      : { kind, name, outcome: "fail", why: "answered by memory, not stated" };
  const o = outcomeOf(r.verdict.items, judge.kinds);
  const failed = failedNames(r.verdict, judge.kinds);
  const detail = { failed };
  if (o === "unknown") return { kind, name, outcome: "unknown", why: `unknown: ${unknowns(judged(r.verdict.items, judge.kinds)).join(" ")}`, detail };
  const broken = judge.holds?.(r.verdict) ?? null;
  if (o === want && broken === null) return { kind, name, outcome: "pass", why: "", detail };
  return { kind, name, outcome: "fail", why: broken ?? `wanted ${want}, was ${o}${failed.length ? `: ${failed.slice(0, 4).join(" ")}` : ""}`, detail };
};

export const sameCases =
  (planned: readonly string[]): Holds =>
  (v) => {
    const got = v.items.filter((i) => i.kind === "case").map((i) => i.name);
    const want = new Set(planned);
    const have = new Set(got);
    const missing = planned.filter((p) => !have.has(p));
    const extra = got.filter((g) => !want.has(g));
    if (got.length === planned.length && missing.length === 0 && extra.length === 0) return null;
    return `cases differ from the plan: ${got.length} of ${planned.length}${missing.length ? `; missing ${missing.slice(0, 4).join(" ")}` : ""}${extra.length ? `; extra ${extra.slice(0, 4).join(" ")}` : ""}`;
  };

export const searchVerdictIn =
  (verdicts: readonly string[]): Holds =>
  (v) => {
    const s = v.items.find((i) => i.kind === "search");
    const got = (s?.detail as { verdict?: string } | undefined)?.verdict;
    return got !== undefined && verdicts.includes(got) ? null : `search verdict ${got ?? "missing"}, wanted ${verdicts.join(" or ")}`;
  };

const describeCause = (r: Extract<Reading, { answer: "none" }>): string => {
  const c = r.cause;
  switch (c.kind) {
    case "unstarted":
      return `unknown: unstarted: ${c.message}`;
    case "time":
      return "unknown: time";
    case "budget":
      return "unknown: budget";
    case "memory-near":
      return `unknown: memory near the limit${c.referenceMb === null ? ", no reference" : ""}`;
    case "signal":
      return `unknown: signal ${c.signal}`;
    case "disagree":
      return `unknown: the exit ${c.exit} disagrees with the stated ${c.stated}`;
    case "silent":
      return "unknown: silent, no VERDICT line";
    case "garbled":
      return `unknown: garbled VERDICT: ${c.issue}`;
    case "duplicate":
      return `unknown: duplicate VERDICT lines (${c.count})`;
    case "foreign":
      return `unknown: foreign VERDICT (gate ${c.gate}, run ${c.run})`;
  }
};
export const causeText = describeCause;
