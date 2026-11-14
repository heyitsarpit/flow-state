import { Option, Result, Schema } from "effect";
import { Cue, LaneState } from "./cells.ts";
import { Operation, type Values } from "./compiled.ts";
import { Act, evidenceOf } from "./evidence-of.ts";
import { type Member, MemberTarget } from "./evidence.ts";
import { type At, keyTextOf, makeMoves, onWireAs, awaits } from "./lane-moves.ts";
import { Audience, keptOn, type LedgerSteps } from "./ledger.ts";
import { LaneView } from "./turn.ts";
import { isInFlight, pick, type Tx, without, withEntry } from "./tx.ts";
import type { Channel } from "./vocabulary.ts";
import { type ActorId, type CallId, Command, type Incarnation, laneId } from "./world.ts";
import type { Persistence } from "./persist.ts";

/**
 * Write lanes as one table: each member, turn end, answer, admitted or kept ending and disposal
 * is a cue; the table's move is applied here and its reports derived by `evidenceOf`. Lookups
 * and the guards' lane view live here too.
 */
export const makeLanes = (tx: Tx, persistence: Persistence, ledger: LedgerSteps) => {
  const { lanesOf } = tx;
  const { operationOf, atOf, report, apply } = makeMoves(tx, persistence, ledger);

  const idFor = (
    incarnation: Incarnation,
    operation: Operation,
    key: Option.Option<Values>,
    own: Option.Option<string>,
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
    own: Option.Option<string>,
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
          { id: "", actor, operation: operation.name, key: {} },
          LaneState.Idle(),
          cue,
          tx.commandCount(),
        ),
      onSome: (a) => void apply(a, cue),
    });

  // A commit declined before its lane's table: no Attempt, no lane, one owed row.
  const decline = (actor: ActorId, operation: string, why: string, owner: number) =>
    void ledger.owe({
      actor,
      to: Audience.Identity(),
      operation,
      attempt: Option.none(),
      lane: Option.none(),
      channel: "failure",
      reason: why,
      value: { why },
      owner,
      current: true,
    });

  const commit = (incarnation: Incarnation, operation: Operation, input: Values, owner: number) => {
    const key = pick(input, operation.keyFields);

    const member: Member = {
      operation: operation.name,
      kind: "commit",
      target: MemberTarget.Key({ key }),
    };

    const text = keyTextOf(operation, key);
    const encodes = Result.isSuccess(Schema.encodeUnknownResult(operation.inputJson)(input));

    // An input or key with no encoded form, or a persisted identity in a Runtime without
    // persistence, declines before the lane's table: nothing is sent or saved.
    if (Option.isNone(text) || !encodes) {
      decline(incarnation.actor, operation.name, "Unencodable", owner);

      return member;
    }

    if (tx.machines.get(incarnation.actor.machine)?.persist === true && !tx.world().persistence) {
      decline(incarnation.actor, operation.name, "NoPersistence", owner);

      return member;
    }

    const id = laneId(incarnation.actor, operation.name, text.value);

    // A Kept row on the key declines the commit before the table, which reads no row.
    if (keptOn(tx.world().owed, incarnation.actor, id)) {
      decline(incarnation.actor, operation.name, "Rejected", owner);

      return member;
    }

    // Only reject concurrency is built: every commit meets the table as a reject commit.
    apply(
      { id, actor: incarnation.actor, operation: operation.name, key },
      Cue.CommitReject({ input, owner }),
    );

    return member;
  };

  const retry = (
    incarnation: Incarnation,
    operation: Operation,
    key: Option.Option<Values>,
    own: Option.Option<string>,
    owner: number,
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
    own: Option.Option<string>,
  ) =>
    Operation.$match(operation, {
      Read: () => {
        for (const [call, read] of tx.world().reads)
          if (read.incarnation === incarnation.id && read.operation === operation.name) {
            tx.set({ ...tx.world(), reads: without(tx.world().reads, call) });
            tx.command(Command.Interrupt({ call }));
          }

        return {
          operation: operation.name,
          kind: "cancel",
          target: MemberTarget.Only(),
        } satisfies Member;
      },
      Write: () => {
        const at = atFor(incarnation, operation, key, own);
        const target = targetOf(key, at);

        // A cancel on an Idle lane lets its Kept rows go.
        for (const a of Option.toArray(at))
          if (!tx.world().lanes.has(a.id)) ledger.letGoKept(incarnation.actor, a.id);

        applyNamed(operation, incarnation.actor, at, Cue.Cancel());

        return { operation: operation.name, kind: "cancel", target } satisfies Member;
      },
    });

  const lookup = (incarnation: Incarnation, operation: Operation, input: Values, owner: number) => {
    for (const [call, read] of tx.world().reads)
      if (read.incarnation === incarnation.id && read.operation === operation.name) {
        tx.set({ ...tx.world(), reads: without(tx.world().reads, call) });
        tx.command(Command.Interrupt({ call }));

        for (const e of evidenceOf(Act.ReadReplaced({ operation: operation.name }))) tx.emit(e);
      }

    const call = tx.mint<CallId>("call");
    tx.set({
      ...tx.world(),
      reads: withEntry(tx.world().reads, call, {
        call,
        actor: incarnation.actor,
        incarnation: incarnation.id,
        operation: operation.name,
        owner,
      }),
    });
    tx.command(
      Command.Lookup({
        call,
        machine: incarnation.actor.machine,
        operation: operation.name,
        input,
      }),
    );
  };

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
    for (const [id, lane] of tx.world().lanes)
      if (onWireAs(lane, call)) apply(atOf(id, lane), Cue.Answered(settled));
  };

  /**
   * Applies a store's answer to every lane whose head awaits its ticket.
   */
  const answer = (ticket: string, landed: boolean) => {
    for (const [id, lane] of tx.world().lanes)
      if (awaits(lane, ticket)) apply(atOf(id, lane), landed ? Cue.Stored() : Cue.Refused());
  };

  /**
   * Applies a disposal cue to every lane.
   */
  const everyLane = (cue: Cue) => {
    for (const [id, lane] of tx.world().lanes) apply(atOf(id, lane), cue);
  };

  const viewOf =
    (incarnation: Incarnation, own: Option.Option<string>) =>
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

  return {
    commit,
    retry,
    cancel,
    lookup,
    flushLanes,
    settle,
    answer,
    everyLane,
    viewOf,
  };
};

/**
 * Write lanes as one table.
 */
export type LaneSteps = ReturnType<typeof makeLanes>;
