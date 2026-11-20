// Audit 3's gap batch (AUDIT-GAPS-3.md): the auditor's wrong runtimes (mutants-audit-3.ts, unedited) and audit 2's regression, each aimed at the case
// written for it from the design text, kept as a standing gate. The lies and the drain's fault stand in falsify.ts (search kills and lies).
// `a3.many-at-4096` is red on its own case, P1-E-CAP (4,096 sent), by assertion in the plain suite; P1-E-CAP stays out of the lifetime list (its
// 4,096 records cost seconds a run), so that one is left to the full suite.
import { MUTANTS as AUDIT2 } from "./mutants-audit-2.ts";
import { MUTANTS as AUDIT3 } from "./mutants-audit-3.ts";
import { MUTANTS as AUDIT3B } from "./mutants-audit-3b.ts";

type M = { readonly id: string; readonly kills: readonly string[]; readonly edits: ReadonlyArray<readonly [string, string, string]> };
const P = "P1-E/";
const AIM: Readonly<Record<string, readonly string[]>> = {
  "audit-2.r30-release-stays-queued": [`${P}audit-a-release-after-repair-overdue-frees-the-record-at-once`],
  "a3.r30-free-at-unknown": [`${P}a-sent-hold-releases-its-record-when-its-repair-settles`],
  "a3.r30-failed-repair-settles": [`${P}audit-a-release-after-repair-overdue-frees-the-record-at-once`],
  "a3.r30-overdue-settles": [`${P}audit-a-release-after-repair-overdue-frees-the-record-at-once`],
  "a3.r30-settle-every-record": [`${P}audit-a-two-record-unknown-frees-each-record-by-its-own-repair`],
  "a3.r30-resend-keeps-place": [`${P}a-sent-hold-releases-its-record-when-its-repair-settles`],
  "a3.r30-resend-no-rehold": [`${P}audit-a-second-re-send-holds-the-record-again`],
  "a3.r30-first-resend-no-rehold": [`${P}audit-a-first-re-send-holds-the-record-again`],
  "a3.r30-restored-holds-nothing": [`${P}audit-a-restored-unknown-holds-its-record-until-the-boot-repair-settles`],
  "a3.many-distinct-keys": [`${P}audit-the-many-bound-is-4096-and-the-cap-is-past-64`],
  "a3.key-field-is-id": [`${P}audit-a-gap-leaves-out-the-entitys-own-key-fields`],
  "a3.cover-ignores-prediction": [`${P}audit-a-gap-marks-a-record-predicted-into-the-cover`],
  "a3.cover-ignores-doubt": [`${P}audit-a-gap-marks-a-record-in-doubt`],
  "a3.cover-ignores-unconfirmed": [`${P}audit-a-gap-marks-a-record-whose-filter-field-is-unconfirmed`],
  "a3.cover-ignores-marks": [`${P}audit-a-gap-marks-a-record-that-may-have-moved-into-the-cover`],
};
// Audit 3b (`mutants-audit-3b.ts`): the two survivors reached by existing cases but never asserted.
const AIM_3B: Readonly<Record<string, readonly string[]>> = {
  "a3b.release-drops-predictions": [`${P}audit-a-release-before-the-repair-lands-keeps-the-prediction`],
  "a3b.repair-ends-every-prediction": [`${P}audit-a-two-record-unknown-frees-each-record-by-its-own-repair`],
};
const aimed3b = (list: readonly M[]) => list.filter((m) => Object.hasOwn(AIM_3B, m.id)).map((m) => ({ ...m, kills: AIM_3B[m.id]! }));
const aimed = (list: readonly M[]) => list.filter((m) => Object.hasOwn(AIM, m.id)).map((m) => ({ ...m, kills: AIM[m.id]! }));
export const MUTANTS: readonly M[] = [...aimed(AUDIT2 as readonly M[]), ...aimed(AUDIT3 as readonly M[]), ...aimed3b(AUDIT3B as readonly M[])];
