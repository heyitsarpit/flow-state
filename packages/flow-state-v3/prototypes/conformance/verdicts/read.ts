import { Result } from "effect";
import { text, type Ended, type Run } from "./spawn.ts";
import { causeText, EXIT, firstFail, isScored, outcomeOf, theVerdict, unknowns, type Outcome, type Unstated, type Verdict } from "./verdict.ts";

export const MEMORY_MARGIN = 1.5;

export type NoAnswer =
  | { readonly kind: "unstarted"; readonly message: string }
  | { readonly kind: "time" }
  | { readonly kind: "budget" }
  | { readonly kind: "memory-near"; readonly peakMb: number; readonly limitMb: number; readonly referenceMb: number | null }
  | { readonly kind: "signal"; readonly signal: string }
  | { readonly kind: "disagree"; readonly exit: number | null; readonly stated: Outcome }
  | Unstated;
export type Bound = { readonly kind: "memory"; readonly peakMb: number; readonly limitMb: number; readonly referenceMb: number };

export type Reading =
  | { readonly answer: "stated"; readonly verdict: Verdict; readonly run: Ended }
  | { readonly answer: "bound"; readonly bound: Bound; readonly run: Ended }
  | { readonly answer: "none"; readonly cause: NoAnswer; readonly run: Run };

const toolVerdict = (run: Ended): Verdict => ({
  gate: run.launch.gate,
  run: run.launch.run,
  items: [{ kind: "tool", name: run.launch.gate, outcome: run.exit === 0 ? "pass" : "fail", why: `exit ${run.exit}` }],
});

const memory = (run: Ended): Reading => {
  const ref = run.launch.referenceMb;
  const limitMb = run.launch.limits.mb;
  return ref !== null && limitMb >= MEMORY_MARGIN * ref
    ? { answer: "bound", bound: { kind: "memory", peakMb: run.peakMb, limitMb, referenceMb: ref }, run }
    : { answer: "none", cause: { kind: "memory-near", peakMb: run.peakMb, limitMb, referenceMb: ref }, run };
};

export const read = (run: Run): Reading => {
  if (run.kind === "unstarted") return { answer: "none", cause: { kind: "unstarted", message: run.message }, run };
  if (run.killed && run.decided === "rss") return memory(run);
  if (run.killed && run.decided === "time") return { answer: "none", cause: { kind: "time" }, run };
  if (run.killed && run.decided === "budget") return { answer: "none", cause: { kind: "budget" }, run };
  if (run.signal !== null) return { answer: "none", cause: { kind: "signal", signal: run.signal }, run };
  if (run.launch.contract === "program") throw new Error(`read of a program under test: ${run.launch.gate}`);
  if (run.launch.contract === "tool") return { answer: "stated", verdict: toolVerdict(run), run };
  const v = theVerdict(text(run.stdout), { gate: run.launch.gate, run: run.launch.run });
  if (Result.isFailure(v)) return { answer: "none", cause: v.failure, run };
  const o = outcomeOf(v.success.items);
  if (run.exit !== EXIT[o]) return { answer: "none", cause: { kind: "disagree", exit: run.exit, stated: o }, run };
  return { answer: "stated", verdict: v.success, run };
};

export const outcome = (r: Reading, kinds?: readonly string[]): Outcome =>
  r.answer === "stated" ? outcomeOf(r.verdict.items, kinds) : r.answer === "bound" ? "fail" : "unknown";

export const describe = (r: Reading): string => {
  if (r.answer === "none") return causeText(r);
  if (r.answer === "bound") return "fail: killed by memory, the limit at least 1.5 times the reference peak";
  const items = r.verdict.items;
  const scored = items.filter(isScored);
  const o = outcomeOf(items);
  const f = firstFail(items);
  const u = unknowns(items);
  const counts = `${scored.filter((i) => i.outcome === "pass").length} pass, ${scored.filter((i) => i.outcome === "fail").length} fail, ${u.length} unknown, ${items.length - scored.length} noted`;
  if (f) return `fail: ${f.name}${f.why ? `: ${f.why.slice(0, 200)}` : ""} (${counts})`;
  if (o === "unknown") return `unknown: ${u.slice(0, 4).join(" ")} (${counts})`;
  if (o === "fail") return `fail: nothing was scored (${counts})`;
  return `pass (${counts})`;
};

export const verdictOf = (r: Reading): Verdict | null => (r.answer === "stated" ? r.verdict : null);
