import { Data, Option } from "effect";
import { type ActorRef, MemberTarget, sameActor, sameJson } from "../port.ts";
import { due } from "./lifecycle.ts";
import {
  type Admit,
  addressable,
  type AttemptLife,
  type LaneId,
  type LaneMember,
  LaneMove,
  Life,
  type Model,
  Obligation,
  type OpenTurn,
  Phase,
  type Refusal,
  sameLane,
} from "./lifecycle-model.ts";
import { Act, type Column, type HeadRow, type Rules, rules } from "./lifecycle-rules.ts";

const wl = (n: number) => `WriteLanes I${n}` as const;

/**
 * One fold result of a lane move: the next model and the refusals found.
 */
export type LaneStep = readonly [Model, ReadonlyArray<Refusal>];

// RETURN_TYPE: the fold's result is the named tuple; a literal would infer as an array.
const stepOf = (model: Model, refusals: ReadonlyArray<Refusal> = []): LaneStep => [model, refusals];

const MAX_WAITING = 64;

const headOf = (model: Model, lane: LaneId) =>
  Option.fromUndefinedOr(
    model.attempts.find((a) => sameLane(a.lane, lane) && addressable(a.phase)),
  );

const waitingOn = (model: Model, lane: LaneId) =>
  model.attempts.filter((a) => sameLane(a.lane, lane) && a.phase._tag === "Queued");

const pendingOn = (model: Model, attempt: string) =>
  model.obligations.filter(Obligation.$is("PendingCancel")).filter((o) => o.attempt === attempt);

const keptOn = (model: Model, lane: LaneId) =>
  model.endings.flatMap((ending, index) => {
    const life = model.attempts.find((a) => Option.contains(ending.attempt, a.id));
    const kept = ending.life._tag === "Kept" || ending.life._tag === "KeptOpen";

    return kept && life !== undefined && sameLane(life.lane, lane) ? [index] : [];
  });

// RETURN_TYPE: a commit's column is its concurrency, widened to the column union.
const columnOf = (member: LaneMember): Column => {
  switch (member.kind) {
    case "commit":
      return member.concurrency;
    case "retry":
      return "Retry";
    case "cancel":
      return "Cancel";
    case "cancelAll":
      return "CancelAll";
    case "release":
      return "Release";
  }
};

// RETURN_TYPE: a phase tag narrowed to the rows a head can be in.
const rowOf = (head: Option.Option<AttemptLife>): HeadRow =>
  Option.match(head, {
    onNone: () => "Idle",
    onSome: (life) =>
      life.phase._tag === "Queued" || life.phase._tag === "Gone" ? "Idle" : life.phase._tag,
  });

const guardOf = (model: Model, lane: LaneId, row: HeadRow, column: Column) => {
  const head = headOf(model, lane);

  if (row === "Idle" && column === "Cancel")
    return keptOn(model, lane).length > 0 ? "kept" : "none";

  const guarded =
    (row === "Unsent" && (column === "latest" || column === "cancel")) ||
    (row === "Restoring" && column === "cancel");

  if (!guarded || Option.isNone(head)) return "always";

  return pendingOn(model, head.value.id).length > 0 ? "pendingCancel" : "free";
};

/**
 * The cell of Table B a member reaches on one lane: the head's row, the member's column and the
 * guard's value.
 */
export const memberCell = (model: Model, lane: LaneId, member: LaneMember) => {
  const row = rowOf(headOf(model, lane));
  const column = columnOf(member);

  return { row, column, guard: guardOf(model, lane, row, column) };
};

/**
 * A guard value Table B has no cell for: a suite defect.
 */
export class MissingMemberCell extends Data.TaggedError("MissingMemberCell")<{
  readonly row: HeadRow;
  readonly column: Column;
  readonly guard: string;
}> {}

const lanesOf = (model: Model, actor: ActorRef, member: LaneMember) => {
  const keyless = { actor, operation: member.operation, key: Option.none() };

  return MemberTarget.$match(member.target, {
    Only: () => [keyless],
    Key: ({ key }) => [{ actor, operation: member.operation, key: Option.some(key) }],
    Every: () => {
      const lanes = model.attempts
        .map((a) => a.lane)
        .filter((l) => sameActor(l.actor, actor) && l.operation === member.operation)
        .filter((l, i, all) => all.findIndex((other) => sameLane(other, l)) === i);

      return lanes.length > 0 ? lanes : [keyless];
    },
    Nothing: () => (member.kind === "commit" ? [keyless] : []),
  });
};

