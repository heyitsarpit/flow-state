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
 */
export const disposalMutants: ReadonlyArray<Mutant> = [
  {
    name: "lie.boot-says-disposed",
    says: "a boot drops a Held head's restored ending and notes a disposal start instead",
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
    runtime: "prototype",
    cases: ["PAY-15/dispose-held"],
    edits: [{ file: "durable.ts", find: RESTORED_MAIL, replace: `if (!h.held) ${RESTORED_MAIL}` }],
  },
  {
    name: "mutant.disposal-skips-never-sent",
    says: "the Runtime's disposal leaves a never-sent commit as it was, with no ending",
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
];

/**
 * Wrong runtimes of the disposal bound (Actors R22), not registered with any oracle.
 *
 * **Details**
 *
 * They edit the prototype's Runtime disposal: one interrupts the
 * call on the wire at the start, one keeps a definite in-bound ending Held, one ends the disposal
 * at once. The disposal cases' own expectations catch each (`PAY-16`, `PAY-13`); no oracle does,
 * since the bound and the head's fate are rules of Actors R22 that no Invariant states.
 *
 * **Gotchas**
 *
 * - Falsify does not run them: a guarantee holds an oracle and the mutants it must catch, and
 *   case expectations have no guarantee yet. They are kept for the Invariant the user may add.
 */
export const disposalBoundMutants: ReadonlyArray<Mutant> = [
  {
    name: "o6.dispose-interrupts-wire",
    says: "the Runtime's disposal interrupts the call on the wire at its start",
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
];
