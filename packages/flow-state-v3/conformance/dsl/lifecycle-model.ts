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
import type { InvariantId } from "./facts.ts";

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
 * - `Interrupted`: on the wire and cancelled; it ends unknown `Cancelled`, `Disposed` past the
 *   disposal's bound, or with the definite answer the call gave first.
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
 * - `AwaitRestore`: an incarnation's start owes a Held head its `unknown { Restored }` by the
 *   step's end, and a never-sent head restored with its acknowledgement landed; a boot owes none.
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
 * - `Maybe`: after a kill, an ending the latest landed batch may or may not hold (it changed in the
 *   step that wrote that batch, design B4): it may be delivered (as a retry, since it may have
 *   been a kept ending), unparked, let go or recorded at a forget, and is owed nothing.
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
  Maybe: {};
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
 * What one batch saves: the end of the step that wrote it, since a step's writes are one list
 * projected at its end and a batch carries it (WriteAhead R10, I21, I22). `lives` is each ending's
 * life by index; `ended` how many of the model's `ended` Attempts; `minted` the Attempts it holds,
 * queued or sent.
 */
export type Capture = {
  readonly lives: ReadonlyArray<Life>;
  readonly ended: number;
  readonly minted: number;
};

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
 * - `ended`: every Attempt that ended, or left its lane as evidence (Released, Superseded),
 *   in order, the Runtime's disposal included: a kill before an ending's batch lands restores its
 *   head (WriteAhead I17); Actors I36 holds once the ending has landed (orchestrator, b51930e5).
 * - `release`: the release of the app's code this boot runs (`Reloaded`), and `mintedIn` the
 *   release each Attempt was minted at: a lane minted at an older release is an old-version hold
 *   (WriteLanes R11). `unencodable`: the open turn's commit input cannot encode, by the fixture's
 *   label of the event that caused it (WriteLanes R12).
 * - `live`: the actors with a live incarnation ({@link Live}); a kill ends every one.
 * - `saved`: the {@link Capture} the store holds: the latest landed batch's, or the boot's. A kill
 *   rolls the model back to it (WriteAhead I10: the readable scope is the latest landed capture).
 *   `pending`: the capture of the latest batch the store holds unanswered, which an `ack` lands.
 *
 * **Gotchas**
 *
 * - The lane is derived from `attempts`, never stored: its head is its first addressable Attempt
 *   in mint order, and its waiting list the `Queued` ones.
 * - A capture is the end of the step that wrote it: a step's writes are one list projected at its
 *   end, and its batch carries it (WriteAhead R10), so a row's fate in that step is exact. Stated
 *   limit: the step's facts do not say where in it the batch was issued; a runtime that issued
 *   one before the step's turns would hold less and go red. A flush lands at once in the fake
 *   store even while older batches are held; a landing keeps the capture that holds more endings.
 * - A live actor's `dirty` mark (stated limit, T45 close review S2): `Wrote` names no record,
 *   since the store's keys are the runtime's encoding, so any batch clears every actor's mark and
 *   any write in a step discharges every dirty end; an end that writes only another actor's
 *   record passes. Reached by `F1-two-ends` (`parts/f1.test.ts`) under a production edit that
 *   drops acct-2's writes: the same edit with acct-2 alone fails Actors I37 here, with acct-1
 *   beside it only `delivered-once` catches it. It retires when a write names its record, owed
 *   to @task.V3.T19 with WriteAhead's judges. A mark is set by a turn that
 *   changes the record from its value before the turn and is never unset by a later turn that
 *   undoes an unlanded change, so such a pair still owes a write.
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
  readonly ended: ReadonlyArray<string>;
  readonly release: number;
  readonly clock: number;
  readonly mintedIn: ReadonlyArray<readonly [string, number]>;
  readonly unencodable: boolean;
  readonly saved: Capture;
  readonly pending: Option.Option<Capture>;
  readonly held: ReadonlyArray<readonly [ActorRef, Use]>;
  readonly live: ReadonlyArray<Live>;
};

/**
 * A live incarnation, and how long the suite knows it has been free (Actors R7, R8): counted from
 * the last suite fact, `None` while it holds a use or may have work the suite cannot compute.
 * `dirty`: since when its record surely holds a change no write took (a turn that changed it, and
 * no write since); `unwritten`: since when it may, cleared by a write once its capture was due
 * (WriteAhead R10). `upper`: the most it can have been free, the clock since it opened or its last use was attached
 * or released (Actors I10: an end before the grace is refused). `woken`: the runtime opened it unasked (a boot's hydrate hold, a send), so its uses are unknown.
 */
export type Live = {
  readonly actor: ActorRef;
  readonly free: Option.Option<number>;
  readonly upper: number;
  readonly dirty: Option.Option<number>;
  readonly unwritten: Option.Option<number>;
  readonly woken: boolean;
};

/**
 * The Attempts whose ending or evidence the landed batch does not hold (ended after the step that
 * wrote it): a kill rolls each back to the head its landed capture holds, allowed and not owed
 * (WriteAhead I10, I17).
 */
export const unsavedOf = (model: Model) => model.ended.slice(model.saved.ended);

/**
 * The capture a batch holds: `model`, the end of the step that wrote it.
 */
export const captureOf = (model: Model) => ({
  lives: model.endings.map((e) => e.life),
  ended: model.ended.length,
  minted: model.attempts.length,
});

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
  ended: [],
  release: 1,
  clock: 0,
  mintedIn: [],
  unencodable: false,
  saved: { lives: [], ended: 0, minted: 0 },
  pending: Option.none(),
  held: [],
  live: [],
};

/**
 * A move a cell refused: the Invariant it breaks, what happened in one sentence, and its subject:
 * the Attempt it is about, else the actor and operation (`Checkout/Pay a pay`), else the actor.
 */
export type Refusal = {
  readonly invariant: InvariantId;
  readonly text: string;
  readonly subject: string;
};

/**
 * An actor as a refusal's subject.
 */
export const actorSubject = (actor: ActorRef) => `${actor.machine} ${actor.id}`;

/**
 * A lane or a decline (no Attempt) as a refusal's subject: its actor and operation.
 */
export const laneSubject = (actor: ActorRef, operation: string) =>
  `${actorSubject(actor)} ${operation}`;

/**
 * An ending as a refusal's subject: its Attempt, else its actor and operation.
 */
export const endingSubject = (name: {
  readonly attempt: Option.Option<string>;
  readonly actor: ActorRef;
  readonly operation: string;
}) => Option.getOrElse(name.attempt, () => laneSubject(name.actor, name.operation));

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
