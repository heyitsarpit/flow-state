// Audit 3 (re-audit of entities and rounds 14-15b after the gap batch, b0360416..3ce7da6c): wrong runtimes written by an independent auditor from
// the design text for what changed since audits 2 and 1b: the runner's rule 30 ruling (a record's queue is released once the unknown's forced repair
// settles; the held write keeps its own lane hold and retries behind whatever holds the record then), rule 35's `many` bound, key fields without a
// cell, `coveredBy` over-marking, and rule 14 re-entry. Each comment names the rule broken. `lie:` ids fake the evidence an excuse reads. Same shape
// as mutants-audit-2.ts; not spread into any gate list.
const m = (id: string, kills: readonly string[], edits: ReadonlyArray<readonly [string, string, string]>, unscored?: string) => ({ id, kills, edits, ...(unscored ? { unscored } : {}) });
const E = "entities.ts";
const P = "P1-E/";
export const MUTANTS = [
  // ── Rule 30 as ruled: "holds the record queue until that repair settles".
  // Wrong: an unknown never holds its record queue (settled the moment it is held).
  m("a3.r30-free-at-unknown", [`${P}a-sent-hold-releases-its-record-when-its-repair-settles`, "STORE"], [[E, "[e.attempt]: { ...e, unknown: true } } };", "[e.attempt]: { ...e, unknown: true, settled: e.refs } } };"]]),
  // Wrong: a failed repair settles (the queue moves on a failure, then the repair asks again).
  m("a3.r30-failed-repair-settles", ["STORE-07/a-live-hold-outranks-three-failed-repairs"], [[E, "return endRepair({ ...s, repairs: { ...s.repairs, [a.ref]: { ...cur, again: true } } }, a.ref, cx);", "return startRepair(endRepair(s, a.ref, cx), a.ref, cur.machine, cx);"]]),
  // Wrong: `RepairOverdue` settles the repair (an overdue doubt frees the queue).
  m("a3.r30-overdue-settles", ["STORE-07/a-live-hold-outranks-three-failed-repairs"], [[E, "return withRec(s, ref, (r) => ({ ...r, asks: 0 }));", "{ let o = withRec(s, ref, (r) => ({ ...r, asks: 0 })); for (const id of recOf(s, ref).queue) { const en = o.entries[id]; if (en?.unknown && !en.settled?.includes(ref)) o = { ...o, entries: { ...o.entries, [id]: { ...en, settled: [...(en.settled ?? []), ref] } } }; } return o; }"]]),
  // Per record ("holds the record queue until that repair settles": each record's own repair). Wrong: one record's settled repair frees all of them.
  m("a3.r30-settle-every-record", [P], [[E, "[...(e.settled ?? []), ref]", "[...new Set([...(e.settled ?? []), ...e.refs])]"]]),
  // "Retries behind whatever holds the record then". Wrong: the settled hold's re-send keeps its old place at the queue's head.
  m("a3.r30-resend-keeps-place", [`${P}a-sent-hold-releases-its-record-when-its-repair-settles`], [[E, "const live = e.settled?.includes(ref) ? [...q.filter((x) => x !== attempt && holds(x)), attempt] : q.filter((x) => x === attempt || holds(x));", "const live = q.filter((x) => x === attempt || holds(x));"]]),
  // A re-sent unknown is on the wire again and holds its records until its own next forced repair settles. Wrong: a second re-send holds nothing.
  m("a3.r30-resend-no-rehold", ["STORE"], [[E, "const { settled: _free, ...again } = e;\n      return { s: { ...s, entries: { ...s.entries, [attempt]: again } }, basedOn };", "return { s, basedOn };"]]),
  // Same, for the first re-send (sends 0 or 1: a restored Attempt counts as sent once). Wrong: it keeps its settled records.
  m("a3.r30-first-resend-no-rehold", ["STORE", "R14", "R15", P], [[E, "const { settled: _free, ...held } = e;", "const held = e;"]]),
  // Rule 30 / 2.8.5 for a restored unknown (rule 44's `unknown { Restored }`): its forced repair runs at boot, and it holds the record until that
  // repair settles. Wrong: restored as already settled.
  m("a3.r30-restored-holds-nothing", ["STORE", "R14", "R15", P], [[E, "unknown: true, released: false, joined: true, sent: true, basedOn,", "unknown: true, released: false, joined: true, sent: true, basedOn, settled: refs,"]]),

  // ── Rule 35: "a `many` key array past 4,096 items ... ends NotSent { Overloaded }".
  // Wrong: 4,096 itself is declined.
  m("a3.many-at-4096", ["P1-E-CAP"], [[E, "Array.isArray(keys) && keys.length > MANY_MAX", "Array.isArray(keys) && keys.length >= MANY_MAX"]]),
  // "Items": the array's length. Wrong: distinct keys are counted, so 4,097 items with a repeat are sent.
  m("a3.many-distinct-keys", [`${P}audit-the-many-bound-is-4096-and-the-cap-is-past-64`], [[E, "Array.isArray(keys) && keys.length > MANY_MAX", "Array.isArray(keys) && new Set(keys.map((k) => JSON.stringify(k))).size > MANY_MAX"]]),

  // ── Key fields have no cell (entity-proposal-2 2.2): the entity's own key fields, whatever their names. Wrong: `id` is assumed to be the key.
  m("a3.key-field-is-id", [P], [[E, "Object.keys(r.base).filter((f) => !r.keyed?.includes(f))", 'Object.keys(r.base).filter((f) => f !== "id")']]),

  // ── Q3 A over-marking: a record that may be in the cover is marked behind. Each disjunct of "may be in" removed.
  // Wrong: a queued write that predicts the record into the cover is not counted.
  m("a3.cover-ignores-prediction", [P], [[E, "(shown !== undefined && eq(t.field, shown[t.field], want)) ||", ""]]),
  // Wrong: a record in doubt (a landed write that carried nothing) is not counted.
  m("a3.cover-ignores-doubt", [P], [[E, "r.doubt !== undefined || r.unconfirmed.includes(t.field) ||", "r.unconfirmed.includes(t.field) ||"]]),
  // Wrong: a filter field already `unconfirmed` is not counted.
  m("a3.cover-ignores-unconfirmed", [P], [[E, "r.doubt !== undefined || r.unconfirmed.includes(t.field) ||", "r.doubt !== undefined ||"]]),
  // Wrong: a mark on the filter field is not counted (audit 2's case, as a control).
  m("a3.cover-ignores-marks", [`${P}audit-a-gap-marks-a-record-that-may-have-moved-into-the-cover`], [[E, "r.marks.some((m) => m.fields.includes(t.field))", "false"]]),

  // ── Rule 14 (OD49): re-entering an active node is a new activation, whatever the target's kind.
  // Wrong: only a history target makes a new activation; an explicit target re-entered keeps the old one (entry actions still run).
  m("a3.r14-explicit-reentry-keeps-activation", ["R15-01", "R14-FIX-01", "FRAG", "LATE"], [["turn.ts", "for (const n of enters) activations[n] = nextGen(w.tx);", "for (const n of enters) activations[n] = mv.history || inc.activations[n] === undefined ? nextGen(w.tx) : inc.activations[n];"]]),
  // "The common ancestor is its parent": only the target is re-entered. Wrong: the target's parent is re-entered too (a new activation above it).
  m("a3.r14-reenters-the-parent", ["R15-01", "R14-FIX-01", "FRAG", "LATE"], [["turn.ts", "const stay = up(frag, target).slice(1);", "const stay = up(frag, target).slice(2);"]]),

  // ── Lies: one per excuse an oracle still builds on the runtime's word.
  // like.search.ts `settled` skips a record the runtime reports absent (`if (row === undefined) continue`). This runtime keeps a given-up mark
  // uncertain after its read (falsify's `drain.uncertain-forever`, red by "drain: r" alone) and reports a row absent whenever it is uncertain.
  m("lie:a3.like-row-hidden", ["LIKE"], [
    [E, "const uncertain = marks.some((m) => !m.quiet) || r.doubt !== undefined;", "const uncertain = marks.length > 0 || r.doubt !== undefined;"],
    [E, "if (r.base === undefined && !predicted && !uncertain && r.queue.length === 0) return undefined;", "if ((r.base === undefined && !predicted && !uncertain && r.queue.length === 0) || uncertain) return undefined;"],
  ]),
  // drive.ts: `runtimeDisposed` is set by the suite's dispose and never cleared at a reload, so a later process's `DisposeStart` turns the ledger off.
  // This runtime drops a held head's restored ending at boot and says `DisposeStart` instead.
  m("lie:a3.boot-says-disposed", ["PAY", "LIFE", "R15", "R14"], [["durable.ts", "mail(tx, l, h, ending, true, !h.held);", 'if (h.held) note(tx, "DisposeStart", {}); else mail(tx, l, h, ending, true, !h.held);']]),
  // The fault alone, to show the drain oracle reaches it (falsify's own wrong runtime).
  m("a3.ctl-uncertain-forever", ["LIKE"], [[E, "const uncertain = marks.some((m) => !m.quiet) || r.doubt !== undefined;", "const uncertain = marks.length > 0 || r.doubt !== undefined;"]]),
];
