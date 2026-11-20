// Audit 3b (narrow re-audit of the audit-3 gap batch, d347f8e3): lies against the rebuilt harness items, and fresh wrong runtimes from the design
// text at the parts the new cases touch (rule 30 as ruled, 2.8.6's queue table, rule 31, proposal 2 §2.2). Same shape as mutants-audit-3.ts; not
// spread into any gate list.
const m = (id: string, kills: readonly string[], edits: ReadonlyArray<readonly [string, string, string]>) => ({ id, kills, edits });
const E = "entities.ts";
const P = "P1-E/";
const FAULT_UNCERTAIN = ["entities.ts", "const uncertain = marks.some((m) => !m.quiet) || r.doubt !== undefined;", "const uncertain = marks.length > 0 || r.doubt !== undefined;"] as const;
export const MUTANTS = [
  // ── Lies: each fakes what a rebuilt check reads.
  // Item 8 (like drain): the drain now reds a missing row, but compares a row's value only when `data.v` is there. With the given-up mark kept
  // uncertain forever, this runtime reports an uncertain record as a settled row with no data.
  m("lie:a3b.like-row-empty", ["LIKE"], [FAULT_UNCERTAIN, [E, "  return { data, predicted, uncertain, unconfirmed };", "  return uncertain ? { predicted: false, uncertain: false, unconfirmed: [] } : { data, predicted, uncertain, unconfirmed };"]]),
  // Item 9 (`checkMints`): a wait accounts for a mint when it queues behind an Attempt the fake saw. Under `latest`, this runtime drops a waiting
  // commit it replaces (no `Superseded`, no ending) and keeps publishing it as queued behind the head that was there.
  m("lie:a3b.mint-ghost-queue", ["P1", "MED", "SURV", "STORE"], [
    ["lane.ts", "    for (const x of l.w) supersede(tx, a.op, x);\n    setLane(tx, { ...tx.w.lanes[l.id]!, w: [made.attempt] });", "    for (const x of l.w) tellEnded(tx, x.id, \"superseded\");\n    tx.w = { ...tx.w, ghosts: [...((tx.w as any).ghosts ?? []), ...l.w.map((x) => ({ id: x.id, mint: x.mint, op: a.op, behind: l.head?.id ?? x.id }))] } as any;\n    setLane(tx, { ...tx.w.lanes[l.id]!, w: [made.attempt] });"],
    ["publish.ts", "for (const r of Object.values(w.reads)) out.push({ kind: \"wire\", op: r.op });", "for (const g of (w as any).ghosts ?? []) out.push({ kind: \"queue\", op: g.op, attempt: g.id, mint: g.mint, behind: [g.behind] });\n  for (const r of Object.values(w.reads)) out.push({ kind: \"wire\", op: r.op });"],
  ]),
  // The same fault without the ghost wait (control: the mint check reaches it).
  m("a3b.ctl-mint-dropped", ["P1", "MED", "SURV", "STORE"], [["lane.ts", "    for (const x of l.w) supersede(tx, a.op, x);\n    setLane(tx, { ...tx.w.lanes[l.id]!, w: [made.attempt] });", "    for (const x of l.w) tellEnded(tx, x.id, \"superseded\");\n    setLane(tx, { ...tx.w.lanes[l.id]!, w: [made.attempt] });"]]),
  // Item 9 (`spare`, and `checkMints`'s business-key branch): both trust a key that starts `business:`. The key is the Attempt id, which the driver
  // passes on from the host's mint. This runtime prefixes every id it mints; no fault beside it, so any red is the suite pinning ids to its mint.
  m("lie:a3b.ids-look-business", ["ANY"], [["driver.ts", "            const id = host.id();", "            const id = `business:${host.id()}`;"]]),
  // Item 9 (keyed cancel): D221, a keyed `cancel(k)` names the lane of exactly that key. Wrong: in an ending it names the ending's own lane. Run
  // alone, to see whether any case has a keyed cancel whose key names another lane (the rebuilt `cancelsWherever` has nothing to read otherwise).
  m("a3b.keyed-cancel-names-the-ending", ["FRAG", "PAY", "R15"], [["turn.ts", "const named = mem.key\n      ? tx.w.lanes[laneKey(w.a.key, mem.op, r.key)]", "const named = mem.key\n      ? (it?.k === \"ending\" && it.op === mem.op && it.attempt ? laneOfAttempt(tx.w, it.attempt) : tx.w.lanes[laneKey(w.a.key, mem.op, r.key)])"]]),
  // Item 10 (`runtimeDisposed` cleared at a kill): `ledgerOff`, which a disposal's `DisposeStart` sets, is not. This runtime drops a held head's
  // restored ending at boot and says nothing: red only where no disposal came before the kill?
  m("lie:a3b.boot-drops-held-after-dispose", ["PAY", "R15", "LIFE"], [["durable.ts", "mail(tx, l, h, ending, true, !h.held);", "if (!h.held) mail(tx, l, h, ending, true, !h.held);"]]),

  // ── Fresh wrong runtimes from the design.
  // 2.8.6, `Released` row: "a release before the repair lands removes nothing, and predictions end with the repair". Wrong: they end at the release.
  m("a3b.release-drops-predictions", [P, "STORE", "LIKE"], [[E, "? { ...out, entries: { ...out.entries, [attempt]: { ...e, released: true } } }", "? { ...out, entries: { ...out.entries, [attempt]: { ...e, released: true, predicted: [] } } }"]]),
  // Rule 30 / 2.8.6: `Released` withdraws a waiting re-send's queue entry; once its repair ends nothing keeps it. Wrong: the released entry stays.
  m("a3b.released-entry-stays", [P, "STORE", "LIKE"], [[E, "if (e.released && !e.refs.some((x) => own(out.repairs, x))) out = removeEntry(out, id);", ""]]),
  // Rule 30 as ruled, per record: an unknown stops holding a record's queue once THAT record's repair settles. Wrong (in `blocks`): any settled record frees all.
  m("a3b.holds-any-record-settled", [P], [[E, "const holds = (x: string) => !s.entries[x]?.settled?.includes(ref);", "const holds = (x: string) => !s.entries[x]?.settled?.length;"]]),
  // Rule 30: "until that repair settles"; a repair asked again (news during it) has not settled. Wrong: it settles at the first answer.
  m("a3b.asked-again-settles", [P, "STORE"], [[E, "const settled = e.released || cur.again || e.settled?.includes(ref) ?", "const settled = e.released || e.settled?.includes(ref) ?"]]),
  // Rule 30 as ruled: the settled hold "retries behind whatever holds the record then". Wrong: behind every entry, settled unknowns included.
  m("a3b.resend-behind-settled", [P, "STORE"], [[E, "[...q.filter((x) => x !== attempt && holds(x)), attempt]", "[...q.filter((x) => x !== attempt), attempt]"]]),
  // 2.8.6, unknown row: predictions "kept until the forced repair lands", per record. Wrong: one record's repair ends the Attempt's predictions on all.
  m("a3b.repair-ends-every-prediction", [P, "STORE"], [[E, "const predicted = e.predicted.filter((p) => p.ref !== ref);", "const predicted: typeof e.predicted = [];"]]),
  // Proposal 2 §2.2: the entity's OWN key fields have no cell. Wrong: the first declared entity's key fields are used for every entity.
  m("a3b.keyed-from-first-entity", [P], [[E, 'keyed: keys[ref.slice(0, ref.indexOf("|"))] ?? []', "keyed: Object.values(keys)[0] ?? []"]]),
  // Rule 31 / the runner's note: a restored Attempt counts as sent once, so its re-send is a re-send (no `GuardContradicted`, its `known` kept).
  // Wrong: restored as never sent.
  m("a3b.restored-counts-unsent", [P, "STORE", "R14", "R15"], [[E, "targets: targetsOf(w, refs, cx), sends: 1, known: {}", "targets: targetsOf(w, refs, cx), sends: 0, known: {}"]]),
];
