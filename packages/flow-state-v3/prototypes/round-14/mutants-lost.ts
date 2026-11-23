// D125: every way an ending can go missing. Each must be named by oracle (j), not only caught by an older oracle or a named case. `j-named.ts` counts which. Review's 26 kinds, and the ones D122-D123 add. Builder-written: not independent.
const m = (id: string, file: string, find: string, replace = "") => ({ id, kills: ["D125"], edits: [[file, find, replace]] as ReadonlyArray<readonly [string, string, string]> });
export const MUTANTS = [
  // An ask in a committed turn.
  m("lost.ask.commit", "turn.ts", `cell(tx, "commit", lane, {
        ...base,
        key: r.key,
        input: r.input,
        subject,
        prepared: r.prepared!,
      });`),
  m("lost.ask.lookup", "turn.ts", "lookup(tx, { ...base, input: r.input, key: r.key, inc: inc.id });"),
  m("lost.ask.lookup-unencodable", "turn.ts", "lookupUnencodable(tx, { ...base, inc: inc.id, input: r.input, key: r.key });", "void 0;"),
  // A keep.
  m("lost.keep.whole", "turn.ts", "if (!ran && item.redelivered) keepEnding(tx, a, item);"),
  m("lost.keep.quiet", "turn.ts", `parkEnding(tx, item, base, item.subject ?? lane?.subject ?? [], a.machine, true);`),
  m("lost.keep.read-strand", "turn.ts", `    note(tx, "kept", said);
    return strand(tx, item.actor, item.inc, item.op);`, `    note(tx, "kept", said);
    return;`),
  m("lost.keep.firing", "turn.ts", "tx.w = { ...tx.w, keptFires: [...tx.w.keptFires, item] };", "void 0;"),
  m("lost.keep.stream", "turn.ts", "strand(tx, item.actor, item.inc, item.event.tag); // D123", "void 0;"),
  m("lost.keep.re-keep", "turn.ts", "note(tx, \"kept\", { ...said, onLane: !item.kept });", "if (item.kept) return; note(tx, \"kept\", { ...said, onLane: !item.kept });"),
  // A keep gone while some other wait of the kind exists: the review's zero.
  m("lost.keep.beside-another-wait", "turn.ts", "const base = !item.attempt && lane ? { ...lane, parked: lane.parked.filter((p) => p.attempt || !p.kept) } : lane;", "if (lane && Object.values(tx.w.lanes).some((l) => l.parked.length > 0 || l.head?.phase.t === \"held\")) return; const base = !item.attempt && lane ? { ...lane, parked: lane.parked.filter((p) => p.attempt || !p.kept) } : lane;"),
  // A second try.
  m("lost.try.ending", "turn.ts", "enqueue(tx, { ...rest, redelivered: true });", "void rest;"),
  m("lost.try.firing", "turn.ts", `if (item.k === "fire" && !again) enqueue(tx, { ...item, redelivered: true });`),
  m("lost.try.stream", "turn.ts", "if (!ran && item.ending && !item.redelivered) enqueue(tx, { ...item, redelivered: true }); // D50"),
  // A settled write's, a read's.
  m("lost.settled", "lane.ts", "  settleHead(tx, next, final);", "  setLane(tx, next);"),
  m("lost.read-answer", "step.ts", `    return enqueue(tx, {
      k: "ending",
      actor: r.actor,
      op: r.op,
      key: r.key,
      owner: r.owner,
      ending: e,
      input: r.input,
      attempt: i.attempt,
      inc: r.inc,
    });`, "    return;"),
  // At a boot.
  m("lost.boot.head", "durable.ts", "mail(tx, l, h, ending, true);"),
  m("lost.boot.parked", "durable.ts", `note(tx, "unparked", { op: l.op, attempt: p.attempt ?? "" });
      mail(tx, l, p, p.ending, false);`),
  m("lost.boot.second-parked", "durable.ts", `for (const p of l.parked ?? []) {
      note(tx, "unparked", { op: l.op, attempt: p.attempt ?? "" });`, `for (const p of (l.parked ?? []).slice(0, 1)) {
      note(tx, "unparked", { op: l.op, attempt: p.attempt ?? "" });`),
  m("lost.boot.w", "durable.ts", "else mail(tx, l, a, e, false);"),
  // Adoption and thaw.
  m("lost.adopt.parked", "turn.ts", `note(tx, "unparked", { op: l.op, attempt: p.attempt ?? "" });
      out.push({`, `note(tx, "unparked", { op: l.op, attempt: p.attempt ?? "" });
      void ({`),
  m("lost.adopt.hold", "turn.ts", "return [...out, ...holds];", "return out;"),
  m("lost.thaw.parked", "turn.ts", "const follows: Mail[] = [...(frozen?.parked ?? [])];", "const follows: Mail[] = [];"),
  m("lost.freeze.parked", "turn.ts", "frozen: { timers: [...timers, ...queued], parked },", "frozen: { timers: [...timers, ...queued], parked: [] },"),
  m("lost.freeze.queued-read", "turn.ts", `queuedReads.push({ ...m, ending: { ch: "failure", tag: "Interrupted", value: {} } });`),
  // A decline.
  m("lost.decline.mail", "lane.ts", `  noteEnding(tx, { op: a.op }, e);
  enqueue(tx, {`, `  noteEnding(tx, { op: a.op }, e);
  void ({`),
  m("lost.decline.admission", "turn.ts", "if (!path) return parkEnding(tx, item, lane, subject, a.machine);", "if (!path && !item.attempt) return; if (!path) return parkEnding(tx, item, lane, subject, a.machine);"),
  // No actor, no incarnation.
  m("lost.dead-actor", "turn.ts", "if (keep) return parkEnding(tx, item, lane, subject, machine);", "if (keep) return;"),
  m("lost.unplaced", "turn.ts", "if (!path) return parkEnding(tx, item, lane, subject, a.machine);", "if (!path) return;"),
  m("lost.letgo-silent", "lane.ts", `for (const p of l.parked) if (p.kept) note(tx, "KeptLetGo", { op: l.op, attempt: p.attempt ?? "" });`),
];