const setPhase = (model: Model, attempt: string, phase: Phase) => ({
  ...model,
  attempts: model.attempts.map((a) => (a.id === attempt ? { ...a, phase } : a)),
});

const owing = (model: Model, obligations: ReadonlyArray<Obligation>) => ({
  ...model,
  obligations: [...model.obligations, ...obligations],
});

const onHead = (model: Model, lane: LaneId, change: (head: AttemptLife) => Model) =>
  Option.match(headOf(model, lane), { onNone: () => model, onSome: change });

const turnOf = (model: Model, change: (turn: OpenTurn) => OpenTurn) => ({
  ...model,
  turn: Option.map(model.turn, change),
});

const headAct = (
  model: Model,
  lane: LaneId,
  a: "Stay" | "PendingCancel" | "AwaitRelease" | "Interrupt",
) =>
  onHead(model, lane, (head) => {
    switch (a) {
      case "Stay":
        return model;
      case "PendingCancel":
        return pendingOn(model, head.id).length > 0
          ? model
          : owing(model, [Obligation.PendingCancel({ attempt: head.id, ends: "NotSent" })]);
      case "AwaitRelease":
        return owing(model, [
          Obligation.Await({ attempt: head.id, report: "Released", hearing: Option.none() }),
        ]);
      case "Interrupt":
        return setPhase(model, head.id, Phase.Interrupted());
    }
  });

const acted = (model: Model, lane: LaneId, a: Act) =>
  Act.$match(a, {
    Admit: ({ admit }) =>
      turnOf(model, (turn) => ({ ...turn, waiting: Option.some({ lane, admit }) })),
    Stay: () => model,
    Quiet: ({ invariant }) =>
      turnOf(model, (turn) => ({ ...turn, silent: [...turn.silent, { lane, invariant }] })),
    LetGo: () =>
      owing(
        model,
        keptOn(model, lane).map((ending) => Obligation.AwaitLetGo({ ending })),
      ),
    Resend: () =>
      onHead(model, lane, (head) => ({
        ...setPhase(model, head.id, Phase.Resending()),
        obligations: model.obligations.filter(
          (o) => !(Obligation.$is("Await")(o) && o.attempt === head.id && o.report === "Released"),
        ),
      })),
    PendingCancel: () => headAct(model, lane, "PendingCancel"),
    AwaitRelease: () => headAct(model, lane, "AwaitRelease"),
    Interrupt: () => headAct(model, lane, "Interrupt"),
    CancelAll: ({ head }) =>
      headAct(
        owing(
          model,
          waitingOn(model, lane).map((a) =>
            Obligation.Await({ attempt: a.id, report: "NotSentCancelled", hearing: Option.none() }),
          ),
        ),
        lane,
        head,
      ),
    Mark: () =>
      model.releasing.some((l) => sameLane(l, lane))
        ? model
        : { ...model, releasing: [...model.releasing, lane] },
  });

const applyMember = (model: Model, actor: ActorRef, member: LaneMember, given: Rules) =>
  lanesOf(model, actor, member).reduce((m, lane) => {
    const { row, column, guard } = memberCell(m, lane, member);
    const cell = given.tableB[row][column][guard];

    if (cell === undefined) throw new MissingMemberCell({ row, column, guard });

    return acted(m, lane, cell);
  }, model);

const isWaiting = (model: Model) =>
  Option.match(model.turn, { onNone: () => false, onSome: (t) => Option.isSome(t.waiting) });

// RETURN_TYPE: the function recurses, so its type cannot be inferred.
const proceed = (model: Model, given: Rules): Model =>
  Option.match(model.turn, {
    onNone: () => model,
    onSome: (turn) => {
      const [next, ...rest] = turn.rest;

      if (next === undefined || Option.isSome(turn.waiting)) return model;

      const moved = applyMember(
        turnOf(model, (t) => ({ ...t, rest })),
        turn.actor,
        next,
        given,
      );

      return isWaiting(moved) ? moved : proceed(moved, given);
    },
  });

