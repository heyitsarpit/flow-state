// Audit M2's batch (phase 1 record migration, the closing batch): every wrong runtime of the migration audit M2 (`mutants-audit-m2.ts`, unedited)
// aimed at the case written for it from the design text, and this batch's runtime fixes undone. Standing (spread into `mutants-lifetime.ts`).
import { MUTANTS as AUDIT_M2 } from "./mutants-audit-m2.ts";

type M = { readonly id: string; readonly kills: readonly string[]; readonly edits: ReadonlyArray<readonly [string, string, string]> };
const P = "P1-M/";
const AIM: Readonly<Record<string, readonly string[]>> = {
  "m2.q1-state-gone-ignored": [`${P}a-state-a-release-removed-resets-the-definition-and-an-ensure-adopts-the-hold`],
  "m2.q1-fragment-state-gone-ignored": [`${P}a-fragment-state-gone-resets-the-record`],
  "m2.q1-fragment-field-version-ignored": [`${P}a-fragment-field-under-another-schema-resets-the-record`],
  "m2.q1-retired-record-not-reset": [`${P}a-retired-record-resets-across-an-incompatible-change`],
  "m2.q1-issue-per-record": [`${P}two-records-of-one-definition-reset-under-one-issue`],
  "m2.q1-reset-not-written": [`${P}a-state-a-release-removed-resets-the-definition-and-an-ensure-adopts-the-hold`],
  "m2.q1-reset-drops-parked-endings": [`${P}a-parked-ending-survives-a-reset-and-is-heard`],
  "m2.q1-reset-keeps-timers": [`${P}a-reset-records-waiting-deadline-does-not-fire`],
  "m2.q1-unstamped-record-resets": [`${P}a-record-with-no-shape-stamp-is-never-reset`],
  "m2.q1-shape-before-identity": ["R14-ID-02/a-type-change-over-the-same-encoded-side-is-a-new-version"],
  "m2.r74-live-ending-ignores-identity": [`${P}a-new-version-actor-of-the-same-name-text-does-not-hear-the-old-hold`],
  "m2.r74-unbound-by-record-only": [`${P}a-new-version-actor-of-the-same-name-text-does-not-hear-the-old-hold`],
  "m2.rename-old-record-kept": [`${P}renaming-an-operation-changes-nothing-persisted`],
  "m2.rename-any-op-kind": [`${P}a-rename-moves-to-the-write-op-not-a-read-over-its-contract`],
};
const aimed = (list: readonly M[]) => list.filter((m) => Object.hasOwn(AIM, m.id)).map((m) => ({ ...m, kills: AIM[m.id]! }));
const m = (id: string, kills: readonly string[], file: string, find: string, replace: string): M => ({ id, kills, edits: [[file, find, replace]] });
export const MUTANTS: readonly M[] = [
  ...aimed(AUDIT_M2 as readonly M[]),
  // The runner's Q17 ruling: a new identity of the same name text gets its own lane. Wrong: the old identity's lane stays at the key's id (break 1).
  m("am2.old-identity-shares-the-lane", [`${P}a-new-identity-of-the-same-name-text-gets-its-own-lane`], "durable.ts", "  const id = current ? keyId : `${keyId}#${identityTag(l.identity)}`;", "  const id = keyId;"),
  // The reviewer's: an identity current again (a release reverted) takes its key's lane back. Wrong: it stays tagged, so its key gets a second lane.
  m("am2.reverted-identity-stays-tagged", [`${P}an-identity-current-again-takes-its-lane-back`], "durable.ts", "  if (current && (l.id === keyId || taken.has(keyId))) return l;", "  if (current) return l;"),
  // Break 2: a rename never moves onto a lane already on disk. Wrong: it does, over the other record.
  m("am2.rename-onto-a-taken-lane", [`${P}a-rename-onto-a-lane-already-on-disk-keeps-both-quarantined-and-says-so`], "durable.ts", "  if (onDisk.has(id)) {", "  if (false) {"),
  // Break 3 (Q1 A "a saved state goes away"): a history target is a saved state. Wrong: only the leaf and the copies count.
  m("am2.history-target-ignored", [`${P}a-removed-state-a-history-points-to-resets-the-record`], "durable.ts", '    if (Object.values(inc.history ?? {}).some((n) => typeof n === "string" && !states.has(frag === null ? n : `${frag}/${n}`))) return true;\n', ""),
  // The runner's Q20 ruling: the drop is applied at its boot. Wrong: the record is left as it was, so a later re-add resurrects the old value.
  m("am2.drop-not-applied", [`${P}a-field-dropped-then-declared-again-starts-empty`], "durable.ts", "      if (dropped.length) (tx.rewrites ??= new Map()).set(", "      if (false) (tx.rewrites ??= new Map()).set("),
];
