// Audit 1's batch: the lead's wrong runtimes for the fixes it made (each undoes one), and the auditor's own wrong runtimes (mutants-audit-1.ts) that
// the new cases turn red on the cases they name, kept as a standing gate. An auditor's mutant the suite kills only elsewhere is left to the full suite.
import { MUTANTS as AUDIT } from "./mutants-audit-1.ts";

type M = { readonly id: string; readonly kills: readonly string[]; readonly edits: ReadonlyArray<readonly [string, string, string]> };
const OWN: readonly M[] = [
  { id: "a1.disposal-head-before-w", kills: ["R15-01/past-the-disposal-bound-the-attempt-ends-unknown-disposed"], edits: [["lane.ts", "  if (e.ch !== \"unknown\") return setLane(tx, parkWaiting(tx, { ...rest, parked: [...lane.parked, own] }));\n  const waited = parkWaiting(tx, { ...lane, head: { ...h, mayHaveApplied: true, phase: { t: \"held\" } } });\n  setLane(tx, { ...waited, parked: [...waited.parked, own] });", "  setLane(tx, parkWaiting(tx, e.ch === \"unknown\" ? { ...lane, head: { ...h, mayHaveApplied: true, phase: { t: \"held\" } }, parked: [...lane.parked, own] } : { ...rest, parked: [...lane.parked, own] }));"]] },
  { id: "a1.reads-are-not-live-work", kills: ["LIFE-13/a-stopped-read-is-heard-when-woken-at-ready"], edits: [["turn.ts", "    if (r.actor === w.a.key && ownedByExited(inc, exits, r.owner) && !(it?.k === \"ending\" && it.attempt === id)) return true;", "    if (false && r.actor === w.a.key) return true;"]] },
  { id: "a1.a-failed-default-is-a-value", kills: ["P1-H/a-default-that-runs-is-refused-at-construction-and-never-runs"], edits: [["../conformance/compile/memory.ts", "  const value = (v: unknown) => Exit.isExit(v) && Exit.isSuccess(v);", "  const value = (v: unknown) => Exit.isExit(v);"]] },
  // The auditor's `audit-1.forget-keeps-undecodable`, re-anchored: its line now also names old-version records.
  { id: "a1.forget-keeps-undecodable", kills: ["R15-01/audit-forget-removes-an-undecodable-record"], edits: [["step.ts", "  if (r || Object.hasOwn(tx.w.undecodable, key) || Object.hasOwn(tx.w.oldVersion, key)) {", "  if (r || Object.hasOwn(tx.w.oldVersion, key)) {"]] },
  { id: "a1.old-version-record-untracked", kills: ["P1-H/audit-forget-removes-an-old-version-record"], edits: [["durable.ts", "        oldVersion[k.slice(6)] = true;\n", ""]] },
];
const STANDING = new Set([
  "audit-1.r15-subroutine-ignored",
  "audit-1.r14-reentry-keeps-activation",
  "audit-1.cancel-all-keyed-does-nothing",
  "audit-1.cancel-all-leaves-the-head",
  "audit-1.cancel-all-idle-silent",
  "audit-1.cancel-all-release-also-cancels-head",
  "audit-1.unkeyed-keyless-in-ending-keyed-rule",
  "audit-1.forget-drops-the-queue",
  "audit-1.unbound-lists-undecodable",
  "audit-1.unbound-reports-undecodable",
  "audit-1.old-version-record-as-undecodable",
  "audit-1.newer-format-is-current",
  "audit-1.forget-is-a-no-op",
  "audit-1.r15-denied-late-redelivered",
]);
export const MUTANTS: readonly M[] = [...OWN, ...(AUDIT as readonly M[]).filter((m) => STANDING.has(m.id))];
