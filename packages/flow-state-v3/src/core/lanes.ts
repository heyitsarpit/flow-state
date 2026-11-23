import { Option, Result } from "effect";
import { Cue, LaneState, Move } from "./cells.ts";
import { type Concurrency, Operation, type ReadWrite, type Values } from "./compiled.ts";
import type { EntrySteps } from "./entries.ts";
import { type Member, MemberTarget } from "./evidence.ts";
import { type At, keyTextOf, makeMoves, onWireAs, awaits } from "./lane-moves.ts";
import { keptOn, type LedgerSteps, Route } from "./ledger.ts";
import { LaneView, Resolved } from "./turn.ts";
import type { Turn } from "./walk.ts";
import { isInFlight, pick, type Tx } from "./tx.ts";
import type { Channel, Decline } from "./vocabulary.ts";
import {
  type ActorId,
  actorKey,
  type AttemptId,
  type CallId,
  type CarriedPart,
  type Incarnation,
  laneId,
  type LaneId,
  OwnedBy,
  Phase,
  Quarantine,
} from "./world.ts";
import { type Persistence, workKey } from "./persist.ts";
import { LOCAL_PREFIX } from "./identity.ts";

// A commit's cue by its operation's concurrency policy.
const commitCue = {
  reject: Cue.CommitReject,
  latest: Cue.CommitLatest,
  serialize: Cue.CommitSerialize,
  cancel: Cue.CommitCancel,
} as const satisfies Record<Concurrency, (commit: { input: Values; owner: OwnedBy }) => Cue>;

// A write's policy; a read never commits, so it has none of its own.
const policyOf = (operation: Operation) =>
  Operation.$is("Write")(operation) ? operation.concurrency : "reject";

/**
 * Write lanes as one table: each member, turn end, answer, admitted or kept ending and disposal
 * is a cue; the table's move is applied here and its reports derived by `evidenceOf`. Lookups
 * and the guards' lane view live here too.
 */
