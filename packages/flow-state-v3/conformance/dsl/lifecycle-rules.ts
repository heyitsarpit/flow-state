import { Data } from "effect";
import type { InvariantId } from "./oracle.ts";
import type { Concurrency } from "../fixtures/reference.ts";
import { type Admit, type Cause, type GoneWhy, Life, Phase } from "./lifecycle-model.ts";

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
 *   never-sent unknown (CQ5), the never-sent commit at the disposal's end (CQ6) and the superseded
 *   head's promotion (CQ7, in the promotion rule).
 * - A re-send after a cancel in the same turn owes the head's release, so its send is WriteLanes
 *   I12 (R14: it returns to Held and is released; review L4).
 */
export const tableA: TableA = {
  Send: {
    ...each(refuse(1)),
    Queued: always(refuse(11)),
    Unsent: { open: to(Phase.OnWire()), cancelPending: refuse(20) },
    Resending: { open: to(Phase.OnWire()), cancelPending: refuse(12) },
    Held: always(refuse(12)),
  },
  EndDefinite: {
    ...each(refuse(16)),
    Queued: always(refuse(11)),
    Unsent: always(stay),
    OnWire: { running: gone("closed"), disposing: gone("settledInDisposal") },
    Interrupted: always(refuse(20)),
    Gone: { evidenceFirst: stay, other: refuse(16) },
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
 * `Commit` is the open turn's commit that has had no mint or decline. Data, mutated like the
 * cells.
 */
export type Deadlines = {
  readonly Await: Readonly<Record<"Released" | "Superseded" | "NotSentCancelled", Deadline>>;
  readonly PendingCancel: Deadline;
  readonly AwaitRestore: Readonly<Record<Cause, Deadline>>;
  readonly AwaitLetGo: Deadline;
  readonly Commit: Deadline;
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
  Commit: { by: "TurnCloses", invariant: wl(15) },
};

/**
 * The lane's promotion when its head leaves: which waiting Attempt becomes `Unsent`. The design's
 * rule is `firstFree`, the first `Queued` one in mint order that owes nothing (WriteLanes I11).
 */
export type Promotion = "firstFree" | "never" | "second" | "first";

/**
 * What a cell of Table B does to its lane when its member applies.
 *
 * **Details**
 *
 * - `Admit`: a commit; it waits for its report, a mint or a decline ({@link Admit}).
 * - `Stay`: nothing. `Quiet`: nothing, and a decline on the lane in this turn breaks `invariant`.
 * - `LetGo`: the lane's kept endings owe their let-go record.
 * - `Resend`: the Held head is re-sent. `Interrupt`: the head on the wire is interrupted.
 * - `PendingCancel`: the never-sent head owes its cancel's ending. `AwaitRelease`: the head owes
 *   `Released` by the turn's close.
 * - `CancelAll`: every waiting Attempt owes `NotSent { Cancelled }`, then `head` acts on the head.
 * - `Mark`: the lane is releasing (WriteLanes R16).
 */
export type Act = Data.TaggedEnum<{
  Admit: { admit: Admit };
  Stay: {};
  Quiet: { invariant: InvariantId };
  LetGo: {};
  Resend: {};
  PendingCancel: {};
  AwaitRelease: {};
  Interrupt: {};
  CancelAll: { head: "Stay" | "PendingCancel" | "AwaitRelease" | "Interrupt" };
  Mark: {};
}>;

/**
 * Constructors and matchers for {@link Act}.
 */
export const Act = Data.taggedEnum<Act>();

/**
 * The rows of Table B: the lane's head phase, or `Idle` when it has none. `Queued` and `Gone` are
 * never a head.
 */
export type HeadRow = "Idle" | Exclude<Phase["_tag"], "Queued" | "Gone">;

/**
 * The columns of Table B: a commit by its operation's concurrency, then the other member kinds.
 */
export type Column = Concurrency | "Retry" | "Cancel" | "CancelAll" | "Release";

/**
 * Table B: the lane's members, by head and member. Each guard value is its own cell.
 */
export type TableB = Readonly<
  Record<HeadRow, Readonly<Record<Column, Readonly<Record<string, Act>>>>>
>;

const admit = (what: Admit) => ({ always: Act.Admit({ admit: what }) });
const act = (a: Act) => ({ always: a });

const busy = (latest: Admit, cancel: Readonly<Record<string, Act>>) => ({
  reject: admit("Decline"),
  latest: admit(latest),
  serialize: admit("Queue"),
  cancel,
  Retry: act(Act.Stay()),
  Release: act(Act.Mark()),
});

const replaced = {
  free: Act.Admit({ admit: "Replace" }),
  pendingCancel: Act.Admit({ admit: "ReplaceCancelled" }),
};

/**
 * Table B as the convergence design writes it (`lane-oracle-convergence-v2-2026-11-11.md`, Table
 * B).
 *
 * **Details**
 *
 * - `latest` on a never-sent head with a pending cancel supersedes the waiting commit, not the
 *   head, and `cancel` replaces it keeping its cancel (WriteLanes R14).
 * - A cancel of an Idle lane with a kept ending lets it go (Actors R15 as written; CQ3 pending).
 *
 * **Gotchas**
 *
 * - The never-sent head's promotion after `Superseded` follows the design (CQ7 pending).
 */
export const tableB: TableB = {
  Idle: {
    reject: admit("Mint"),
    latest: admit("Mint"),
    serialize: admit("Mint"),
    cancel: admit("Mint"),
    Retry: act(Act.Stay()),
    Cancel: { none: Act.Quiet({ invariant: wl(20) }), kept: Act.LetGo() },
    CancelAll: act(Act.Quiet({ invariant: wl(21) })),
    Release: act(Act.Stay()),
  },
  Unsent: {
    ...busy("SupersedeHead", replaced),
    latest: {
      free: Act.Admit({ admit: "SupersedeHead" }),
      pendingCancel: Act.Admit({ admit: "SupersedeQueued" }),
    },
    Cancel: act(Act.PendingCancel()),
    CancelAll: act(Act.CancelAll({ head: "PendingCancel" })),
  },
  Resending: {
    ...busy("SupersedeQueued", admit("Replace")),
    Cancel: act(Act.AwaitRelease()),
    CancelAll: act(Act.CancelAll({ head: "AwaitRelease" })),
  },
  OnWire: {
    ...busy("SupersedeQueued", admit("Replace")),
    Cancel: act(Act.Interrupt()),
    CancelAll: act(Act.CancelAll({ head: "Interrupt" })),
  },
  Interrupted: {
    ...busy("SupersedeQueued", admit("ReplaceCancelled")),
    Cancel: act(Act.Stay()),
    CancelAll: act(Act.CancelAll({ head: "Stay" })),
  },
  Held: {
    ...busy("SupersedeQueued", admit("Replace")),
    Retry: act(Act.Resend()),
    Cancel: act(Act.AwaitRelease()),
    CancelAll: act(Act.CancelAll({ head: "AwaitRelease" })),
  },
  Restoring: {
    ...busy("SupersedeQueued", replaced),
    Cancel: act(Act.PendingCancel()),
    CancelAll: act(Act.CancelAll({ head: "PendingCancel" })),
  },
};

/**
 * What a cell of Table C does: move the ending to a life, leave it, or refuse the move.
 */
export type Fate = Data.TaggedEnum<{
  Live: { to: Life };
  Stay: {};
  Refuse: { invariant: InvariantId };
}>;

/**
 * Constructors and matchers for {@link Fate}.
 */
export const Fate = Data.taggedEnum<Fate>();

/**
 * The rows of Table C: a delivery move, an incarnation opening, and the instants every ending
 * sees.
 */
export type LifeRow =
  | "Delivered"
  | "InvalidTurn"
  | "Unmapped"
  | "Parked"
  | "Unparked"
  | "RecordedLetGo"
  | "RecordedOther"
  | "Opens"
  | "StepEnds"
  | "Reload"
  | "DisposalStarts";

/**
 * Table C: an ending's life, by row and life. `Heard` reaches only a `Delivering` life, so it is
 * its own one-cell row.
 */
export type TableC = Readonly<
  Record<LifeRow, Readonly<Record<Life["_tag"], Readonly<Record<string, Fate>>>>>
> & { readonly Heard: { readonly Delivering: Readonly<Record<string, Fate>> } };

const deny = (n: number) => Fate.Refuse({ invariant: wl(n) });
const live = (life: Life) => Fate.Live({ to: life });
const kept = Fate.Stay();
const once = (fate: Fate) => ({ always: fate });

const lives = (fate: Fate) => ({
  Owed: once(fate),
  Parked: once(fate),
  ParkedOpen: once(fate),
  Delivering: once(fate),
  Refused: once(fate),
  Kept: once(fate),
  KeptOpen: once(fate),
  Evidence: once(fate),
  Closed: once(fate),
});

const admitted = (retry: boolean) => ({
  running: live(Life.Delivering({ retry })),
  disposing: deny(15),
});

/**
 * Table C as the convergence design writes it (`lane-oracle-convergence-v2-2026-11-11.md`, Table
 * C).
 *
 * **Gotchas**
 *
 * - A refusal's next life (`Refused` or `Kept`) waits on CQ1 and CQ2, an unmapped ending's on
 *   CQ10, and a refused ending at a reload on CQ10: each follows today's rule. A twice-refused
 *   decline or never-sent ending is `Closed`, as Actors R15 is written ("only a sent write's
 *   twice-refused ending stays parked"), pending CQ1 and CQ2 (round-14 keeps declines, D123).
 * - `Opens` on a parked ending gives `ParkedOpen`, not the design's `Owed`: a runtime may report
 *   the unpark after the incarnation opens (round-14's boot), and `Unparked` on `Owed` stays a
 *   refusal. `ParkedOpen` is owed by the step's end, as the design's `Owed` was (T6 L11).
 * - A never-sent commit's ending decided in the Runtime's disposal (`NotSent { Disposed }`, Actors
 *   R22) stays `Parked` at `Opens`, unjudged, pending CQ6: round-14 does not deliver it after the
 *   reload (`PAY-10/hang`, `PAY-13/waiting-flush-lost`), though WriteLanes I15 and R10 say it
 *   must be delivered or be evidence. The conflict is with Actors R22 (a definite ending drops
 *   the head, so nothing is on disk to deliver).
 */
export const tableC: TableC = {
  Delivered: {
    ...lives(deny(15)),
    Owed: admitted(false),
    Parked: admitted(false),
    ParkedOpen: admitted(false),
    Refused: admitted(true),
    KeptOpen: admitted(true),
    Kept: { running: Fate.Refuse({ invariant: actors(24) }), disposing: deny(15) },
  },
  InvalidTurn: {
    ...lives(deny(15)),
    Delivering: {
      first: live(Life.Refused()),
      retry: live(Life.Kept()),
      retryNeverSent: live(Life.Closed()),
    },
  },
  Unmapped: { ...lives(deny(15)), Delivering: once(live(Life.Closed())) },
  Heard: { Delivering: once(live(Life.Closed())) },
  Parked: {
    ...lives(deny(15)),
    Owed: once(live(Life.Parked())),
    Parked: once(kept),
    ParkedOpen: once(live(Life.Parked())),
  },
  Unparked: {
    ...lives(deny(15)),
    Parked: once(live(Life.Owed())),
    ParkedOpen: once(live(Life.Owed())),
    Kept: once(kept),
    KeptOpen: once(kept),
  },
  RecordedLetGo: {
    ...lives(deny(15)),
    Owed: { letGo: live(Life.Closed()), none: deny(15) },
    Parked: { letGo: live(Life.Closed()), none: deny(15) },
    ParkedOpen: { letGo: live(Life.Closed()), none: deny(15) },
    Kept: { letGo: live(Life.Closed()), none: deny(15) },
    KeptOpen: { letGo: live(Life.Closed()), none: deny(15) },
    Evidence: once(live(Life.Closed())),
  },
  RecordedOther: { ...lives(deny(15)), Evidence: once(live(Life.Closed())) },
  Opens: {
    ...lives(kept),
    Parked: { neverSentInDisposal: kept, other: live(Life.ParkedOpen()) },
    Kept: once(live(Life.KeptOpen())),
  },
  StepEnds: {
    ...lives(kept),
    Owed: { inDisposal: kept, live: deny(15) },
    ParkedOpen: once(deny(15)),
    Delivering: once(deny(15)),
    Refused: once(deny(15)),
    KeptOpen: once(Fate.Refuse({ invariant: actors(24) })),
    Evidence: once(deny(15)),
  },
  Reload: {
    ...lives(kept),
    Owed: { inDisposal: live(Life.Parked()), live: live(Life.Closed()) },
    ParkedOpen: once(live(Life.Parked())),
    Delivering: once(deny(15)),
    Refused: once(live(Life.Closed())),
    KeptOpen: once(live(Life.Kept())),
    Evidence: once(live(Life.Closed())),
  },
  DisposalStarts: lives(kept),
};

/**
 * Everything the lifecycle's moves read that a mutation may replace: Tables A, B and C, the
 * deadlines and the promotion rule.
 */
export type Rules = {
  readonly tableA: TableA;
  readonly tableB: TableB;
  readonly tableC: TableC;
  readonly deadlines: Deadlines;
  readonly promotion: Promotion;
};

/**
 * The rules as the convergence design writes them.
 */
export const rules: Rules = { tableA, tableB, tableC, deadlines, promotion: "firstFree" };
