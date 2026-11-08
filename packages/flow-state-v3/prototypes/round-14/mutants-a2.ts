// Audits 2 and 1b, the gap batch (AUDIT-GAPS-2.md): the lead's wrong runtimes for the fixes it made (each undoes one), and the auditors' own wrong
// runtimes (mutants-audit-2.ts, mutants-audit-1b.ts, unedited) that the new cases turn red, kept as a standing gate aimed at the case written for each.
import { MUTANTS as AUDIT1 } from "./mutants-audit-1.ts";
import { MUTANTS as AUDIT1B } from "./mutants-audit-1b.ts";
import { MUTANTS as AUDIT2 } from "./mutants-audit-2.ts";

type M = { readonly id: string; readonly kills: readonly string[]; readonly edits: ReadonlyArray<readonly [string, string, string]> };
const E = "entities.ts";
const P = "P1-E/";
const OWN: readonly M[] = [
  { id: "a2.many-unbounded", kills: [`${P}audit-the-cap-and-the-many-bound-are-4096`], edits: [[E, "    if (Array.isArray(keys) && keys.length > MANY_MAX) return { s, ok: false };\n", ""]] },
  { id: "a2.key-fields-marked", kills: [`${P}covers-a-gap-marks-only-the-covered-records`, `${P}audit-a-gap-marks-a-record-that-may-have-moved-into-the-cover`], edits: [[E, "Object.keys(r.base).filter((f) => !r.keyed?.includes(f))", "Object.keys(r.base)"]] },
  // The auditor's `1b.r15-lateness-transitive` reads `w.late`, which `runTurn` clears before any member runs, so it changes nothing (vacuous). This
  // one makes lateness transitive where it can: a call started in a late turn takes the late ending's owner.
  { id: "a2.lateness-transitive", kills: ["R15-01/audit-a-call-started-in-a-late-turn-ends-current"], edits: [["turn.ts", "const ownerOf = (w: Walk, part: Part): Owner => {", 'const ownerOf = (w: Walk, part: Part): Owner => { if (w.lateFill && w.item?.k === "ending") return w.item.owner as Owner;']] },
  { id: "a2.cover-last-known-base-only", kills: [`${P}audit-a-gap-marks-a-record-that-may-have-moved-into-the-cover`], edits: [[E, "  return [...within, ...Object.entries(s.records)", "  return [...within]; [...Object.entries(s.records)"]] },
];
// The auditors' survivors, each aimed at the case written for it (the kills here replace their broad `P1-E`).
const AIM: Readonly<Record<string, readonly string[]>> = {
  "audit-2.replay-ignores-values": [`${P}audit-a-business-key-success-under-another-key-ends-nothing`],
  "audit-2.replay-across-contracts": [`${P}audit-a-business-key-success-of-another-contract-ends-nothing`],
  "audit-2.guard-proof-reads-only": [`${P}audit-a-feed-frame-past-the-sent-base-ends-a-guarded-doubt`, `${P}audit-another-writes-success-past-the-sent-base-ends-a-guarded-doubt`],
  "audit-2.r28-first-record-only": [`${P}audit-a-two-record-write-waits-on-its-second-records-queue`],
  "audit-2.replay-ends-unresolved": [`${P}audit-an-unresolved-mark-stays-beside-a-business-key-success`],
  "audit-2.cap-evicts-unresolved": [`${P}audit-an-unresolved-mark-stays-beside-a-full-cap`],
  "audit-2.covers-ends-marks": [`${P}audit-a-cover-registered-after-the-give-up-hides-and-ends-nothing`],
  "audit-2.covers-hides-unresolved": [`${P}audit-a-cover-does-not-hide-an-unresolved-doubt`],
  "audit-2.covers-hides-behind": [`${P}audit-a-cover-with-an-open-gap-hides-nothing`],
  "audit-2.covers-hides-removal": [`${P}audit-a-cover-does-not-hide-a-removals-doubt`],
  "audit-2.u10-demote-any-field": [`${P}audit-a-later-success-carrying-some-of-the-marks-fields-demotes-nothing`],
  "audit-2.u10-frame-demotes": [`${P}audit-a-feed-frame-does-not-demote-a-given-up-mark`],
  "audit-2.contradicted-on-resend": [`${P}audit-a-re-sent-success-over-a-known-stale-base-is-no-contradiction`],
  "audit-2.gone-refetch-ignored": [`${P}audit-a-gap-refetch-that-answers-the-gone-tag-removes-the-row`],
  "audit-2.cap-global": [`${P}audit-the-cap-counts-each-entity-apart`],
  "audit-2.cap-is-64": [`${P}audit-the-cap-and-the-many-bound-are-4096`],
  "1b.disposal-definite-w-first": ["R15-01/audit-a-definite-ending-during-disposal-is-parked-before-w-and-drops-the-head"],
  "1b.disposal-definite-keeps-head": ["R15-01/audit-a-definite-ending-during-disposal-is-parked-before-w-and-drops-the-head"],
  "1b.r15-denied-late-releases-hold": ["R15-01/audit-a-denied-late-unknown-keeps-its-hold-until-cancel-all"],
  "1b.r14-history-reentry-keeps-activation": ["R15-01/audit-a-history-re-entry-makes-an-in-flight-calls-ending-late"],
  "1b.unbound-lists-retired": ["R15-01/audit-a-retired-records-held-lane-is-not-unbound"],
  "1b.unbound-reports-retired": ["R15-01/audit-a-retired-records-held-lane-is-not-unbound"],
  "audit-1.r15-held-head-is-live": ["R15-01/audit-a-late-exit-may-leave-another-operations-held-head"],
  "audit-1.r15-own-op-only": ["R15-01/audit-a-late-exit-may-not-leave-another-operations-in-flight-head"],
  "audit-1.old-version-declines-under-reject-only": ["P1-H/audit-under-latest-a-commit-beside-an-old-version-hold-declines-old-version", "P1-H/audit-under-cancel-a-commit-beside-an-old-version-hold-declines-old-version"],
  "audit-1.restore-lanes-newest-first": ["R15-02/audit-a-reload-restores-held-lanes-in-creation-order"],
  "1b.old-version-latest-cancel-send": ["P1-H/audit-under-latest-a-commit-beside-an-old-version-hold-declines-old-version", "P1-H/audit-under-cancel-a-commit-beside-an-old-version-hold-declines-old-version"],
};
const aimed = (list: readonly M[]) => list.filter((m) => Object.hasOwn(AIM, m.id)).map((m) => ({ ...m, kills: AIM[m.id]! }));
export const MUTANTS: readonly M[] = [...OWN, ...aimed(AUDIT2 as readonly M[]), ...aimed(AUDIT1B as readonly M[]), ...aimed(AUDIT1 as readonly M[])];
