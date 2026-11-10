import { Data } from "effect";
import type { InvariantId } from "./oracle.ts";
import { type Cause, type GoneWhy, Phase } from "./lifecycle-model.ts";

/**
 * What a cell does: move the Attempt to a phase, leave it where it is, or refuse the move with an
 * Invariant. Promotion is not a cell: it is one rule run after every move ({@link Promotion}).
 */
export type Outcome = Data.TaggedEnum<{
  Move: { to: Phase };
  Stay: {};
  Refuse: { invariant: InvariantId };
}>;

/**
 * Constructors and matchers for {@link Outcome}.
 */
export const Outcome = Data.taggedEnum<Outcome>();

/**
 * The rows of Table A: a {@link Move}, with an `End` split by its kind of ending.
 */
export type Row =
  | "Send"
  | "EndDefinite"
  | "EndNotSent"
  | "EndUnknown"
  | "Released"
  | "Superseded"
  | "Reload"
  | "BootSettles"
  | "DisposalStarts"
  | "RuntimeDisposed"
  | "StepEnds";

/**
 * One cell of Table A: its outcome for each value of its guard. A cell with no guard has the one
 * value `always`.
 */
export type Cell = Readonly<Record<string, Outcome>>;

/**
 * Table A: an Attempt's progress, by row and phase. Total: every key has a cell.
 */
export type TableA = Readonly<Record<Row, Readonly<Record<Phase["_tag"], Cell>>>>;

const wl = (n: number) => `WriteLanes I${n}` as const;
const actors = (n: number) => `Actors I${n}` as const;
const refuse = (n: number) => Outcome.Refuse({ invariant: wl(n) });
const stay = Outcome.Stay();
const to = (phase: Phase) => Outcome.Move({ to: phase });
const gone = (why: GoneWhy) => to(Phase.Gone({ why }));
const always = (outcome: Outcome) => ({ always: outcome });

const each = (outcome: Outcome) => ({
  Queued: always(outcome),
  Unsent: always(outcome),
  Resending: always(outcome),
  OnWire: always(outcome),
  Interrupted: always(outcome),
  Held: always(outcome),
  Restoring: always(outcome),
  Gone: always(outcome),
});

/**
 * Table A as the convergence design writes it (`lane-oracle-convergence-v2-2026-11-11.md`, Table
 * A). Each guard value is its own cell, so a mutation can replace it.
 *
 * **Gotchas**
 *
 * - Cells marked pending in the design follow the Spec as written until the user answers: the
 *   never-sent unknown (CQ5) and the never-sent commit at the disposal's end (CQ6).
 */
