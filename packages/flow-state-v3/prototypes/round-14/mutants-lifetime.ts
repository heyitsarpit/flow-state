// Rule 73's wrong runtimes (OD31): each breaks one clause of rule 73 or 2.7.17, and some LIFE case must go red on it by a named oracle.
// Same shape as mutate.ts's lists; run by ../conformance/lifetime-falsify.ts, which also lists any LIFE case no mutant turns red.
import { MUTANTS as MISC } from "./mutants-lifetime-misc.ts";
import { MUTANTS as PAY16 } from "./mutants-lifetime-pay16.ts";
import { MUTANTS as PINS_A } from "./mutants-lifetime-pins-a.ts";
import { MUTANTS as PINS_B } from "./mutants-lifetime-pins-b.ts";
import { MUTANTS as R15 } from "./mutants-r15.ts";
import { MUTANTS as R15B } from "./mutants-r15b.ts";
import { MUTANTS as R15C } from "./mutants-r15c.ts";
import { MUTANTS as R15D } from "./mutants-r15d.ts";
import { MUTANTS as P1H } from "./mutants-p1h.ts";
import { MUTANTS as P1E } from "./mutants-p1e.ts";
import { MUTANTS as A1 } from "./mutants-a1.ts";
import { MUTANTS as A2 } from "./mutants-a2.ts";
import { MUTANTS as A3 } from "./mutants-a3.ts";
const m = (id: string, kills: string, file: string, find: string, replace = "") => ({ id, kills: [kills], edits: [[file, find, replace]] as ReadonlyArray<readonly [string, string, string]> });
const WRITE = 'if (l.actor === key && l.head !== undefined && l.head.phase.t !== "held") out.push(`write:${l.op}`);';
const READ = "for (const id in w.reads) if (w.reads[id]!.actor === key && w.reads[id]!.kept) out.push(`read:${w.reads[id]!.op}`);";
export const MUTANTS = [
  // Work in flight (rule 73's list), and what keeps nothing.
  m("life.inflight-keeps-nothing", "LIFE-01", "step.ts", WRITE, ""),
  m("life.held-keeps", "LIFE-06", "step.ts", WRITE, "if (l.actor === key && l.head !== undefined) out.push(`write:${l.op}`);"),
  m("life.kept-read-keeps-nothing", "LIFE-11", "step.ts", READ, ""),
  m("life.every-read-keeps", "LIFE-13", "reads.ts", "...(tx.keeps ? { kept: true as const } : {})", "kept: true as const"),
  m("life.mail-is-work", "LIFE-08", "step.ts", "if (!free) {", "if (!free || hasMail(tx.w, key)) {"),
  m("life.uses-not-counted", "LIFE-04/one-of-two-uses-ending-keeps-it", "step.ts", "setUses(tx, key, [...(tx.w.uses[key] ?? []), owner]);", "setUses(tx, key, [owner]);"),
  m("life.ensure-is-a-use", "LIFE-24/a-host-ensure-alone-keeps-nothing", "step.ts", "setUses(tx, key, []); // rule 73", 'setUses(tx, key, ["host"]); // rule 73'),
  m("life.no-pending-use", "LIFE-24/subscribe-then-ensure-keeps", "step.ts", "if (usesOf(tx.w, key) === 0) setUses(tx, key, undefined);", "setUses(tx, key, undefined);"),
  // Schedules wait (C124).
  m("life.schedule-fires-unused", "LIFE-14", "step.ts", "if (counted(tx, t.actor) && usesOf(tx.w, t.actor) === 0) {", "if (false) {"),
  m("life.waiting-never-wakes", "LIFE-14/a-use-back-in-the-grace-fires-it-once", "step.ts", "if (was === 0 && getActor(tx.w.actors, key)) wake(tx, key);", ""),
  m("life.waiting-survives-re-arm", "LIFE-14/a-re-armed-debounce-drops-the-waiting-deadline", "timers.ts", "const dropWaiting = (tx: Tx, key: string) => {", "const dropWaiting = (tx: Tx, key: string) => { return;"),
  m("life.waiting-lost-at-end", "LIFE-14/persisted-it-fires-once-at-the-next-ensure", "step.ts", "const timers = [...armed, ...waiting,", "const timers = [...armed,"),
  // The grace.
  m("life.no-grace", "LIFE-04/an-ensure-within-the-grace-keeps-the-incarnation-and-past-it-ends", "step.ts", "const dueAt = tx.env.now + tx.bounds.graceMs;", "const dueAt = tx.env.now;"),
  m("life.grace-never-ends", "LIFE-02/free-with-no-uses-is-gone-after-the-grace", "step.ts", "if (usesOf(tx.w, key) !== 0 || !getActor(tx.w.actors, key) || busy(tx.w, key)) return;", "return;"),
  m("life.grace-unfenced", "LIFE-16", "step.ts", "const gen = `${dueAt}`;", 'const gen = "grace";'),
  // The end and the record.
  m("life.end-drops-record", "LIFE-12", "step.ts", 'const keep = m.persisted && how === "end";', "const keep = false;"),
  m("life.dispose-keeps-record", "LIFE-23/disposed-is-no-record", "step.ts", 'const keep = m.persisted && how === "end";', "const keep = m.persisted;"),
  m("life.end-ignores-codec", "LIFE-22", "step.ts", "if (tx.machines[a.machine]!.persisted && !encodes(tx, a)) {", "if (false) {"),
  m("life.restored-once-per-runtime", "LIFE-17", "step.ts", "const adopted = bootMail ? bootMail : rebindActor(tx, fresh);", "const adopted = bootMail ? bootMail : [];"),
  // Sends (C105).
  m("life.send-no-restore", "LIFE-03", "step.ts", 'returnActor(tx, key, "send");', ""),
  m("life.send-absent-silent", "LIFE-09", "step.ts", "issue(tx, { code: \"SendTargetAbsent\", origin: `send ${key}`, input: { reason } });", ""),
  m("life.undecodable-is-no-record", "LIFE-23/undecodable-then-an-ensure-discards-it", "step.ts", 'const reason = tx.w.undecodable[key] ? "RecordUndecodable" : "NoRecord";', 'const reason = "NoRecord";'),
  // Ready (C106).
  m("life.ready-all-live", "LIFE-18/a-plain-record-stays-a-record", "step.ts", "if (!shared(tx, a.machine) || owedTo.has(a.key)) continue;", "continue;"),
  m("life.ready-owed-sleeps", "LIFE-18/owed-an-ending-it-is-woken", "step.ts", "if (!shared(tx, a.machine) || owedTo.has(a.key)) continue;", "if (!shared(tx, a.machine)) continue;"),
  // Local actors, reads, diagnostics.
  m("life.no-remount", "LIFE-27/a-remount-while-kept-adopts-the-ending", "step.ts", "if (!a || !tx.machines[a.machine]!.local || usesOf(tx.w, key) !== 0 || !busy(tx.w, key)) return;", "return;"),
  m("life.handle-not-identity", "LIFE-21/persisted-reads-its-record", "adapter.ts", "const live = getActor(w.actors, actor) ?? w.retired[actor];", "const live = getActor(w.actors, actor);"),
  m("life.no-ended-with-work", "LIFE-29", "step.ts", 'note(tx, "EndedWithWork",', 'void (tx, "EndedWithWork",'),
  m("life.no-soon-note", "LIFE-30", "step.ts", "if (tx.env.now < soon.dueAt) note(", "if (false) note("),
  // Identity (rule 74, OD30), area 2.
  m("id.record-without-fields", "R14-ID-02/a-field-added-is-a-new-version", "step.ts", "...(identity ? { fields: [...identity].sort() } : {})", ""),
  m("id.old-version-restored", "R14-ID-02/a-field-added-is-a-new-version", "durable.ts", "if (Array.isArray(v.fields) && !sameVersion(v.fields, now, older))", "if (false && Array.isArray(v.fields) && !sameVersion(v.fields, now, older))"),
  m("id.version-by-names-only", "R14-ID-02/an-encoded-side-change-is-a-new-version", "durable.ts", "!sameVersion(v.fields, now, older)", "!sameVersion(v.fields.map((f: string) => f.split(\":\")[0]!), now.map((f) => f.split(\":\")[0]!))"),
  m("id.dispose-drops-lanes", "FRAG-08/rebind-delivers-a-hold-once", "step.ts", 'if (m.local && how !== "remount")', 'if (how !== "remount")'),
  // Flow.ignore (OD28, 2.7.18), area 3.
  m("ign.runs-a-turn", "R14-IGN-01", "turn.ts", "if (mm && mappedFor(mm, item)?.ignore) {", "if (false) {"),
  m("ign.unknown-held", "R14-IGN-01/an-unknown-is-released", "turn.ts", 'if (item.ending.ch === "unknown" && cur?.head?.phase.t === "held" && cur.head.id === item.attempt) cell(tx, "cancel", cur, argsOf(cur));', ""),
  m("ign.parked-without-incarnation", "R14-IGN-01/with-no-incarnation-it-is-applied-not-parked", "turn.ts", "if (mm && mappedFor(mm, item)?.ignore) {", "if (mm && getActor(tx.w.actors, item.actor) && mappedFor(mm, item)?.ignore) {"),
  m("d5.remount-in-grace-is-fresh", "LIFE-27/a-remount-within-the-grace-reuses-the-actor", "step.ts", "usesOf(tx.w, key) !== 0 || !busy(tx.w, key)) return;", "usesOf(tx.w, key) !== 0) return;"),
  m("d6.disposed-ending-is-evidence", "LIFE-23/after-dispose-an-ending-waits-on-its-lane-and-an-ensure-adopts-it", "turn.ts", "(own(tx.w.retired, item.actor) !== undefined || tx.machines[machine]?.persisted);", "own(tx.w.retired, item.actor) !== undefined;"),
  m("d7.undecodable-reads-pre-attach", "LIFE-23/undecodable-then-an-ensure-discards-it", "adapter.ts", 'if (w.undecodable[actor]) return { lifecycle: "quarantined", issue: "RecordUndecodable" };', ""),
  m("d1.stopped-read-lost", "LIFE-13/a-stopped-read-is-heard-after-a-reload", "step.ts", "if (kept && cutReads.length)", "if (false && kept && cutReads.length)"),
  // F (OD29), area 4.
  m("f.absent-is-placed", "R14-F-01/not-placed-while-absent-so-a-post-goes-nowhere", "inc.ts", "if (p.resetOn && absentReset(p, { memory: viewOf(cur), event: {} })) continue;", ""),
  m("f.filling-has-no-key", "R14-F-01/present-it-is-placed-with-key", "inc.ts", "(present?.ok ? { ...hv, key: present.v } : hv)", "hv"),
  m("f.absent-does-not-end", "R14-F-01/a-none-a-adopts-as-save", "turn.ts", "if (p.each || now === undefined) continue;", "if (p.each) continue;"),
  m("id.value-is-not-the-input", "R14-ID-01/a-value-names-the-actor-and-is-its-input", "step.ts", "memory: run(m.memory.initial, input as never),", "memory: run(m.memory.initial, (identity ? {} : input) as never),"),
  // Fix pass after the final review (H-A): Runtime O6 lets an invoked commit settle within the disposal bound.
  m("o6.dispose-interrupts-wire", "PAY-16/on-the-wire-at-the-bound-ends-unknown-disposed", "lane.ts", "disposeWire() {},", 'disposeWire(tx, l) { const h = l!.head!; if (h.phase.t === "wire") tx.commands.push({ k: "interrupt", attempt: h.id, send: h.phase.gen }); },'),
  m("o6.settled-in-bound-stays-held", "REV5-M1/the-record-goes-once-delivered", "lane.ts", '  if (e.ch !== "unknown") return setLane(tx, parkWaiting(tx, { ...rest, parked: [...lane.parked, own] }));', '  if (e.ch === "parked") return setLane(tx, parkWaiting(tx, { ...rest, parked: [...lane.parked, own] }));'),
  m("o6.no-bound", "PAY-16/disposal-ends-with-the-last-fiber", "step.ts", "if (wires(tx.w).length === 0) finishDisposal(tx);", "if (true) finishDisposal(tx);"),
  // fragstore.row: what a boot queues for a record kept at ready is said, waited on, and kept by a dispose (D6).
  { id: "boot.mail-unsaid", kills: ["R14-FIX-01/a-held-record-at-ready-names-what-it-is-owed"], edits: [
    ["step.ts", 'for (const m of bootMail) if (m.k === "ending") note(tx, "parked", { op: m.op, attempt: m.attempt ?? "", record: true });', ""],
    ["step.ts", 'for (const m of bootMail ?? []) if (m.k === "ending") note(tx, "unparked", { op: m.op, attempt: m.attempt ?? "", record: true });', ""],
  ] as ReadonlyArray<readonly [string, string, string]> },
  m("m5.return-from-ready-writes", "R14-FIX-01/a-return-from-ready-writes-nothing", "step.ts", "if (!fromBoot) tx.touchedActors.add(key);", "tx.touchedActors.add(key);"),
  m("l1.version-by-printed-name", "R14-ID-02/an-encoded-side-change-is-a-new-version", "../conformance/compile/ref.ts", "identityEntries(fields, names).map(([n, s]) => versioned(n, s));", "identityEntries(fields, names).map(([n]) => n);"),
  m("d3.return-keeps-old-id", "R14-FIX-03", "step.ts", "const inc = fromBoot ? old : nextGen(tx);", "const inc = old;"),
  m("d1.woken-drops-stopped", "LIFE-13/a-stopped-read-is-heard-when-woken-at-ready", "step.ts", "for (const m of stoppedEndings(tx, key, stopped, rec.root.id, rec.root.id)) enqueue(tx, m);", ""),
  m("d1.reload-drops-stopped", "LIFE-13/a-stopped-read-is-heard-after-a-reload", "durable.ts", "...(stopped.value ? { stopped: stopped.value } : {})", ""),
  m("m4.held-w-owed", "R14-FIX-02", "durable.ts", "else mail(tx, l, a, e, false, !h.held);", "else mail(tx, l, a, e, false);"),
  m("boot.mail-lost-at-dispose", "R14-FIX-01/a-dispose-of-a-record-at-ready-parks-what-the-boot-queued", "step.ts", "setLane(tx, { ...l, parked: [...l.parked, { ...(m.attempt ? { attempt: m.attempt } : {}), ending: m.ending, owner: m.owner, input: m.input }] });", ""),
  ...PAY16,
  ...PINS_A,
  ...PINS_B,
  ...MISC,
  ...R15,
  ...R15B,
  ...R15C,
  ...R15D,
  ...P1H,
  ...P1E,
  ...A1,
  ...A2,
  ...A3,
];
