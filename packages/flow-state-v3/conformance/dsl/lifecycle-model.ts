import { Data, Option } from "effect";
import type { Concurrency } from "../fixtures/reference.ts";
import {
  type ActorRef,
  type Channel,
  type Json,
  type MemberKind,
  MemberTarget,
  sameActor,
  sameJson,
  type Use,
} from "../port.ts";
import type { InvariantId } from "./oracle.ts";

/**
 * One write lane: its actor, its operation, and its key (`None` on an unkeyed operation).
 *
 * **Gotchas**
 *
 * - It has no identity version or contract id, so an old-version hold (WriteLanes R11, I17) is not
 *   told apart from the current lane: a stated limit.
 */
export type LaneId = {
  readonly actor: ActorRef;
  readonly operation: string;
  readonly key: Option.Option<Json>;
};

/**
 * Whether two {@link LaneId}s name the same lane.
 */
export const sameLane = (a: LaneId, b: LaneId) =>
  sameActor(a.actor, b.actor) &&
  a.operation === b.operation &&
  Option.makeEquivalence(sameJson)(a.key, b.key);

/**
 * Every lane of `actor`'s `operation` that any Attempt the model knows was minted on, once each.
 */
export const lanesOfOperation = (model: Model, actor: ActorRef, operation: string) =>
  model.attempts
    .map((a) => a.lane)
    .filter((l) => sameActor(l.actor, actor) && l.operation === operation)
    .filter((l, i, all) => all.findIndex((other) => sameLane(other, l)) === i);

/**
 * Why an Attempt left its lane: it closed (an ending or a release), its ending is evidence (it was
 * replaced), or it settled during the Runtime's disposal.
 */
export type GoneWhy = "closed" | "evidence" | "settledInDisposal";

/**
 * How far one Attempt has got. Its place on the lane (head or waiting) is derived, never stored.
 *
 * **Details**
 *
 * - `Queued`: waiting behind the head; never invoked.
 * - `Unsent`: addressable once it is the head; never invoked.
 * - `Resending`: sent before; a retry admitted its re-send, not yet invoked.
 * - `OnWire`: invoked, with no ending yet.
 * - `Interrupted`: on the wire and cancelled; it ends unknown `Cancelled`, or `Disposed` past the
 *   disposal's bound.
 * - `Held`: its last ending was a retained unknown.
 * - `Restoring`: never sent when its page died; it awaits its restore ending. `head` says which
 *   one is allowed.
 * - `Gone`: it left the lane, and why.
 */
export type Phase = Data.TaggedEnum<{
  Queued: {};
  Unsent: {};
  Resending: {};
  OnWire: {};
  Interrupted: {};
  Held: {};
  Restoring: { head: boolean };
  Gone: { why: GoneWhy };
}>;

/**
 * Constructors and matchers for {@link Phase}.
 */
export const Phase = Data.taggedEnum<Phase>();

/**
 * Whether an Attempt in this phase is addressable, so it can be its lane's head (WriteLanes I9):
 * any phase but `Queued`, `Gone` and a `Restoring` that was not the head.
 */
export const addressable = (phase: Phase) =>
  Phase.$match(phase, {
    Queued: () => false,
    Gone: () => false,
    Restoring: ({ head }) => head,
    Unsent: () => true,
    Resending: () => true,
    OnWire: () => true,
    Interrupted: () => true,
    Held: () => true,
  });

/**
 * Why an actor's incarnation owes its Held heads their restore ending: a plain reload or return,
 * the Runtime's disposal, the actor's disposal, or a forget.
 */
export type Cause = "plain" | "runtimeDisposal" | "disposeActor" | "forget";

/**
 * What a turn, a boot or a cancel still owes, kept beside the phases. Each is discharged by one
 * report before its deadline, or refused there ({@link deadlines}).
 *
 * **Details**
 *
 * - `Await`: a member's effect owes this Attempt's report (`Released`, `Superseded`, or its
 *   cancelAll `NotSent { Cancelled }`) by the close of the turn that owes it. A member's is owed by
 *   its own turn (`hearing` none); an unretained unknown's release is owed by the turn that hears
 *   its ending, named by its index in `endings` (`hearing`), so it is not due until then, or until
 *   that ending closes unheard (WriteLanes R4; review H2, step-4 reviewer items 2 and 4).
 *   `unknown` marks that release, which is due by WriteLanes I5 rather than I12.
 * - `PendingCancel`: a cancel of a never-sent Attempt owes its ending, with no deadline
 *   (WriteLanes R14).
 * - `AwaitRestore`: a boot or an incarnation owes a Held head its `unknown { Restored }` by the
 *   step's end; a boot owes one to a never-sent head whose acknowledgement the store landed.
 * - `AwaitLetGo`: a kept ending owes its let-go record by the step's end.
 */
