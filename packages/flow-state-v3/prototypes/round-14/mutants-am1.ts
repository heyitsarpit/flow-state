// Audit M1's batch (phase 1 record migration, round 3): each of the migration audit's survivors (`mutants-audit-m1.ts`, unedited) aimed at the case
// written for it from the design text, its lie, and this round's two runtime fixes undone. Standing (spread into `mutants-lifetime.ts`).
import { MUTANTS as AUDIT_M1 } from "./mutants-audit-m1.ts";

type M = { readonly id: string; readonly kills: readonly string[]; readonly edits: ReadonlyArray<readonly [string, string, string]> };
const P = "P1-M/";
const AIM: Readonly<Record<string, readonly string[]>> = {
  "m1.null-format-as-1": [`${P}a-null-fractional-or-string-record-format-is-quarantined`],
  "m1.fraction-format-floors": [`${P}a-null-fractional-or-string-record-format-is-quarantined`],
  "m1.string-format-coerced": [`${P}a-null-fractional-or-string-record-format-is-quarantined`],
  "m1.newer-format-read": [`${P}a-record-of-a-newer-flow-record-format-is-quarantined-and-its-lane-still-holds`],
  "m1.format1-lossy-lane": [`${P}a-format-1-lane-keeps-its-retry-count`],
  "m1.format1-lossy-actor": [`${P}a-format-1-actor-record-keeps-its-timers-and-stopped-reads`],
  "m1.previous-retryable-ignores-times": [`${P}previous-retryable-keeps-its-budget`],
  "m1.field-dropped-before-stopped": [`${P}no-field-dropped-for-a-record-then-quarantined`],
  "m1.field-dropped-fragment-silent": [`${P}a-fragment-field-a-release-stops-declaring-is-said`],
  "m1.hwr-only-saved-held": [`${P}an-in-flight-head-on-a-gone-record-is-said`],
  "m1.hwr-old-version-too": ["P1-H/audit-an-old-version-records-held-lane-is-unbound-listed-and-reported"],
  "m1.fresh-never-saved": [`${P}the-fresh-actor-over-a-quarantined-record-is-saved`],
  "m1.version-type-side-only": [`${P}a-key-field-changing-only-its-encoded-side-is-a-new-version`],
  "lie:m1.quarantine-beside-old-hold": [`${P}a-current-keyed-member-never-names-an-old-version-hold-even-by-the-same-text`], // Q1 A: the composite now resets Memo's record
};
const aimed = (list: readonly M[]) => list.filter((m) => Object.hasOwn(AIM, m.id)).map((m) => ({ ...m, kills: AIM[m.id]! }));
const m = (id: string, kills: readonly string[], file: string, find: string, replace: string): M => ({ id, kills, edits: [[file, find, replace]] });
export const MUTANTS: readonly M[] = [
  ...aimed(AUDIT_M1 as readonly M[]),
  // 2.7.15: "renaming an operation changes nothing persisted". Wrong: a lane is found by its op name only (as before round 3).
  m("am1.op-rename-ignored", [`${P}renaming-an-operation-changes-nothing-persisted`], "durable.ts", '  if (!m || typeof v.contract !== "string" || here?.contract === v.contract || (here && here.contract === undefined)) return v;', "  return v;"),
  // The same rule (the reviewer's): an op of the lane's name over another contract is not its op. Wrong: the name wins.
  m("am1.op-name-wins-over-contract", [`${P}a-new-op-of-the-old-name-over-another-contract-does-not-take-the-lane`], "durable.ts", '  if (!m || typeof v.contract !== "string" || here?.contract === v.contract || (here && here.contract === undefined)) return v;', '  if (!m || typeof v.contract !== "string" || here) return v;'),
  // The same, from the record: the lane record carries no contract id.
  m("am1.lane-without-contract", [`${P}renaming-an-operation-changes-nothing-persisted`, `${P}every-record-flow-writes-says-its-record-format`], "durable.ts", "    ...(tx.machines[l.machine]?.ops[l.op]?.contract ? { contract: tx.machines[l.machine]!.ops[l.op]!.contract } : {}), // 2.7.15: (identity, contract id, key)\n", ""),
  // Rule 74: an old-version record's lanes stay unbound, "since no ref can spell its identity". Wrong: a new identity of the same name text adopts them.
  m("am1.old-identity-adopted", [`${P}a-new-version-actor-of-the-same-name-text-does-not-hear-the-old-hold`], "lane.ts", "  if (!l?.identity || !m?.identityVersion) return true;", "  return true;"),
];
