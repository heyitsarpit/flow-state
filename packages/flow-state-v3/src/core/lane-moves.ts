import { Option, Result, Schema } from "effect";
import { type Cue, cell, LaneState, Move } from "./cells.ts";
import type { Operation, Values } from "./compiled.ts";
import { Act, evidenceOf } from "./evidence-of.ts";
import { Audience, type LedgerSteps } from "./ledger.ts";
import { type Machines, pick, ROOT_ACTIVATION, type Tx } from "./tx.ts";
import {
  type ActorId,
  type CallId,
  Command,
  Disposal,
  Due,
  type Lane,
  Phase,
  sentBefore,
} from "./world.ts";
import type { Persistence } from "./persist.ts";

/**
 * A lane's key text: its operation's key fields of a value, encoded; `None` when they have no
 * encoded form.
 */
export const keyTextOf = (operation: Operation, value: Values) =>
  Result.getSuccess(Schema.encodeUnknownResult(operation.key)(pick(value, operation.keyFields)));

/**
 * The key text a lane is kept under, derived from its head's input.
 */
export const laneKeyText = (machines: Machines, lane: Lane) =>
  Option.flatMap(
    Option.fromUndefinedOr(machines.get(lane.actor.machine)?.operations.get(lane.operation)),
    (operation) => keyTextOf(operation, lane.head.input),
  );

/**
 * A lane's place: its id, identity, operation and key.
 */
export type At = {
  readonly id: string;
  readonly actor: ActorId;
  readonly operation: string;
  readonly key: Values;
};

const defect = (what: string) => {
  // oxlint-disable-next-line lint-bomb/no-throw-in-core -- a pair the lane's table rules out is a defect in Flow, never an expected failure
  throw new Error(`Defect: ${what}`);
};

/**
 * The write lane's table applied: a cue meets a lane state, the table's move changes the world
 * through the step's working state, and `evidenceOf` derives the reports it determines.
 */