export type Obligation = Data.TaggedEnum<{
  Await: {
    attempt: string;
    report: "Released" | "Superseded" | "NotSentCancelled";
    hearing: Option.Option<number>;
    unknown: boolean;
  };
  PendingCancel: { attempt: string; ends: "NotSent" | "UnknownCancelled" };
  AwaitRestore: { attempt: string; cause: Cause };
  AwaitLetGo: { ending: number };
}>;

/**
 * Constructors and matchers for {@link Obligation}.
 */
export const Obligation = Data.taggedEnum<Obligation>();

/**
 * Where one ending's delivery has got.
 *
 * **Details**
 *
 * - `Owed`: to a live incarnation; `Parked`: waiting for one; `ParkedOpen`: parked, and owed to
 *   the incarnation that just began, which unparks it or is delivered it in its step (T6 L11).
 * - `Delivering`: admitted and not yet heard; `retry` when it is a redelivery or a kept ending's
 *   try, whose refusal keeps it.
 * - `Refused`: its first turn was refused; `Kept`: refused twice, kept on its lane; `KeptOpen`: kept,
 *   with a try owed to the incarnation that just began.
 * - `Evidence`: evidence by declaration (WriteLanes R10, I15).
 * - `Closed`: heard, recorded, or orphaned at a reload.
 */
export type Life = Data.TaggedEnum<{
  Owed: {};
  Parked: {};
  ParkedOpen: {};
  Delivering: { retry: boolean };
  Refused: {};
  Kept: {};
  KeptOpen: {};
  Evidence: {};
  Closed: {};
}>;

/**
 * Constructors and matchers for {@link Life}.
 */
export const Life = Data.taggedEnum<Life>();

/**
 * One ending as the lifecycle follows it: whose it is, what it says, when it was decided, and its
 * delivery's {@link Life}. `attempt` is `None` for a decline.
 */
export type Ending = {
  readonly attempt: Option.Option<string>;
  readonly operation: string;
  readonly actor: ActorRef;
  readonly channel: Channel;
  readonly reason: string;
  readonly inDisposal: boolean;
  readonly life: Life;
};

/**
 * Whether an actor is bound to a live incarnation, waiting out its grace, or unbound by a
 * disposal or a forget.
 */
export type ActorRecord = "bound" | "grace" | "disposeActor" | "forget";

/**
 * One Attempt of the lifecycle: its id, its lane, and its {@link Phase}. Attempts are kept in mint
 * order and never removed.
 */
export type AttemptLife = { readonly id: string; readonly lane: LaneId; readonly phase: Phase };

/**
 * The one lifecycle a Case folds: every Attempt's phase, every ending's life, what is still owed,
 * and each actor's incarnation.
 *
 * **Details**
 *
 * - `mode`: whether the Runtime's disposal has started on this boot; `afterDisposal`: whether
 *   this boot follows one.
 * - `actors`: each actor's record and the ordinal of its latest incarnation.
 * - `releasing`: the lanes a release marked (WriteLanes R16); their endings are evidence.
 * - `turn`: the open turn's members not yet applied ({@link OpenTurn}).
 * - `unstoppable`: the operations whose calls the suite made uninterruptible, from then on.
 * - `acknowledged`: the Attempts whose acknowledging batch the store landed (that it landed is
 *   the store's fact; which Attempts a batch acknowledges is the runtime's claim).
 * - `unsaved`: the Attempts that ended, or left their lane as evidence (Released, Superseded),
 *   since the store last landed a batch, outside the Runtime's disposal. Their endings are not
 *   on disk, so a kill rolls each back to the head its landed capture holds (WriteAhead I10, I17). An ending in the disposal is parked and owed to the next
 *   incarnation however its batch lands (Actors R22, I36, I38), so it is never unsaved.
 * - `saved`: each ending's life, by index, at the last landing or boot. A kill rolls every ending
 *   that existed then back to it (WriteAhead I10: the readable scope is the latest landed capture),
 *   so a parked ending delivered with no landing after is parked again; an ending decided since
 *   keeps its life, and so does an ending of a Held head (its restore is owed instead). A
 *   `Delivering` life is never rolled back to.
 *
 * **Gotchas**
 *
 * - The lane is derived from `attempts`, never stored: its head is its first addressable Attempt
 *   in mint order, and its waiting list the `Queued` ones.
 */