export const tableA: TableA = {
  Send: {
    ...each(refuse(1)),
    Queued: always(refuse(11)),
    Unsent: { open: to(Phase.OnWire()), cancelPending: refuse(20) },
    Resending: always(to(Phase.OnWire())),
    Held: always(refuse(12)),
  },
  EndDefinite: {
    ...each(refuse(16)),
    Queued: always(refuse(11)),
    Unsent: always(stay),
    OnWire: { running: gone("closed"), disposing: gone("settledInDisposal") },
    Interrupted: always(refuse(20)),
  },
  EndNotSent: {
    ...each(refuse(16)),
    Queued: {
      cancelAll: gone("closed"),
      cancelAllOutOfOrder: refuse(21),
      disposed: gone("closed"),
      other: refuse(11),
    },
    Unsent: {
      pendingCancel: gone("closed"),
      storageRefused: gone("closed"),
      disposed: gone("closed"),
      other: refuse(20),
    },
    OnWire: always(refuse(20)),
    Interrupted: always(refuse(20)),
    Restoring: { restored: gone("closed"), pendingCancel: gone("closed"), other: refuse(16) },
    Gone: { evidenceFirst: stay, pendingCancel: stay, other: refuse(16) },
  },
  EndUnknown: {
    ...each(refuse(16)),
    Queued: always(refuse(11)),
    Unsent: always(stay),
    Resending: { storageRefused: to(Phase.Held()), other: refuse(16) },
    OnWire: {
      retained: to(Phase.Held()),
      released: to(Phase.Held()),
      disposed: to(Phase.Held()),
      disposedRunning: Outcome.Refuse({ invariant: actors(35) }),
    },
    Interrupted: { cancelled: to(Phase.Held()), disposed: to(Phase.Held()), other: refuse(20) },
    Held: { owedRestore: stay, unowedRestore: refuse(15), other: refuse(16) },
    Restoring: { headRestored: to(Phase.Held()), other: refuse(16) },
    Gone: {
      evidenceFirst: stay,
      pendingCancel: stay,
      restoredAfterDisposal: Outcome.Refuse({ invariant: actors(36) }),
      other: refuse(16),
    },
  },
  Released: {
    ...each(refuse(12)),
    Resending: { awaited: gone("closed"), none: refuse(12) },
    Held: { awaited: gone("closed"), none: refuse(12) },
    Gone: { evidence: stay, other: refuse(12) },
  },
  Superseded: {
    ...each(refuse(8)),
    Queued: { awaited: gone("closed"), none: refuse(8) },
    Unsent: { awaited: gone("closed"), none: refuse(8) },
  },
  Reload: {
    ...each(stay),
    Queued: always(to(Phase.Restoring({ head: false }))),
    Unsent: always(to(Phase.Restoring({ head: true }))),
    Resending: always(to(Phase.Held())),
    OnWire: always(to(Phase.Held())),
    Interrupted: always(to(Phase.Held())),
  },
  BootSettles: { ...each(stay), Restoring: always(gone("closed")) },
  DisposalStarts: { ...each(stay), Resending: always(to(Phase.Held())) },
  RuntimeDisposed: {
    ...each(stay),
    Queued: always(Outcome.Refuse({ invariant: actors(29) })),
    Unsent: always(Outcome.Refuse({ invariant: actors(29) })),
  },
  StepEnds: { ...each(stay), Interrupted: { stoppable: refuse(20), unstoppable: stay } },
};

/**
 * The instant an {@link Obligation} is due, and the Invariant an unmet one breaks.
 */
export type Deadline = {
  readonly by: "TurnCloses" | "StepEnds" | "never";
  readonly invariant: InvariantId;
};

/**
 * When each obligation is due: `Await` by report, `AwaitRestore` by cause, and the rest by kind.
 * Data, mutated like the cells.
 */
export type Deadlines = {
  readonly Await: Readonly<Record<"Released" | "Superseded" | "NotSentCancelled", Deadline>>;
  readonly PendingCancel: Deadline;
  readonly AwaitRestore: Readonly<Record<Cause, Deadline>>;
  readonly AwaitLetGo: Deadline;
};

/**
 * The obligation deadlines as the convergence design writes them.
 *
 * **Gotchas**
 *
 * - A plain `AwaitRestore` is Restore I6's lower bound, claimed by `delivered-once` (CQ11,
 *   proposed).
 */
export const deadlines: Deadlines = {
  Await: {
    Released: { by: "TurnCloses", invariant: wl(12) },
    Superseded: { by: "TurnCloses", invariant: wl(8) },
    NotSentCancelled: { by: "TurnCloses", invariant: wl(21) },
  },
  PendingCancel: { by: "never", invariant: wl(20) },
  AwaitRestore: {
    plain: { by: "StepEnds", invariant: "Restore I6" },
    runtimeDisposal: { by: "StepEnds", invariant: actors(29) },
    disposeActor: { by: "StepEnds", invariant: actors(29) },
    forget: { by: "StepEnds", invariant: actors(32) },
  },
  AwaitLetGo: { by: "StepEnds", invariant: wl(15) },
};

/**
 * The lane's promotion when its head leaves: which waiting Attempt becomes `Unsent`. The design's
 * rule is `firstFree`, the first `Queued` one in mint order that owes nothing (WriteLanes I11).
 */
export type Promotion = "firstFree" | "never" | "second" | "first";

/**
 * Everything the lifecycle's moves read that a mutation may replace: Table A, the deadlines and
 * the promotion rule.
 */
export type Rules = {
  readonly tableA: TableA;
  readonly deadlines: Deadlines;
  readonly promotion: Promotion;
};

/**
 * The rules as the convergence design writes them.
 */
export const rules: Rules = { tableA, deadlines, promotion: "firstFree" };
