export const MUTANTS: ReadonlyArray<{ readonly id: string; readonly kills: readonly string[]; readonly edits: ReadonlyArray<readonly [string, string, string]> }> = [
  { id: "pay16.restore-forgets-may-have-applied", kills: ["PAY-16"], edits: [["durable.ts", "return { ...rest, phase, mayHaveApplied, sentAt: 0 };", "return { ...rest, phase, mayHaveApplied: false, sentAt: 0 };"]] },
  { id: "pay16.resend-no-timeout", kills: ["PAY-16"], edits: [["lane.ts", "if (op.timeoutMs !== undefined)", "if (op.timeoutMs !== undefined && !h.mayHaveApplied)"]] },
  { id: "pay16.refused-capture-spends-budget", kills: ["PAY-16"], edits: [["lane.ts", "    settleHead(tx, l!, e);\n  },\n  resolve(tx, l) {", "    settleHead(tx, { ...l!, head: { ...h, retryCount: h.retryCount + 1 } }, e);\n  },\n  resolve(tx, l) {"]] },
  { id: "pay16.decline-not-delivered", kills: ["PAY-16"], edits: [["lane.ts", "noteEnding(tx, { op: a.op }, e);\n  enqueue(tx, {", "noteEnding(tx, { op: a.op }, e);\n  void (tx, {"]] },
  { id: "pay16.restore-drops-retry-count", kills: ["PAY-16"], edits: [["durable.ts", "return { ...rest, phase, mayHaveApplied, sentAt: 0 };", "return { ...rest, retryCount: 0, phase, mayHaveApplied, sentAt: 0 };"]] },
  { id: "pay16.stale-send-settles", kills: ["PAY-16"], edits: [["step.ts", "if (lane && p?.t === \"wire\" && p.gen === i.send) {", "if (lane && p?.t === \"wire\") {"]] },
  { id: "pay16.disposed-resend-declares-disposed", kills: ["PAY-16"], edits: [["lane.ts", "  disposeResend(tx, l) {\n    setLane(tx, parkWaiting(tx, { ...l!, head: { ...l!.head!, phase: { t: \"held\" } } }));\n  },", "  disposeResend(tx, l, a) {\n    ACTIONS.disposeNeverSent(tx, l, a);\n  },"]] },
  { id: "pay16.parked-ending-becomes-restored", kills: ["PAY-16"], edits: [["durable.ts", "mail(tx, l, p, p.ending, false);", "mail(tx, l, p, { ch: \"unknown\", reason: \"Restored\" }, false);"]] },
  { id: "pay16.schedule-reads-pre-transition-memory", kills: ["PAY-16"], edits: [["turn.ts", "const inc = kidAt(w.root, p)!;", "const inc = kidAt(w.root0, p) ?? kidAt(w.root, p)!;"]] },
  { id: "pay16.resend-inherits-cancel", kills: ["PAY-16"], edits: [["lane.ts", "phase: { t: \"wire\", gen, cancelled: false },", "phase: { t: \"wire\", gen, cancelled: h.mayHaveApplied },"]] },
  { id: "pay16.read-defect-not-an-issue", kills: ["PAY-16"], edits: [["step.ts", "    if (i.exit.t === \"defect\") issue(tx, { code: \"Defect\", origin: `${r.actor} ${r.op}`, cause: causeOf(i.exit.cause) });", ""]] },
  { id: "pay16.superseded-read-keeps-older", kills: ["PAY-16"], edits: [["reads.ts", "    note(tx, \"Superseded\", { op: a.op, attempt: key, send: old.gen });\n    tx.commands.push({ k: \"interrupt\", attempt: key, send: old.gen });", "    note(tx, \"Superseded\", { op: a.op, attempt: key, send: old.gen });"]] },
];