const appended = (model: Model, attempt: string, lane: LaneId, phase: Phase) => ({
  ...model,
  attempts: [...model.attempts, { id: attempt, lane, phase }],
});

const supersede = (model: Model, attempt: Option.Option<AttemptLife>) =>
  Option.match(attempt, {
    onNone: () => model,
    onSome: ({ id }) =>
      owing(model, [
        Obligation.Await({ attempt: id, report: "Superseded", hearing: Option.none() }),
      ]),
  });

const replaceCancelled = (model: Model, head: AttemptLife) => {
  const kept =
    pendingOn(model, head.id).length > 0
      ? []
      : [Obligation.PendingCancel({ attempt: head.id, ends: "UnknownCancelled" })];

  return owing(setPhase(model, head.id, Phase.Gone({ why: "closed" })), kept);
};

const placed: Readonly<
  Record<
    Exclude<Admit, "Decline" | "Queue">,
    (model: Model, lane: LaneId) => readonly [Model, Phase]
  >
> = {
  Mint: (model) => [model, Phase.Unsent()],
  SupersedeHead: (model, lane) => [supersede(model, headOf(model, lane)), Phase.Queued()],
  SupersedeQueued: (model, lane) => [
    supersede(model, Option.fromUndefinedOr(waitingOn(model, lane).at(-1))),
    Phase.Queued(),
  ],
  Replace: (model, lane) => [
    onHead(model, lane, (head) => setPhase(model, head.id, Phase.Gone({ why: "evidence" }))),
    Phase.Unsent(),
  ],
  ReplaceCancelled: (model, lane) => [
    onHead(model, lane, (head) => replaceCancelled(model, head)),
    Phase.Unsent(),
  ],
};

const mintAs = (model: Model, attempt: string, lane: LaneId, admit: Admit) => {
  const refuse = (text: string) => stepOf(model, [{ invariant: wl(8), text }]);

  if (admit === "Decline")
    return refuse(`${lane.operation} minted ${attempt} on a busy reject lane`);

  if (admit === "Queue")
    return waitingOn(model, lane).length >= MAX_WAITING
      ? refuse(`${lane.operation} minted ${attempt} past ${MAX_WAITING} waiting`)
      : stepOf(appended(model, attempt, lane, Phase.Queued()));
  const [next, phase] = placed[admit](model, lane);

  return stepOf(appended(next, attempt, lane, phase));
};

const laterCommitOn = (turn: OpenTurn, lane: LaneId) =>
  turn.rest.some(
    (m) =>
      m.kind === "commit" &&
      m.operation === lane.operation &&
      MemberTarget.$match(m.target, {
        Only: () => Option.isNone(lane.key),
        Key: ({ key }) => Option.exists(lane.key, (k) => sameJson(key, k)),
        Every: () => false,
        Nothing: () => false,
      }),
  );

const minted = (model: Model, attempt: string, lane: LaneId, given: Rules) => {
  const refuse = (invariant: Refusal["invariant"], why: string) =>
    stepOf(model, [{ invariant, text: `${lane.operation} minted ${attempt} ${why}` }]);

  if (model.attempts.some((a) => a.id === attempt)) return refuse(wl(6), "a second time");

  if (Option.isNone(model.turn)) return refuse(wl(1), "outside a turn");
  const turn = model.turn.value;

  if (Option.isSome(turn.waiting) && sameLane(turn.waiting.value.lane, lane)) {
    const [next, refusals] = mintAs(model, attempt, lane, turn.waiting.value.admit);

    return refusals.length > 0 ? stepOf(next, refusals) : stepOf(admittedWith(next, given));
  }

  return laterCommitOn(turn, lane)
    ? refuse(wl(10), "before an earlier member's report")
    : refuse(wl(1), "with no commit member of its lane");
};

const admittedWith = (model: Model, given: Rules) =>
  proceed(
    turnOf(model, (t) => ({ ...t, waiting: Option.none() })),
    given,
  );

const NO_POLICY = ["Unencodable", "NoPersistence", "OldVersion", "ModuleDisabled"];

const declineAllowed = (model: Model, lane: LaneId, admit: Admit, reason: string) => {
  if (reason === "Rejected") return admit === "Decline";

  if (reason === "Overloaded")
    return admit === "Queue" && waitingOn(model, lane).length >= MAX_WAITING;

  if (reason === "Disposed") return model.mode === "disposing";

  return NO_POLICY.includes(reason);
};

