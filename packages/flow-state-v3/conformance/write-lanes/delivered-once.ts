import { type InvariantId, oracle } from "../dsl/oracle.ts";

const GUARANTEE: ReadonlyArray<InvariantId> = [
  "WriteLanes I15",
  "WriteLanes I16",
  "Actors I24",
  "Restore I6",
];

/**
 * Every ending is delivered once to its own actor as its mapped event, parked for it, or recorded
 * as evidence: never both, never twice; a settled ending is never followed by another; a kept
 * ending gets one try per boot or adoption; and a restored Attempt's `unknown { Restored }` comes
 * in the boot that restores it. Read from the Case's one lifecycle fold.
 *
 * **Details**
 *
 * - The refusals are the lifecycle's (`dsl/lifecycle-step.ts`, Table A's endings and Table C's
 *   lives, with the obligation deadlines): an ending delivered, parked or recorded only while
 *   owed, and none still owed at its step's end unless decided in the Runtime's disposal (I15);
 *   nothing delivered while the Runtime disposes (I15); a delivery heard by a turn of its actor,
 *   `Unhandled`, `Denied` or refused in its step (I15); a refused ending delivered once more in
 *   the same step, a second refusal kept or closed (I15, Actors R15); a kept ending's second try
 *   only after its actor's next incarnation opens (Actors I24); a definite ending followed by
 *   another (I16); a restored Attempt that gets no ending in its boot (Restore I6's lower bound).
 * - A delivery whose event is not its ending's mapping (by channel and reason) is refused as I15:
 *   it delivers an ending that does not exist (review F2).
 * - It has no views of its own.
 *
 * **Gotchas**
 *
 * - The fold is shared with the other lifecycle oracles: a wrong cell is wrong for all of them,
 *   caught by the lifecycle's traces and mutation test, and by the runtime mutants.
 * - `Unhandled` and `Denied` carry no actor; `Heard` takes the one delivering ending of that
 *   event.
 * - A parked ending still parked at the case's end is not judged.
 * - Pending Spec answers: a twice-refused never-sent ending closes (CQ1, CQ2, Actors R15 as
 *   written); a refusal across a reload is dropped and `UnmappedEnding` is final (CQ10); the try
 *   of a kept ending comes in the step its incarnation begins (CQ8).
 */
export const deliveredOnce = oracle({
  name: "delivered-once",
  guarantee: GUARANTEE,
  start: () => null,
  step: (state, _facts, _requests, lives) =>
    [
      state,
      lives.applied.flatMap((a) => a.refusals).filter((r) => GUARANTEE.includes(r.invariant)),
    ] as const,
});
