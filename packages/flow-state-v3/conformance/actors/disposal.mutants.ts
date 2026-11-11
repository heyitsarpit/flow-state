import type { Mutant } from "../dsl/oracle.ts";

/**
 * Wrong runtimes the disposal oracle must catch.
 *
 * **Details**
 *
 * - `mutant.disposal-skips-never-sent` leaves a never-sent commit unended by the disposal.
 * - `mutant.disposal-dispatches` also sends such a commit once its write lands.
 * - The `o6.*` ones edit the disposal: `o6.dispose-interrupts-wire` interrupts the call on
 *   the wire at the start, `o6.no-bound` ends the disposal at once, and
 *   `o6.settled-in-bound-stays-held` keeps a definite in-bound ending's head Held;
 *   `mutant.short-disposal-bound` cuts the bound to 1 s, which a call that never answers shows;
 *   `mutant.bound-ending-wrong-tag` ends a call answered within the bound as the bound does, not
 *   by its answer (T6 L7: I35's ending is its answer's, channel and reason).
 * - `id.dispose-drops-lanes` drops lanes at an actor's disposal, `mutant.disposal-hold-first`
 *   delivers the hold-leaving ending first, `mutant.disposal-rereads` sends a read during the
 *   disposal, and `1b.forget-marks-held-lane` marks a forgotten actor's Held lane releasing.
 * - `mutant.boot-after-disposal-skips-restored` drops a Held head's restore decision and mail at
 *   the boot after a disposal (`mutant.boot-skips-restored`'s edits): its `AwaitRestore
 *   { runtimeDisposal }` falls due (Actors I29; step 6 review M3).
 */
export const disposalMutants: ReadonlyArray<Mutant> = [
  {
    name: "mutant.disposal-skips-never-sent",
    says: "the Runtime's disposal leaves a never-sent commit as it was, with no ending",
    expects: "Actors I38",
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
    cases: [
      "PAY-16/on-the-wire-at-the-bound-ends-unknown-disposed",
      "PAY-16/settled-during-disposal-parked",
    ],
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
  {
    name: "mutant.bound-ending-wrong-tag",
    says: "a call the server answers within the disposal bound ends with the bound's unknown Disposed",
    expects: "Actors I35",
    runtime: "prototype",
    cases: ["PAY-16/settled-during-disposal-parked"],
    edits: [
      {
        file: "lane.ts",
        find: '  const final: Ending =\n    ending.ch === "failure" && h.mayHaveApplied',
        replace:
          '  const final: Ending = tx.w.status === "disposing" ? { ch: "unknown", reason: "Disposed" } :\n    ending.ch === "failure" && h.mayHaveApplied',
      },
    ],
  },
  {
    name: "mutant.short-disposal-bound",
    says: "the Runtime's disposal bound is 1 s, so a call that never answers ends unknown Disposed early",
    expects: "Actors I35",
    runtime: "prototype",
    cases: ["PAY-16/never-answered-waits-for-the-bound", "PAY-16/answered-inside-the-bound"],
    edits: [
      {
        file: "step.ts",
        find: "dueAt: tx.env.now + tx.bounds.disposeMs",
        replace: "dueAt: tx.env.now + 1000",
      },
    ],
  },
  {
    name: "mutant.boot-after-disposal-skips-restored",
    says: "a boot after the Runtime's disposal revives a Held head and never decides its unknown { Restored }",
    expects: "Actors I29",
    runtime: "prototype",
    cases: ["PAY-15/dispose-held", "PAY-15/dispose-held-moved"],
    edits: [
      {
        file: "durable.ts",
        find: "      noteEnding(tx, { op: l.op, attempt: h.id }, ending);\n      const phase: Phase",
        replace: "      const phase: Phase",
      },
      {
        file: "durable.ts",
        find: "        mail(tx, l, h, ending, true, !h.held);",
        replace: "",
      },
    ],
  },
];