const decline = (model: Model, operation: string, actor: ActorRef, reason: string) => ({
  ...model,
  endings: [
    ...model.endings,
    {
      attempt: Option.none(),
      operation,
      actor,
      channel: "failure" as const,
      reason,
      incarnation: model.actors.find((a) => sameActor(a.actor, actor))?.incarnation ?? 0,
      inDisposal: model.mode === "disposing",
      life: Life.Owed(),
    },
  ],
});

const declined = (
  model: Model,
  operation: string,
  actor: ActorRef,
  reason: string,
  given: Rules,
) => {
  const refuse = (invariant: Refusal["invariant"], why: string) =>
    stepOf(model, [{ invariant, text: `${operation} declined ${reason} ${why}` }]);

  if (Option.isNone(model.turn))
    return refuse(wl(15), "outside a turn, an ending no commit owes (R7, R10)");
  const turn = model.turn.value;
  const ours = (lane: LaneId) => sameActor(lane.actor, actor) && lane.operation === operation;

  if (Option.isSome(turn.waiting) && ours(turn.waiting.value.lane)) {
    const { lane, admit } = turn.waiting.value;

    return declineAllowed(model, lane, admit, reason)
      ? stepOf(admittedWith(decline(model, operation, actor, reason), given))
      : refuse(wl(8), `where its lane admits ${admit}`);
  }

  const silent = turn.silent.find((s) => ours(s.lane));

  return silent === undefined
    ? refuse(wl(15), "with no commit member, an ending no commit owes (R7, R10)")
    : refuse(silent.invariant, "after a member that owes no ending");
};

const closed = (model: Model, given: Rules) => {
  const late =
    Option.isSome(model.turn) &&
    Option.isSome(model.turn.value.waiting) &&
    given.deadlines.Commit.by === "TurnCloses"
      ? [
          {
            invariant: given.deadlines.Commit.invariant,
            text: "a commit had no mint or decline by its turn's close",
          },
        ]
      : [];

  const [after, owed] = due({ ...model, turn: Option.none() }, "TurnCloses", given);

  return stepOf(after, [...late, ...owed]);
};

const opened = (
  model: Model,
  actor: ActorRef,
  members: ReadonlyArray<LaneMember>,
  given: Rules,
) => {
  const [open, late] = Option.isSome(model.turn) ? closed(model, given) : stepOf(model);

  const turn: OpenTurn = { actor, waiting: Option.none(), rest: members, silent: [] };

  return stepOf(proceed({ ...open, turn: Option.some(turn) }, given), late);
};

/**
 * Applies one {@link LaneMove} by Table B: a turn opens and applies its members in action order,
 * each to the lane its previous member left (WriteLanes I10); a commit waits for its report.
 *
 * **Details**
 *
 * - `Turn`: closes any open turn, then applies members until the first commit.
 * - `Minted`: the waiting commit's Attempt; then the members after it.
 * - `Declined`: the waiting commit's decline, or a refusal by the lane's Idle cancel. A decline
 *   is allowed only for `Rejected` where the lane declines, `Overloaded` past 64 waiting,
 *   `Disposed` while the Runtime disposes, or a reason no policy gives (`Unencodable`,
 *   `NoPersistence`, `OldVersion`, `ModuleDisabled`); any other is WriteLanes I8.
 * - `TurnCloses`: a commit still waiting is refused, then the turn's obligations are due.
 * - A member with no lane (`Every` on an operation with none, or a commit whose key did not
 *   encode) acts on the operation's key-less lane, which is Idle, so its decline is judged.
 *
 * **Gotchas**
 *
 * - A refused move leaves the model where it was, so a refused mint is never minted.
 */
export const applyLane = (model: Model, move: LaneMove, given: Rules = rules) =>
  LaneMove.$match(move, {
    Turn: ({ actor, members }) => opened(model, actor, members, given),
    Minted: ({ attempt, lane }) => minted(model, attempt, lane, given),
    Declined: ({ operation, actor, reason }) => declined(model, operation, actor, reason, given),
    TurnCloses: () => closed(model, given),
  });
