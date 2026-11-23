// Stage A close-out fixes (STAGE-A-CLOSEOUT.md): wrong runtimes for the runner's rulings, aimed at the cases written for them. Standing (spread
// into `mutants-lifetime.ts`).
type M = { readonly id: string; readonly kills: readonly string[]; readonly edits: ReadonlyArray<readonly [string, string, string]> };
const m = (id: string, kills: readonly string[], file: string, find: string, replace: string): M => ({ id, kills, edits: [[file, find, replace]] });
export const MUTANTS: readonly M[] = [
  // B1 (rule 30 as amended, C207): the count resets at `RepairOverdue`. Wrong: it never resets, so after the first overdue no news asks again (the
  // doubt is stranded until a reload).
  m("b1.overdue-strands", ["SURV-05"], "entities.ts", "    return withRec(s, ref, (r) => ({ ...r, asks: 0 }));", "    return s;"),
  // Wrong the other way: the count resets on every ask, so failed asks repeat with no bound and never reach `RepairOverdue`.
  m("b1.resets-every-ask", ["SURV-05"], "entities.ts", "ref, (r) => ({ ...r, asks: asks + 1 }));", "ref, (r) => ({ ...r, asks: 0 }));"),
  // The reviewer's: a placed answer keeps the count, so the next news gets fewer than 3 asks before `RepairOverdue`.
  m("b1.answer-keeps-count", ["SURV-05"], "entities.ts", "const answered = (s: Slice, ref: string): Slice => (recOf(s, ref).asks ? withRec(s, ref, (r) => ({ ...r, asks: 0 })) : s);", "const answered = (s: Slice, _ref: string): Slice => s;"),
];