export const makeMoves = (tx: Tx, persistence: Persistence, ledger: LedgerSteps) => {
  const { persisted, incarnationOf } = tx;
  const { persist, persistAwaited, actorWrite, laneWrite, setLane, dropLane } = persistence;

  const open = () => Disposal.$is("Open")(tx.world().disposal);

  // An ending of this lane's Attempt, owed to its identity: routed from the head's owner while the
  // Runtime is open, current from the root once it is disposing.
  const oweOf = (at: At, attempt: Option.Option<string>, owner: number) =>
    open()
      ? { actor: at.actor, to: Audience.Identity(), operation: at.operation, attempt, owner }
      : {
          actor: at.actor,
          to: Audience.Identity(),
          operation: at.operation,
          attempt,
          owner: ROOT_ACTIVATION,
        };

  const operationOf = (actor: ActorId, name: string) =>
    Option.fromUndefinedOr(tx.machines.get(actor.machine)?.operations.get(name));

  const atOf = (id: string, lane: Lane) => ({
    id,
    actor: lane.actor,
    operation: lane.operation,
    key: Option.match(operationOf(lane.actor, lane.operation), {
      onNone: () => ({}),
      onSome: (operation) => pick(lane.head.input, operation.keyFields),
    }),
  });

  const stateAt = (id: string) => {
    const lane = tx.world().lanes.get(id);

    return lane === undefined ? LaneState.Idle() : LaneState.Head({ head: lane.head });
  };

  const laneAt = (at: At) => {
    const lane = tx.world().lanes.get(at.id);

    return lane === undefined ? defect(`no lane ${at.id} for a head's move`) : lane;
  };

  const report = (at: At, before: LaneState, cue: Cue, from: number) => {
    for (const e of evidenceOf(
      Act.Lane({
        actor: at.actor,
        operation: at.operation,
        key: at.key,
        before,
        cue,
        after: stateAt(at.id),
        commands: tx.commandsSince(from),
      }),
    ))
      tx.emit(e);
  };

  // A never-sent Attempt's NotSent keeps its lane: when Kept, it blocks that key.
  const notSent = (at: At, why: string, attempt: string, owner: number) =>
    void ledger.owe({
      ...oweOf(at, Option.some(attempt), owner),
      lane: Option.some(at.id),
      channel: "failure",
      reason: why,
      value: { why },
      current: true,
    });

  const invoke = (at: At, lane: Lane, resend: boolean) => {
    const call = tx.mint<CallId>("call");

    const head = {
      ...lane.head,
      retryCount: lane.head.retryCount + (resend ? 1 : 0),
      phase: Phase.OnWire({ call }),
    };

    setLane(at.id, { ...lane, head });
    tx.command(
      Command.Invoke({
        call,
        machine: at.actor.machine,
        operation: at.operation,
        input: head.input,
        attempt: {
          id: head.id,
          key: at.key,
          retryCount: head.retryCount,
          mayHaveApplied: sentBefore(head),
        },
      }),
    );
  };

  const flush = (at: At, lane: Lane, purpose: "acknowledge" | "capture") => {
    const resend = purpose === "capture";

    if (!persisted(at.actor)) {
      invoke(at, lane, resend);

      return;
    }

    const writes = Option.toArray(
      Option.flatMap(Option.fromUndefinedOr(incarnationOf(at.actor)), actorWrite),
    );

    Option.match(
      persistAwaited(at.actor, [...writes, laneWrite(at.id, lane, false)], {
        attempt: lane.head.id,
        purpose,
      }),
      {
        onNone: () => invoke(at, lane, resend),
        onSome: (ticket) =>
          setLane(at.id, {
            ...lane,
            head: {
              ...lane.head,
              phase: resend ? Phase.Recapturing({ ticket }) : Phase.Acknowledging({ ticket }),
            },
          }),
      },
    );
  };

  const hold = (at: At, lane: Lane, write: boolean) => {
    const held = { ...lane, head: { ...lane.head, phase: Phase.Held() } };
    setLane(at.id, held);

    if (write) persist(at.actor, [laneWrite(at.id, held, false)], Due.Later());
  };

  const perform = (at: At, move: Move, cue: Cue) =>
    Move.$match(move, {
      Stay: () => undefined,
      Mint: ({ input, owner }) =>
        setLane(at.id, {
          actor: at.actor,
          operation: at.operation,
          head: {
            id: tx.mintAttempt(),
            input,
            retryCount: 0,
            owner,
            phase: Phase.Unsent(),
          },
        }),
      // A declined commit has no Attempt and no lane; its ending is a row like any other.
      Decline: ({ why, owner }) =>
        void ledger.owe({
          ...oweOf(at, Option.none(), owner),
          lane: Option.none(),
          channel: "failure",
          reason: why,
          value: { why },
          current: true,
        }),
      // A head the disposal holds is saved Held, so the next boot wakes no one for it.
      Become: ({ phase }) => {
        const lane = laneAt(at);

        if (Phase.$is("Held")(phase)) hold(at, lane, true);
        else setLane(at.id, { ...lane, head: { ...lane.head, phase } });
      },
      Owe: ({ owner }) => {
        const lane = laneAt(at);
        setLane(at.id, { ...lane, head: { ...lane.head, owner, phase: Phase.Resending() } });
      },
      Withdraw: ({ ticket }) => {
        const lane = laneAt(at);
        setLane(at.id, { ...lane, head: { ...lane.head, phase: Phase.Withdrawing({ ticket }) } });
      },
      EndUnsent: ({ why }) => {
        const lane = laneAt(at);
        dropLane(at.id, lane);
        notSent(at, why, lane.head.id, lane.head.owner);
      },
      Release: () => dropLane(at.id, laneAt(at)),
      Interrupt: ({ call }) => {
        const lane = laneAt(at);
        tx.command(Command.Interrupt({ call }));
        setLane(at.id, { ...lane, head: { ...lane.head, phase: Phase.Cancelling({ call }) } });
      },
      Flush: ({ purpose }) => flush(at, laneAt(at), purpose),
      Send: () => invoke(at, laneAt(at), false),
      Resend: () => invoke(at, laneAt(at), true),
      HoldRefused: () => {
        const lane = laneAt(at);
        setLane(at.id, { ...lane, head: { ...lane.head, phase: Phase.Held() } });
        // Owed with no lane as before: giving it its lane lets a key-less retry in its handler name
        // it, which changes retry behaviour, owed elsewhere.
        ledger.owe({
          ...oweOf(at, Option.some(lane.head.id), lane.head.owner),
          lane: Option.none(),
          channel: "unknown",
          reason: "StorageRefused",
          value: { why: "StorageRefused" },
          current: true,
        });
      },
      // While open, a definite failure delivered as StillUnknown leaves the lane record as it was
      // (an owed fix: a Held head's record should read not in flight); during disposal every hold
      // is written.
      Answer: ({ channel, asked, reason, value, interrupt }) => {
        const lane = laneAt(at);
        const live = open();
        Option.match(interrupt, {
          onNone: () => undefined,
          onSome: (call) => tx.command(Command.Interrupt({ call })),
        });

        if (channel === "unknown") hold(at, lane, asked === "unknown" || !live);
        else dropLane(at.id, lane);

        ledger.owe({
          ...oweOf(at, Option.some(lane.head.id), lane.head.owner),
          lane: Option.some(at.id),
          channel,
          reason,
          value,
          current: !live,
        });
      },
      Impossible: () => defect(`the lane's table rules out ${cue._tag} on ${stateAt(at.id)._tag}`),
    });

  /**
   * Applies a cue to a lane: the table's move, then the reports it determines.
   */
  // RETURN_TYPE: the move the table chose, which an admitted ending reads.
  const apply = (at: At, cue: Cue): Move => {
    const before = stateAt(at.id);
    const move = cell(before, cue);
    const from = tx.commandCount();
    perform(at, move, cue);
    report(at, before, cue, from);

    return move;
  };

  // ── members.
  return { operationOf, atOf, report, apply };
};

/**
 * The write lane's table applied.
 */
export type Moves = ReturnType<typeof makeMoves>;

/**
 * Whether a lane's head is on the wire as a call, cancelled or not.
 */
export const onWireAs = (lane: Lane, call: string) =>
  Phase.$match(lane.head.phase, {
    Acknowledging: () => false,
    Unsent: () => false,
    Withdrawing: () => false,
    Recapturing: () => false,
    Resending: () => false,
    OnWire: (p) => p.call === call,
    Cancelling: (p) => p.call === call,
    Held: () => false,
  });

/**
 * Whether a lane's head is on the wire.
 */
export const onWire = (lane: Lane) =>
  Phase.$is("OnWire")(lane.head.phase) || Phase.$is("Cancelling")(lane.head.phase);

/**
 * Whether a lane's head awaits a store ticket's answer.
 */
export const awaits = (lane: Lane, ticket: string) =>
  Phase.$match(lane.head.phase, {
    Acknowledging: (p) => p.ticket === ticket,
    Unsent: () => false,
    Withdrawing: (p) => p.ticket === ticket,
    Recapturing: (p) => p.ticket === ticket,
    Resending: () => false,
    OnWire: () => false,
    Cancelling: () => false,
    Held: () => false,
  });