export type Model = {
  readonly mode: "running" | "disposing";
  readonly turn: Option.Option<OpenTurn>;
  readonly afterDisposal: boolean;
  readonly actors: ReadonlyArray<{
    readonly actor: ActorRef;
    readonly record: ActorRecord;
  }>;
  readonly attempts: ReadonlyArray<AttemptLife>;
  readonly endings: ReadonlyArray<Ending>;
  readonly obligations: ReadonlyArray<Obligation>;
  readonly releasing: ReadonlyArray<LaneId>;
  readonly unstoppable: ReadonlyArray<string>;
  readonly acknowledged: ReadonlyArray<string>;
  readonly unsaved: ReadonlyArray<string>;
  readonly saved: ReadonlyArray<Life>;
  readonly held: ReadonlyArray<readonly [ActorRef, Use]>;
};

/**
 * The lifecycle before a case's first boot.
 */
export const empty: Model = {
  mode: "running",
  turn: Option.none(),
  afterDisposal: false,
  actors: [],
  attempts: [],
  endings: [],
  obligations: [],
  releasing: [],
  unstoppable: [],
  acknowledged: [],
  unsaved: [],
  saved: [],
  held: [],
};

/**
 * A move a cell refused: the Invariant it breaks and what happened, in one sentence.
 */
export type Refusal = { readonly invariant: InvariantId; readonly text: string };

/**
 * One move of an Attempt's progress, anchored before it reaches the lifecycle.
 *
 * **Details**
 *
 * - `Send`: its commit was invoked. `End`: it ended; `retained` says whether an unknown ending is
 *   kept on its lane (WriteLanes R4). `Evidence`: a `Released` or `Superseded` report of it.
 * - The rest reach every Attempt: a reload, the boot's settling, the Runtime's disposal starting and
 *   ending, and the step's end (`unstoppable`: the operations whose calls cannot be interrupted).
 */
export type Move = Data.TaggedEnum<{
  Send: { attempt: string };
  End: {
    attempt: string;
    channel: Channel;
    reason: string;
    retained: boolean;
  };
  Evidence: { attempt: string; kind: "Released" | "Superseded" };
  Reload: {};
  BootSettles: {};
  DisposalStarts: {};
  RuntimeDisposed: {};
  StepEnds: { unstoppable: ReadonlyArray<string> };
}>;

/**
 * Constructors and matchers for {@link Move}.
 */
export const Move = Data.taggedEnum<Move>();

/**
 * Whether this Attempt is its lane's head: the first addressable Attempt of the lane in mint
 * order.
 */
export const isHead = (model: Model, life: AttemptLife) =>
  model.attempts.find((a) => sameLane(a.lane, life.lane) && addressable(a.phase))?.id === life.id;

/**
 * One lane member of a turn, as the lifecycle applies it: its operation, kind and target, and the
 * operation's declared concurrency, which picks a commit's column of Table B.
 */
export type LaneMember = {
  readonly operation: string;
  readonly kind: MemberKind;
  readonly target: MemberTarget;
  readonly concurrency: Concurrency;
};

/**
 * The lanes a member names for `actor`: its operation's one lane (`Only`), the lane of a key
 * (`Key`), every lane of the operation the model holds (`Every`, else the key-less lane), or
 * none (`Nothing`), except a commit's, which mints on the key-less lane.
 */
// RETURN_TYPE: one list type; the branches infer a union of tuples that callers cannot reduce.
export const lanesOf = (
  model: Model,
  actor: ActorRef,
  member: Pick<LaneMember, "operation" | "kind" | "target">,
): ReadonlyArray<LaneId> => {
  const keyless: LaneId = { actor, operation: member.operation, key: Option.none() };

  return MemberTarget.$match(member.target, {
    Only: () => [keyless],
    Key: ({ key }) => [{ actor, operation: member.operation, key: Option.some(key) }],
    Every: () => {
      const lanes = lanesOfOperation(model, actor, member.operation);

      return lanes.length > 0 ? lanes : [keyless];
    },
    Nothing: () => (member.kind === "commit" ? [keyless] : []),
  });
};