export const makeLanes = (
  tx: Tx,
  persistence: Persistence,
  ledger: LedgerSteps,
  entries: EntrySteps,
) => {
  const { lanesOf } = tx;

  const moves = makeMoves(tx, persistence, ledger);
  const { operationOf, atOf, report, applyDisplaced, endQueue } = moves;

  // A cue on a lane. The head's Attempt moves its optimistic updates as it goes: by its answer's
  // channel and reason, or removed when a cancel interrupts it, or it is displaced, replaced or
  // ended unsent.
  // RETURN_TYPE: the move the table chose, which an admitted ending reads.
  const apply = (at: At, cue: Cue): Move => {
    const head = tx.world().lanes.get(at.id)?.head;
    const move = moves.apply(at, cue);

    if (head === undefined) return move;
    const before = head.id;

    if (Move.$is("Answer")(move)) {
      entries.attemptEnded(before, move.channel, move.reason);

      if (move.channel === "success")
        for (const op of Option.toArray(operationOf(at.actor, at.operation)))
          entries.succeeded(at.actor, op, head, move.value);
    } else if (Move.$is("Interrupt")(move) || tx.world().lanes.get(at.id)?.head.id !== before)
      entries.attemptEnded(before, "notSent", "Cancelled");

    return move;
  };

  // A head promoted outside a turn waits for no turn's end: it is acknowledged or sent at once.
  const sendPromoted = (id: LaneId) => {
    const lane = tx.world().lanes.get(id);

    if (lane !== undefined && Phase.$is("Unsent")(lane.head.phase))
      apply(atOf(id, lane), Cue.TurnEnded());
  };

  const idFor = (
    incarnation: Incarnation,
    operation: Operation,
    key: Option.Option<Values>,
    own: Option.Option<LaneId>,
  ) => {
    // An unkeyed operation has one lane, which a key-less member names wherever it runs.
    const named = Option.isSome(key) || operation.keyFields.length === 0;

    return named
      ? Option.map(
          keyTextOf(
            operation,
            Option.getOrElse(key, () => ({})),
          ),
          (text) => laneId(incarnation.actor, operation.name, text),
        )
      : Option.filter(own, (id) => tx.world().lanes.get(id)?.operation === operation.name);
  };

  const atFor = (
    incarnation: Incarnation,
    operation: Operation,
    key: Option.Option<Values>,
    own: Option.Option<LaneId>,
  ) =>
    Option.map(idFor(incarnation, operation, key, own), (id) => {
      const lane = tx.world().lanes.get(id);

      return lane === undefined
        ? {
            id,
            actor: incarnation.actor,
            operation: operation.name,
            key: Option.getOrElse(key, () => ({})),
          }
        : atOf(id, lane);
    });

  // RETURN_TYPE: both branches build one MemberTarget variant each; the union is the contract.
  const targetOf = (key: Option.Option<Values>, at: Option.Option<At>): MemberTarget => {
    if (Option.isSome(key)) return MemberTarget.Key({ key: key.value });

    return Option.match(
      Option.filter(at, (a) => tx.world().lanes.has(a.id)),
      {
        onNone: () => MemberTarget.Nothing(),
        onSome: (a) => MemberTarget.Key({ key: a.key }),
      },
    );
  };

  // A member whose lane cannot be named acts on no lane: Idle's cell, with its reports.
  const applyNamed = (operation: Operation, actor: ActorId, at: Option.Option<At>, cue: Cue) =>
    Option.match(at, {
      onNone: () =>
        report(
          { actor, operation: operation.name, key: Option.none() },
          LaneState.Idle(),
          cue,
          tx.commandCount(),
          LaneState.Idle(),
        ),
      onSome: (a) => void apply(a, cue),
    });

  // A commit declined before its lane's table: no Attempt, no lane, one owed row.
  const decline = (actor: ActorId, operation: string, why: Decline, input: Values) =>
    void ledger.owe({
      actor,
      life: Option.none(),
      operation,
      input: Option.some(input),
      attempt: Option.none(),
      lane: Option.none(),
      channel: "notSent",
      reason: why,
      value: { why },
      route: Route.Current(),
    });

  const carriedOf = (actor: ActorId) => tx.world().carried.get(actorKey(actor)) ?? [];

  const holds = (part: CarriedPart, operation: string, text: string) =>
    Option.exists(part.held, (h) => h.operation === operation && h.keyText === text);

  // Whether a carried part holds an identity's lane key.
  const carriedOn = (actor: ActorId, operation: string, text: string) =>
    carriedOf(actor).some((part) => holds(part, operation, text));

  const commit = (
    incarnation: Incarnation,
    operation: Operation,
    given: Values,
    owner: OwnedBy,
    optimistic: ReadonlyArray<ReadWrite> = [],
  ) => {
    const input = tx.env.admit(given);
    const key = pick(input, operation.keyFields);

    const member: Member = {
      operation: operation.name,
      kind: "commit",
      target: MemberTarget.Key({ key }),
    };

    const text = keyTextOf(operation, key);

    // An input its Schema cannot encode, or one whose JSON has no canonical form (a -0, a lone
    // surrogate, a cycle), declines here: its lane's record could never be saved. The text is
    // kept by the input, so the lane's record reuses it.
    const encodes = Result.isSuccess(operation.walk.input.text(input));

    // An input or key with no encoded form, or a persisted identity in a Runtime without
    // persistence, declines before the lane's table: nothing is sent or saved.
    if (Option.isNone(text) || !encodes) {
      decline(incarnation.actor, operation.name, "Unencodable", input);

      return member;
    }

    // A local actor never persists, so it has nothing to decline for.
    if (
      tx.machines.get(incarnation.actor.machine)?.persist === true &&
      !tx.world().persistence &&
      !incarnation.actor.name.startsWith(LOCAL_PREFIX)
    ) {
      decline(incarnation.actor, operation.name, "NoPersistence", input);

      return member;
    }

    const id = laneId(incarnation.actor, operation.name, text.value);

    // A work record the boot kept unread cannot be written, so nothing new is acknowledged on it.
    if (
      Option.exists(
        Option.fromUndefinedOr(tx.world().quarantined.get(workKey(incarnation.actor))),
        Quarantine.$is("Kept"),
      )
    ) {
      decline(incarnation.actor, operation.name, "StorageRefused", input);

      return member;
    }

    // A carried lane, which the boot could not read, still holds its key until a cancel clears it.
    if (carriedOn(incarnation.actor, operation.name, text.value)) {
      decline(incarnation.actor, operation.name, "Rejected", input);

      return member;
    }

    // A Kept row on the key declines the commit before the table, which reads no row; under the
    // cancel policy the newer commit wins, so the lane's Kept rows are let go instead.
    if (keptOn(tx.world().owed, incarnation.actor, id)) {
      if (policyOf(operation) !== "cancel") {
        decline(incarnation.actor, operation.name, "Rejected", input);

        return member;
      }

      ledger.letGoKept(incarnation.actor, id);
    }

    const before = tx.world().lanes.get(id)?.head.id;

    apply(
      { id, actor: incarnation.actor, operation: operation.name, key },
      commitCue[policyOf(operation)]({ input, owner }),
    );
    layered(id, Option.fromUndefinedOr(before), optimistic);

    return member;
  };

  // A commit that minted its Attempt applies its optimistic changes on the reads they name.
  const layered = (
    id: LaneId,
    before: Option.Option<AttemptId>,
    optimistic: ReadonlyArray<ReadWrite>,
  ) => {
    const minted = Option.filter(
      Option.fromUndefinedOr(tx.world().lanes.get(id)?.head.id),
      (attempt) => !Option.contains(before, attempt),
    );

    for (const attempt of Option.toArray(minted)) entries.layer(attempt, optimistic);
  };

  const retry = (
    incarnation: Incarnation,
    operation: Operation,
    key: Option.Option<Values>,
    own: Option.Option<LaneId>,
    owner: OwnedBy,
  ) => {
    const at = atFor(incarnation, operation, key, own);
    const target = targetOf(key, at);
    applyNamed(operation, incarnation.actor, at, Cue.Retry({ owner }));

    return { operation: operation.name, kind: "retry", target } satisfies Member;
  };

  const cancel = (
    incarnation: Incarnation,
    operation: Operation,
    key: Option.Option<Values>,
    own: Option.Option<LaneId>,
  ) =>
    Operation.$match(operation, {
      Read: () => {
        entries.cancel(incarnation, operation.name);

        return {
          operation: operation.name,
          kind: "cancel",
          target: MemberTarget.Only(),
        } satisfies Member;
      },
      Write: () => {
        const at = atFor(incarnation, operation, key, own);
        const target = targetOf(key, at);

        // A cancel on an Idle lane lets its Kept rows go, and lets go of a carried lane on its
        // key: the step writes the work record without it.
        for (const a of Option.toArray(at))
          if (!tx.world().lanes.has(a.id)) {
            ledger.letGoKept(incarnation.actor, a.id);

            for (const text of Option.toArray(keyTextOf(operation, a.key)))
              if (carriedOn(incarnation.actor, operation.name, text)) {
                tx.put(
                  "carried",
                  actorKey(incarnation.actor),
                  carriedOf(incarnation.actor).filter((c) => !holds(c, operation.name, text)),
                );
                persistence.saveWork(incarnation.actor);
              }
          }

        applyNamed(operation, incarnation.actor, at, Cue.Cancel());

        return { operation: operation.name, kind: "cancel", target } satisfies Member;
      },
    });

  /**
   * After a turn: each of the identity's lanes hears that its turn ended.
   */
  const flushLanes = (actor: ActorId) => {
    for (const [id, lane] of lanesOf(actor)) apply(atOf(id, lane), Cue.TurnEnded());
  };

  /**
   * Applies a call's classified result to the lane whose head it is on the wire for, in the step
   * it settles: from then on the ending is an owed row.
   */
  const settle = (
    call: CallId,
    settled: {
      readonly channel: Channel;
      readonly reason: string;
      // FLOW_STATE_ALLOW_UNKNOWN: a call's value is the contract's own, mapped when its row is heard.
      readonly value: unknown;
    },
  ) => {
    if (applyDisplaced(call, Cue.Answered(settled))) return;

    for (const [id, lane] of Option.toArray(tx.laneWaiting(call)))
      if (onWireAs(lane, call)) {
        apply(atOf(id, lane), Cue.Answered(settled));
        sendPromoted(id);
      }
  };

  /**
   * A commit on the wire reported how far it got: its lane's head keeps the value until the
   * Attempt leaves the head. A report from a call that is no head's on the wire changes nothing.
   */
  // FLOW_STATE_ALLOW_UNKNOWN: a progress value has the type its contract's progress Schema decodes.
  const progressed = (call: CallId, value: unknown) => {
    for (const [id, lane] of Option.toArray(tx.laneWaiting(call)))
      if (onWireAs(lane, call))
        persistence.sendLane(id, {
          ...lane,
          head: { ...lane.head, progress: Option.some(value) },
        });
  };

  /**
   * Applies a store's answer to every lane whose head awaits its ticket, or to the displaced head
   * that awaits it.
   */
  const answer = (ticket: string, landed: boolean) => {
    const cue = landed ? Cue.Stored() : Cue.Refused();

    if (applyDisplaced(ticket, cue)) return;

    for (const [id, lane] of Option.toArray(tx.laneWaiting(ticket)))
      if (awaits(lane, ticket)) {
        apply(atOf(id, lane), cue);
        sendPromoted(id);
      }
  };

  /**
   * Applies a disposal cue to every lane and every displaced head. When the disposal starts, every
   * queued commit first ends NotSent Disposed, so nothing is promoted.
   */
  const everyLane = (cue: Cue) => {
    if (Cue.$is("DisposalStarts")(cue))
      for (const [id, lane] of tx.world().lanes) endQueue(atOf(id, lane), "Disposed");

    for (const [id, lane] of tx.world().lanes) apply(atOf(id, lane), cue);

    for (const key of tx.world().displaced.keys()) applyDisplaced(key, cue);
  };

  const viewOf =
    (incarnation: Incarnation, own: Option.Option<LaneId>) =>
    (operation: string, key: Option.Option<Values>) =>
      Option.match(
        Option.flatMap(operationOf(incarnation.actor, operation), (op) =>
          Option.flatMap(idFor(incarnation, op, key, own), (id) =>
            Option.fromUndefinedOr(tx.world().lanes.get(id)),
          ),
        ),
        {
          onNone: () => LaneView.Idle(),
          onSome: (l) =>
            isInFlight(l) ? LaneView.InFlight() : LaneView.Held({ retryCount: l.head.retryCount }),
        },
      );

  /**
   * A turn's lane members in walk order, each owned by its part's scope: the activation of the
   * state the turn's move targets when it moves, its part's handler's otherwise, the root's at the
   * root. `own` is the lane an ending's turn acts on. Returns the members it ran, for the turn's
   * record.
   */
  const membersOf = (incarnation: Incarnation, turn: Turn, own: Option.Option<LaneId>) => {
    const compiled = tx.machines.get(incarnation.actor.machine);
    const ran: Array<Member> = [];

    const ownerOf = (path: string) =>
      Option.match(
        Option.fromUndefinedOr(
          incarnation.activations[(compiled?.states.get(path)?.depth ?? 0) - 1],
        ),
        { onNone: () => OwnedBy.Root(), onSome: (activation) => OwnedBy.State({ activation }) },
      );

    for (const part of turn.parts) {
      const owner = Option.match(turn.move, {
        onNone: () => (part.handler === "" ? OwnedBy.Root() : ownerOf(part.handler)),
        onSome: (move) => ownerOf(move.target),
      });

      for (const action of part.actions) {
        const operation = Resolved.$is("Send")(action)
          ? undefined
          : compiled?.operations.get(action.operation);

        if (operation !== undefined)
          ran.push(...memberOf(incarnation, operation, action, own, owner));
      }
    }

    return ran;
  };

  // One resolved action on its lane: a commit, retry or cancel is a member of the turn's record; a
  // lookup is a read; a send is no lane's.
  const memberOf = (
    incarnation: Incarnation,
    operation: Operation,
    action: Resolved,
    own: Option.Option<LaneId>,
    owner: OwnedBy,
  ) =>
    Resolved.$match(action, {
      Commit: ({ input, optimistic }) => [commit(incarnation, operation, input, owner, optimistic)],
      Retry: ({ key }) => [retry(incarnation, operation, tx.env.admit(key), own, owner)],
      Cancel: ({ key }) => [cancel(incarnation, operation, tx.env.admit(key), own)],
      Lookup: ({ input }) => {
        entries.lookup(incarnation, operation, input, owner);

        return [];
      },
      Refetch: () => {
        entries.refetch(incarnation, operation.name);

        return [];
      },
      Invalidate: ({ key }) => {
        entries.invalidate(operation, key);

        return [];
      },
      Clear: ({ key }) => {
        entries.clear(operation, key);

        return [];
      },
      Send: () => [],
    });

  return {
    membersOf,
    commit,
    retry,
    cancel,
    flushLanes,
    settle,
    progressed,
    answer,
    everyLane,
    viewOf,
  };
};

/**
 * Write lanes as one table.
 */
export type LaneSteps = ReturnType<typeof makeLanes>;
