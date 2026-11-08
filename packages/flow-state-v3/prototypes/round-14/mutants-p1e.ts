// Phase 1 area E's wrong runtimes: each undoes one decision (the runner's 0a, D3 as directed, U10, U7, the real source path), and the named case
// must go red by assertion.
export const MUTANTS: ReadonlyArray<{ readonly id: string; readonly kills: readonly string[]; readonly edits: ReadonlyArray<readonly [string, string, string]> }> = [
  { id: "p1e.cancel-overwritten-by-replace", kills: ["P1-E/a-pending-cancel-survives-a-later-latest-commit"], edits: [["lane.ts", "then: old.phase.then === \"cancel\" ? \"cancel\" : \"replace\"", "then: \"replace\""]] },
  { id: "p1e.join-at-mint", kills: ["P1-E/a-draft-behind-its-own-hold-stalls-no-other-actor"], edits: [
    ["entities.ts", "unknown: false, released: false, joined: false };", "unknown: false, released: false, joined: true };"],
    ["entities.ts", "    for (const ref of refs) out = withRec(out, ref, (r) => r);", "    for (const ref of refs) out = withRec(out, ref, (r) => ({ ...r, queue: [...r.queue, w.attempt] }));"],
  ] },
  { id: "p1e.later-success-clears", kills: ["P1-E/a-given-up-mark-is-uncertain-until-a-read-asked-after-then-quiet-for-good", "P1-E/a-later-success-demotes-a-given-up-mark-and-does-not-clear-it"], edits: [["entities.ts", "demote({ ...x, marks: x.marks.filter((m) => m.attempt !== e.attempt) }, () => true)", "({ ...x, marks: x.marks.filter((m) => m.attempt !== e.attempt && m.given === null) })"]] },
  { id: "p1e.read-before-give-up-demotes", kills: ["P1-E/a-given-up-mark-is-uncertain-until-a-read-asked-after-then-quiet-for-good"], edits: [["entities.ts", "demote(x, (m) => m.given! <= asked)", "demote(x, () => true)"]] },
  { id: "p1e.read-never-demotes", kills: ["P1-E/a-given-up-mark-is-uncertain-until-a-read-asked-after-then-quiet-for-good"], edits: [["entities.ts", "    (ev.kind === \"read\" || ev.kind === \"repair\") && asked !== undefined", "    ev.kind === \"never\" && asked !== undefined"]] },
  { id: "p1e.disabled-store-fails-open", kills: ["DRV-03/a-disabled-store-holds-its-queue"], edits: [["hooks.ts", "      if (uses(tx, machine, m)) return { on: \"disabled\", module: m.id };\n      continue;", "      continue;"]] },
  { id: "p1e.disabled-store-takes-a-join", kills: ["DRV-03/disabled-survives-a-refused-turn"], edits: [["hooks.ts", "    if (!active(tx, m)) return \"ModuleDisabled\";", "    if (!active(tx, m)) continue;"]] },
  { id: "p1e.failure-forces-repair", kills: ["P1-E/a-postgrest-update-that-matches-no-row-is-a-definite-conflict"], edits: [["entities.ts", "  if (ending.ch === \"failure\") return removeEntry(s, attempt);", "  if (ending.ch === \"failure\") return holdFor(s, e, cx);"]] },
  { id: "p1e.module-throw-unnamed", kills: ["DRV-03/throw-at-settlement"], edits: [["hooks.ts", "    disable(tx, m, name, e, k);\n    return onThrow();", "    return onThrow();"]] },
  { id: "p1e.sent-hold-passed", kills: ["P1-E/a-sent-hold-still-stalls-another-actor-on-its-record"], edits: [["entities.ts", "      if (at > 0) return { on: \"queue\", behind: q.slice(0, at) };", "      if (at > 0 && !s.entries[q[0]!]?.unknown) return { on: \"queue\", behind: q.slice(0, at) };"]] },
  { id: "p1e.omitted-field-confirmed", kills: ["P1-E/a-postgrest-update-response-confirms-what-it-carries"], edits: [["entities.ts", "unconfirmed: [...new Set([...x.unconfirmed, ...held])],", "unconfirmed: x.unconfirmed,"]] },
  { id: "p1e.unknown-forces-no-repair", kills: ["P1-E/a-postgrest-status-0-is-unknown-and-forces-a-repair"], edits: [["entities.ts", "        : { ...r, marks: [...r.marks, markOf(e, ref)] },\n    );\n    out = startRepair(out, ref, e.machine, cx);", "        : { ...r, marks: [...r.marks, markOf(e, ref)] },\n    );"]] },
  { id: "p1e.give-up-asks-nothing", kills: ["P1-E/a-given-up-mark-is-uncertain-until-a-read-asked-after-then-quiet-for-good"], edits: [["entities.ts", "    for (const ref of e.refs) if (recOf(out, ref).marks.some((m) => m.attempt === attempt)) out = startRepair(out, ref, e.machine, cx);\n", ""]] },
];