/**
 * What one commit member of Table B admits when its report comes: a new Attempt (`Mint`, with
 * where it goes), or a decline (`Decline`).
 *
 * **Details**
 *
 * - `Mint`: a new head. `Decline`: only a `NotSent { Rejected }`.
 * - `Queue`: a new waiting Attempt; at 64 waiting, a decline `Overloaded` instead.
 * - `SupersedeHead`, `SupersedeQueued`: the head, or the last waiting Attempt, owes `Superseded`;
 *   the new Attempt waits.
 * - `Replace`: the head's ending is evidence; `ReplaceCancelled`: the head keeps a pending cancel.
 *   Either way the new Attempt is the head.
 */
export type Admit =
  | "Mint"
  | "Decline"
  | "Queue"
  | "SupersedeHead"
  | "SupersedeQueued"
  | "Replace"
  | "ReplaceCancelled";

/**
 * The open turn: its actor, the commit whose report it awaits (its lane and what it admits), the
 * members after it, and the lanes where a decline breaks an Invariant (an Idle cancel's).
 */
export type OpenTurn = {
  readonly actor: ActorRef;
  readonly waiting: Option.Option<{ readonly lane: LaneId; readonly admit: Admit }>;
  readonly rest: ReadonlyArray<LaneMember>;
  readonly silent: ReadonlyArray<{ readonly lane: LaneId; readonly invariant: InvariantId }>;
};

/**
 * A move of the lane's members (Table B): a turn's members, a mint, a decline, and the turn's
 * close.
 */
export type LaneMove = Data.TaggedEnum<{
  Turn: { actor: ActorRef; members: ReadonlyArray<LaneMember> };
  Minted: { attempt: string; lane: LaneId };
  Declined: { operation: string; actor: ActorRef; reason: string };
  TurnCloses: {};
}>;

/**
 * Constructors and matchers for {@link LaneMove}.
 */
export const LaneMove = Data.taggedEnum<LaneMove>();

/**
 * Which ending a report names: its operation, its Attempt (`None` for a decline) and its actor.
 */
export type EndingName = {
  readonly operation: string;
  readonly attempt: Option.Option<string>;
  readonly actor: ActorRef;
};

/**
 * A move of one ending's delivery (Table C), named by the report.
 *
 * **Details**
 *
 * - `Delivered`: admitted to its actor. `Heard`: its actor's turn, or its unhandled or denied event.
 * - `Refused`: its turn was refused (`InvalidTurn`) or it had no mapping (`Unmapped`).
 * - `Parked`, `Unparked`: it waits for an incarnation, and stops waiting.
 * - `Recorded`: it was recorded and not delivered; `letGo` when a kept ending is let go.
 */
export type LifeMove = Data.TaggedEnum<{
  Delivered: { ending: EndingName };
  Refused: { ending: EndingName; issue: "InvalidTurn" | "Unmapped" };
  Heard: { ending: EndingName };
  Parked: { ending: EndingName };
  Unparked: { ending: EndingName };
  Recorded: { ending: EndingName; letGo: boolean };
}>;

/**
 * Constructors and matchers for {@link LifeMove}.
 */
export const LifeMove = Data.taggedEnum<LifeMove>();

/**
 * A move of an actor's life: an incarnation began (`Incarnated`, or `Adopt` of an unbound actor),
 * ended at its grace (`Finished`), or the suite disposed or forgot it.
 */
export type ActorMove = Data.TaggedEnum<{
  Incarnated: { actor: ActorRef };
  Adopt: { actor: ActorRef };
  Finished: { actor: ActorRef };
  Disposed: { actor: ActorRef };
  Forgot: { actor: ActorRef };
}>;

/**
 * Constructors and matchers for {@link ActorMove}.
 */
export const ActorMove = Data.taggedEnum<ActorMove>();

/**
 * Any move of the lifecycle: an Attempt's ({@link Move}), the lane's members' ({@link LaneMove}),
 * an ending's delivery ({@link LifeMove}) or an actor's ({@link ActorMove}).
 */
export type Input = Move | LaneMove | LifeMove | ActorMove;
