export const MUTANTS: ReadonlyArray<{ readonly id: string; readonly kills: readonly string[]; readonly edits: ReadonlyArray<readonly [string, string, string]> }> = [
  { id: "r15b.keyless-success-names-key-lane", kills: ["R15-02/a-key-less-cancel-in-a-keyed-success-handler-does-nothing"], edits: [["turn.ts", "? laneOfAttempt(tx.w, it.attempt) // D22: key-less names the ending's own Attempt only", "? tx.w.lanes[laneKey(w.a.key, mem.op, it.key)]"]] },
  { id: "r15b.keyless-notsent-acts-live-lane", kills: ["R15-02/a-key-less-cancel-in-a-not-sent-handler-does-nothing"], edits: [["turn.ts", 'if (it?.k === "ending") continue;', 'if (it?.k === "ending") { const live = Object.values(tx.w.lanes).find((l) => l.actor === w.a.key && l.op === mem.op && sameSubject(l.subject, subject)); if (live) cell(tx, mem.verb, live, { ...base, key: live.key }); continue; }']] },
  {
    id: "r15b.reload-head-before-w",
    kills: ["R15-02/on-a-reload-each-queued-commit-is-heard-before-the-held-head"],
    edits: [
      [
        "durable.ts",
        `    for (const a of l.w) {
      const e: Ending = { ch: "failure", tag: "NotSent", value: { why: "Restored" } };
      noteEnding(tx, { op: l.op, attempt: a.id }, e);
      if (l.releasing) note(tx, "evidenceOnly", { op: l.op, attempt: a.id });
      else mail(tx, l, a, e, false, !h.held); // rule 73 as merged: a Held lane, with or without waiting commits, keeps nothing (M4)
    }
    const ownParked = parked.some((p) => p.attempt === h.id);
    const ending: Ending = { ch: "unknown", reason: "Restored" }; // D96
    if (ownParked) {
      // Delivered from the parked list. A hold stays a hold: rule 17, and a new write beside it would be a second charge.
      if (h.held) {
        setLane(tx, { ...base, head: revive(h, { t: "held" }, true), subject: l.subject ?? [] });
        restoredHook(tx, l, h, parked.find((p) => p.attempt === h.id)!.ending);
      } else deleteOnly(tx, l.id, l.actor);
    } else {
      noteEnding(tx, { op: l.op, attempt: h.id }, ending);
      const phase: Phase = h.held ? { t: "held" } : { t: "settled", ending };
      const head = revive(h, phase, true);
      const lane: Lane = { ...base, head, subject: l.subject ?? [] };
      if (l.releasing) {
        // 2.9.3: applied, then Released evidence; nothing delivered or parked.
        note(tx, "evidenceOnly", { op: l.op, attempt: h.id });
        note(tx, "Released", { op: l.op, attempt: h.id });
        deleteOnly(tx, l.id, l.actor);
      } else {
        setLane(tx, lane);
        restoredHook(tx, l, h, ending);
        mail(tx, l, h, ending, true, !h.held);
      }
    }`,
        `    const ownParked = parked.some((p) => p.attempt === h.id);
    const ending: Ending = { ch: "unknown", reason: "Restored" }; // D96
    if (ownParked) {
      if (h.held) {
        setLane(tx, { ...base, head: revive(h, { t: "held" }, true), subject: l.subject ?? [] });
        restoredHook(tx, l, h, parked.find((p) => p.attempt === h.id)!.ending);
      } else deleteOnly(tx, l.id, l.actor);
    } else {
      noteEnding(tx, { op: l.op, attempt: h.id }, ending);
      const phase: Phase = h.held ? { t: "held" } : { t: "settled", ending };
      const head = revive(h, phase, true);
      const lane: Lane = { ...base, head, subject: l.subject ?? [] };
      if (l.releasing) {
        note(tx, "evidenceOnly", { op: l.op, attempt: h.id });
        note(tx, "Released", { op: l.op, attempt: h.id });
        deleteOnly(tx, l.id, l.actor);
      } else {
        setLane(tx, lane);
        restoredHook(tx, l, h, ending);
        mail(tx, l, h, ending, true, !h.held);
      }
    }
    for (const a of l.w) {
      const e: Ending = { ch: "failure", tag: "NotSent", value: { why: "Restored" } };
      noteEnding(tx, { op: l.op, attempt: a.id }, e);
      if (l.releasing) note(tx, "evidenceOnly", { op: l.op, attempt: a.id });
      else mail(tx, l, a, e, false, !h.held);
    }`,
      ],
    ],
  },
];
