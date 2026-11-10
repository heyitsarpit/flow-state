import type { Mutant } from "../dsl/oracle.ts";

const RESTORED_MAIL = "mail(tx, l, h, ending, true, !h.held);";

/**
 * Wrong runtimes the disposal oracle must catch.
 *
 * **Details**
 *
 * - `lie.boot-says-disposed` and `lie.boot-drops-held` edit the prototype's boot, where a Held
 *   head's unknown { Restored } is queued for its actor: each drops a lane that was Held when an
 *   earlier Runtime disposal began.
 * - `mutant.disposal-skips-never-sent` leaves a never-sent commit unended by the disposal.
 * - `mutant.disposal-dispatches` also sends such a commit once its write lands.
 * - The `o6.*` ones edit the disposal's bound: `o6.dispose-interrupts-wire` interrupts the
 *   call on the wire at the start, `o6.no-bound` ends the disposal at once, and
 *   `o6.settled-in-bound-stays-held` keeps a definite in-bound ending's head Held.
 */
export const disposalMutants: ReadonlyArray<Mutant> = [
  {
    name: "lie.boot-says-disposed",
    says: "a boot drops a Held head's restored ending and notes a disposal start instead",
    expects: "Actors I29",
    runtime: "prototype",
    cases: ["PAY-15/dispose-held"],
    edits: [
      {
        file: "durable.ts",
        find: RESTORED_MAIL,
        replace: `if (h.held) note(tx, "DisposeStart", {}); else ${RESTORED_MAIL}`,
      },
    ],
  },
  {
    name: "lie.boot-drops-held",
    says: "a boot drops a Held head's restored ending and says nothing",
    expects: "Actors I29",
    runtime: "prototype",
    cases: ["PAY-15/dispose-held"],
    edits: [{ file: "durable.ts", find: RESTORED_MAIL, replace: `if (!h.held) ${RESTORED_MAIL}` }],
  },
  {
    name: "mutant.disposal-skips-never-sent",
    says: "the Runtime's disposal leaves a never-sent commit as it was, with no ending",
    expects: "Actors I29",
    runtime: "prototype",
    cases: ["PAY-13/waiting-flushed"],
    edits: [
      {
        file: "lane.ts",
        find: '    Waiting: "disposeNeverSent",',
        replace: '    Waiting: "nothing",',
      },
    ],
  },
  {
    name: "mutant.disposal-dispatches",
    says: "the Runtime's disposal keeps a never-sent commit and sends it once its write lands",
    expects: "Actors I30",
    runtime: "prototype",
    cases: ["PAY-07/late-may-not-leave"],
    edits: [
      {
        file: "step.ts",
        find: 'const dispatch = (tx: Tx) => {\n  if (tx.w.status !== "live") return;',
        replace: 'const dispatch = (tx: Tx) => {\n  if (tx.w.status === "disposed") return;',
      },
      {
        file: "lane.ts",
        find: '    Waiting: "disposeNeverSent",',
        replace: '    Waiting: "nothing",',
      },
    ],
  },
  {
    name: "o6.dispose-interrupts-wire",
    says: "the Runtime's disposal interrupts the call on the wire at its start",
    expects: "Actors I35",
    runtime: "prototype",
    cases: ["PAY-16/on-the-wire-at-the-bound-ends-unknown-disposed"],
    edits: [
      {
        file: "lane.ts",
        find: "disposeWire() {},",
        replace:
          'disposeWire(tx, l) { const h = l!.head!; if (h.phase.t === "wire") tx.commands.push({ k: "interrupt", attempt: h.id, send: h.phase.gen }); },',
      },
    ],
  },
  {
    name: "o6.settled-in-bound-stays-held",
    says: "a definite ending within the disposal bound keeps its head Held",
    expects: "Actors I36",
    runtime: "prototype",
    cases: ["PAY-16/settled-during-disposal-parked"],
    edits: [
      {
        file: "lane.ts",
        find: '  if (e.ch !== "unknown") return setLane(tx, parkWaiting(tx, { ...rest, parked: [...lane.parked, own] }));',
        replace:
          '  if (e.ch === "parked") return setLane(tx, parkWaiting(tx, { ...rest, parked: [...lane.parked, own] }));',
      },
    ],
  },
  {
    name: "o6.no-bound",
    says: "the Runtime's disposal ends at once, with calls still on the wire",
    expects: "Actors I35",
    runtime: "prototype",
    cases: ["PAY-16/disposal-ends-with-the-last-fiber"],
    edits: [
      {
        file: "step.ts",
        find: "if (wires(tx.w).length === 0) finishDisposal(tx);",
        replace: "if (true) finishDisposal(tx);",
      },
    ],
  },
  {
    name: "id.dispose-drops-lanes",
    says: "disposeActor drops a persisted actor's lanes, as it does a local actor's",
    expects: "Actors I29",
    runtime: "prototype",
    cases: ["DISP-02"],
    edits: [
      {
        file: "step.ts",
        find: 'if (m.local && how !== "remount")',
        replace: 'if (how !== "remount")',
      },
    ],
  },
  {
    name: "mutant.disposal-hold-first",
    says: "a head ending unknown at the disposal bound is parked before its lane's queued commits",
    expects: "Actors I31",
    runtime: "prototype",
    cases: ["DISP-03"],
    edits: [
      {
        file: "lane.ts",
        find: '  const waited = parkWaiting(tx, { ...lane, head: { ...h, mayHaveApplied: true, phase: { t: "held" } } });\n  setLane(tx, { ...waited, parked: [...waited.parked, own] });',
        replace:
          '  setLane(tx, parkWaiting(tx, { ...lane, parked: [...lane.parked, own], head: { ...h, mayHaveApplied: true, phase: { t: "held" } } }));',
      },
    ],
  },
  {
    name: "mutant.release-drops-held",
    says: "an actor whose last use was released drops its lanes when its grace ends",
    expects: "Actors I29",
    runtime: "prototype",
    cases: ["DISP-01"],
    edits: [
      {
        file: "step.ts",
        find: 'if (m.local && how !== "remount")',
        replace: 'if (m.local ? how !== "remount" : how === "end")',
      },
    ],
  },
  {
    name: "mutant.disposal-rereads",
    says: "the Runtime's disposal sends each open read again instead of stopping it",
    expects: "Actors I30",
    runtime: "prototype",
    cases: ["DISP-04"],
    edits: [
      {
        file: "step.ts",
        find: '    tx.commands.push({ k: "interrupt", attempt: k, send: r.gen });\n    note(tx, "Superseded", { op: r.op, attempt: k, send: r.gen });',
        replace:
          '    tx.commands.push({ k: "invoke", attempt: k, send: r.gen, machine: r.machine, op: r.op, input: r.input, ctx: { id: k, mayHaveApplied: false } });',
      },
    ],
  },
  {
    name: "1b.forget-marks-held-lane",
    says: "forget marks a Held lane releasing, so its endings are never delivered",
    expects: "Actors I32",
    runtime: "prototype",
    cases: ["DISP-05"],
    edits: [
      {
        file: "step.ts",
        find: "else setLane(tx, { ...l, parked: [] });",
        replace: "else setLane(tx, { ...l, parked: [], releasing: true as const });",
      },
    ],
  },
];
