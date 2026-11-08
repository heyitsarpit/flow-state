export const MUTANTS: ReadonlyArray<{ readonly id: string; readonly kills: readonly string[]; readonly edits: ReadonlyArray<readonly [string, string, string]> }> = [
  { id: "r15.late-cancel-keeps-promoted-head", kills: ["R15-01/a-late-exit-that-cancels-the-lane-may-leave-its-promoted-head"], edits: [["turn.ts", "!(cancels(l.op) && h.sentAt === 0 && !h.mayHaveApplied) && ", ""]] },
  { id: "r15.late-promoted-head-not-live", kills: ["R15-01/a-late-exit-that-does-not-cancel-may-not-leave-its-promoted-head"], edits: [["turn.ts", 'return h !== undefined && h.phase.t !== "held" && !(cancels', 'return h !== undefined && h.phase.t === "wire" && !(cancels']] },
];
