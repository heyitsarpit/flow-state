import { Option, Result, Schema } from "effect";
import { Operation, type Values } from "./compiled.ts";
import { Evidence, type Member, MemberTarget } from "./evidence.ts";
import { LaneView } from "./turn.ts";
import { isInFlight, pick, type Tx, without, withEntry } from "./tx.ts";
import { isDecline } from "./vocabulary.ts";
import {
  type ActorId,
  Command,
  type Ending,
  type Incarnation,
  type Lane,
  Phase,
  type CallId,
  laneId,
} from "./world.ts";
import type { Persistence } from "./persist.ts";

/**
 * Lane members and their lanes (WriteLanes R5 to R9, R14): commit, retry, cancel, lookup, and the invocations a turn owes.
 */
export const makeLanes = (tx: Tx, persistence: Persistence) => {
  const { persisted, incarnationOf, lanesOf, endingMail } = tx;
  const { persist, actorWrite, laneWrite, setLane, dropLane } = persistence;

  const invoke = (lane: Lane) => {
    const call = tx.mint<CallId>("call");
    const resend = lane.head.sent;

    const head = {
      ...lane.head,
      sent: true,
      retryCount: lane.head.retryCount + (resend ? 1 : 0),
      phase: Phase.OnWire({ call, cancelled: false }),
    };

    setLane({ ...lane, head });
    tx.emit(Evidence.Sent({ operation: lane.operation, attempt: head.id }));
    tx.command(
      Command.Invoke({
        call,
        machine: lane.actor.machine,
        operation: lane.operation,
        input: head.input,
        attempt: Option.some({
          id: head.id,
          key: lane.key,
          retryCount: head.retryCount,
          mayHaveApplied: head.mayHaveApplied,
        }),
      }),
    );
  };

  const decline = (
    actor: ActorId,
    operation: string,
    why: string,
    owner: number,
    lane: Option.Option<string>,
  ) =>
    endingMail(actor, {
      operation,
      attempt: Option.none(),
      lane,
      channel: "failure",
      reason: why,
      value: { why },
      owner,
      current: true,
      redelivered: false,
      parked: false,
    });

  // ── members.
  // RETURN_TYPE: both branches build one MemberTarget variant each; the union is the contract.
  const memberTarget = (key: Option.Option<Values>): MemberTarget =>
    Option.match(key, {
      onNone: () => MemberTarget.Nothing(),
      onSome: (k) => MemberTarget.Key({ key: k }),
    });

  const laneAt = (actor: ActorId, operation: string, keyText: string) =>
    tx.world().lanes.get(laneId(actor, operation, keyText));

  const keyTextOf = (operation: Operation, key: Values) =>
    Result.getSuccess(Schema.encodeUnknownResult(operation.key)(pick(key, operation.keyFields)));

  const commit = (incarnation: Incarnation, operation: Operation, input: Values, owner: number) => {
    const key = pick(input, operation.keyFields);

    const member: Member = {
      operation: operation.name,
      kind: "commit",
      target: MemberTarget.Key({ key }),
    };

    const text = keyTextOf(operation, key);

    if (Option.isNone(text)) {
      decline(incarnation.actor, operation.name, "Unencodable", owner, Option.none());

      return member;
    }

    const id = laneId(incarnation.actor, operation.name, text.value);

    if (tx.world().lanes.has(id) || tx.world().parked.get(id)?.kept === true) {
      decline(incarnation.actor, operation.name, "Rejected", owner, Option.some(id));

      return member;
    }

    if (tx.machines.get(incarnation.actor.machine)?.persist === true && !tx.world().persistence) {
      decline(incarnation.actor, operation.name, "NoPersistence", owner, Option.none());

      return member;
    }

    const attempt = tx.mint("att");
    tx.emit(Evidence.Minted({ operation: operation.name, attempt, actor: incarnation.actor, key }));

    const lane: Lane = {
      id,
      actor: incarnation.actor,
      operation: operation.name,
      key,
      keyText: text.value,
      head: {
        id: attempt,
        input,
        retryCount: 0,
        mayHaveApplied: false,
        sent: false,
        owner,
        phase: Phase.Ready(),
      },
    };

    setLane(lane);

    return member;
  };

  const laneFor = (
    incarnation: Incarnation,
    operation: Operation,
    key: Option.Option<Values>,
    own: Option.Option<string>,
  ) =>
    Option.match(key, {
      onNone: () => Option.flatMap(own, (id) => Option.fromUndefinedOr(tx.world().lanes.get(id))),
      onSome: (k) =>
        Option.flatMap(keyTextOf(operation, k), (text) =>
          Option.fromUndefinedOr(laneAt(incarnation.actor, operation.name, text)),
        ),
    });

  const retry = (
    incarnation: Incarnation,
    operation: Operation,
    key: Option.Option<Values>,
    own: Option.Option<string>,
    owner: number,
  ) => {
    const lane = laneFor(incarnation, operation, key, own);

    const target = Option.isSome(key)
      ? memberTarget(key)
      : memberTarget(Option.map(lane, (l) => l.key));

    Option.match(lane, {
      onNone: () =>
        tx.emit(
          Evidence.Lane({
            kind: "NothingToResend",
            operation: operation.name,
            attempt: Option.none(),
          }),
        ),
      onSome: (l) => {
        if (isInFlight(l)) {
          tx.emit(
            Evidence.Lane({
              kind: "InFlight",
              operation: operation.name,
              attempt: Option.some(l.head.id),
            }),
          );

          return;
        }

        setLane({ ...l, head: { ...l.head, owner, phase: Phase.Ready() } });
      },
    });

    return { operation: operation.name, kind: "retry", target } satisfies Member;
  };

  const releaseLane = (lane: Lane) => {
    tx.emit(
      Evidence.Lane({
        kind: "Released",
        operation: lane.operation,
        attempt: Option.some(lane.head.id),
      }),
    );
    dropLane(lane);
  };

  const cancelWrite = (lane: Lane) =>
    Phase.$match(lane.head.phase, {
      OnWire: ({ call }) => {
        tx.command(Command.Interrupt({ call }));
        setLane({
          ...lane,
          head: { ...lane.head, phase: Phase.OnWire({ call, cancelled: true }) },
        });
      },
      Held: () => releaseLane(lane),
      Ready: () => (lane.head.sent ? releaseLane(lane) : neverSent(lane)),
      Recapturing: () => releaseLane(lane),
      Acknowledging: () => neverSent(lane),
    });

  const neverSent = (lane: Lane) => {
    tx.set({ ...tx.world(), lanes: without(tx.world().lanes, lane.id) });
    persist(lane.actor, [laneWrite(lane, true)], Option.none());
    endingMail(lane.actor, {
      operation: lane.operation,
      attempt: Option.some(lane.head.id),
      lane: Option.none(),
      channel: "failure",
      reason: "Cancelled",
      value: { why: "Cancelled" },
      owner: lane.head.owner,
      current: true,
      redelivered: false,
      parked: false,
    });
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
        const lane = laneFor(incarnation, operation, key, own);
        Option.match(lane, { onNone: () => undefined, onSome: cancelWrite });

        return {
          operation: operation.name,
          kind: "cancel",
          target: Option.isSome(key)
            ? memberTarget(key)
            : memberTarget(Option.map(lane, (l) => l.key)),
        } satisfies Member;
      },
    });

  const lookup = (incarnation: Incarnation, operation: Operation, input: Values, owner: number) => {
    for (const [call, read] of tx.world().reads)
      if (read.incarnation === incarnation.id && read.operation === operation.name) {
        tx.set({ ...tx.world(), reads: without(tx.world().reads, call) });
        tx.command(Command.Interrupt({ call }));
        tx.emit(
          Evidence.Lane({ kind: "Superseded", operation: operation.name, attempt: Option.none() }),
        );
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
      Command.Invoke({
        call,
        machine: incarnation.actor.machine,
        operation: operation.name,
        input,
        attempt: Option.none(),
      }),
    );
  };

  // ── after a turn: lanes minted or owed a re-send become acknowledgements, captures or invocations.
  const flushLanes = (actor: ActorId) => {
    const incarnation = incarnationOf(actor);
    const writes = Option.toArray(Option.flatMap(Option.fromUndefinedOr(incarnation), actorWrite));

    for (const lane of lanesOf(actor)) {
      if (!Phase.$is("Ready")(lane.head.phase)) continue;

      if (!persisted(actor)) {
        invoke(lane);
        continue;
      }

      const ticket = persist(
        actor,
        [...writes, laneWrite(lane, false)],
        Option.some({ attempt: lane.head.id, purpose: lane.head.sent ? "capture" : "acknowledge" }),
      );

      Option.match(ticket, {
        onNone: () => invoke(lane),
        onSome: (t) =>
          setLane({
            ...lane,
            head: {
              ...lane.head,
              phase: lane.head.sent
                ? Phase.Recapturing({ ticket: t })
                : Phase.Acknowledging({ ticket: t }),
            },
          }),
      });
    }
  };

  /**
   * Applies an admitted ending to its lane (WriteLanes R2, R4, R8) and returns it as the Attempt
   * delivers it: a definite failure after an unknown send is unknown `StillUnknown`.
   */
  // RETURN_TYPE: the ending as the Attempt delivers it, possibly rewritten to StillUnknown.
  const admitToLane = (ending: Ending): Ending => {
    const lane = Option.flatMap(ending.lane, (id) =>
      Option.fromUndefinedOr(tx.world().lanes.get(id)),
    );

    if (
      Option.isNone(lane) ||
      Option.isNone(ending.attempt) ||
      lane.value.head.id !== ending.attempt.value
    )
      return ending;
    const l = lane.value;

    if (ending.channel === "failure" && l.head.mayHaveApplied && !isDecline(ending.reason)) {
      setLane({ ...l, head: { ...l.head, phase: Phase.Held() } });

      return { ...ending, channel: "unknown", reason: "StillUnknown" };
    }

    if (ending.channel === "unknown") {
      setLane({ ...l, head: { ...l.head, mayHaveApplied: true, phase: Phase.Held() } });
      persist(
        l.actor,
        [
          laneWrite(
            { ...l, head: { ...l.head, mayHaveApplied: true, phase: Phase.Held() } },
            false,
          ),
        ],
        Option.none(),
      );

      return ending;
    }

    dropLane(l);

    return ending;
  };

  const viewOf =
    (incarnation: Incarnation, own: Option.Option<string>) =>
    (operation: string, key: Option.Option<Values>) => {
      const op = tx.machines.get(incarnation.actor.machine)?.operations.get(operation);

      if (op === undefined) return LaneView.Idle();

      return Option.match(laneFor(incarnation, op, key, own), {
        onNone: () => LaneView.Idle(),
        onSome: (l) =>
          isInFlight(l) ? LaneView.InFlight() : LaneView.Held({ retryCount: l.head.retryCount }),
      });
    };

  return {
    invoke,
    decline,
    memberTarget,
    laneAt,
    keyTextOf,
    commit,
    laneFor,
    retry,
    releaseLane,
    cancelWrite,
    neverSent,
    cancel,
    lookup,
    flushLanes,
    admitToLane,
    viewOf,
  };
};

/**
 * Lane members and their lanes.
 */
export type LaneSteps = ReturnType<typeof makeLanes>;
