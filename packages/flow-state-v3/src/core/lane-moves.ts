import { Option } from "effect";
import { Cue, cell, LaneState, Move, type NotSentWhy } from "./cells.ts";
import { type Operation, operationOf as lookup, type Values } from "./compiled.ts";
import { defect } from "./defect.ts";
import { Act } from "./evidence-of.ts";
import { Life } from "./life.ts";
import { type LedgerSteps, Route } from "./ledger.ts";
import { type Machines, pick, type Tx } from "./tx.ts";
import type { Channel } from "./vocabulary.ts";
import {
  type ActorId,
  type AttemptId,
  Command,
  type Displaced,
  type Head,
  type IncarnationId,
  type Lane,
  type LaneId,
  type OwnedBy,
  Phase,
  sentBefore,
} from "./world.ts";
import type { Persistence } from "./persist.ts";

/**
 * A lane's key text: its operation's key fields of a value, encoded; `None` when they have no
 * encoded form.
 */
export const keyTextOf = (operation: Operation, value: Values) => operation.walk.keyText(value);

/**
 * The key text a lane is kept under, derived from its head's input.
 */
export const laneKeyText = (machines: Machines, lane: Lane) =>
  Option.flatMap(lookup(machines, lane.actor.machine, lane.operation), (operation) =>
    keyTextOf(operation, lane.head.input),
  );

/**
 * A lane's place: its id, identity, operation and key.
 */
export type At = {
  readonly id: LaneId;
  readonly actor: ActorId;
  readonly operation: string;
  readonly key: Values;
};

/**
 * The write lane's table applied: a cue meets a lane state, the table's move changes the world
 * through the step's working state, and `evidenceOf` derives the reports it determines.
 */
export const makeMoves = (tx: Tx, persistence: Persistence, ledger: LedgerSteps) => {
  const { persisted } = tx;
  const { saveActor, saveAwaited, saveWork, setLane, sendLane, dropLane } = persistence;

  const open = () => Life.$is("Open")(tx.world().life);

  const oweOf = (at: At, attempt: Option.Option<AttemptId>, input: Values) => ({
    actor: at.actor,
    life: Option.none<IncarnationId>(),
    operation: at.operation,
    attempt,
    input: Option.some(input),
  });

  // Where an ending of work an activation owns is routed from: that activation while the Runtime
  // is open, the active leaf once it is disposing.
  const fromOwner = (owner: OwnedBy) => (open() ? Route.From({ owner }) : Route.Current());

  const operationOf = (actor: ActorId, name: string) => lookup(tx.machines, actor.machine, name);

  const atOf = (id: LaneId, lane: Lane) => ({
    id,
    actor: lane.actor,
    operation: lane.operation,
    key: Option.match(operationOf(lane.actor, lane.operation), {
      onNone: () => ({}),
      onSome: (operation) => pick(lane.head.input, operation.keyFields),
    }),
  });

  const stateAt = (id: LaneId) => {
    const lane = tx.world().lanes.get(id);

    return lane === undefined
      ? LaneState.Idle()
      : LaneState.Head({ head: lane.head, queued: lane.queue.length });
  };

  const laneAt = (at: At) => {
    const lane = tx.world().lanes.get(at.id);

    return lane === undefined ? defect(`no lane ${at.id} for a head's move`) : lane;
  };

  const report = (
    where: Pick<At, "actor" | "operation"> & { readonly key: Option.Option<Values> },
    before: LaneState,
    cue: Cue,
    from: number,
    after: LaneState,
  ) => {
    tx.act(
      Act.Lane({
        actor: where.actor,
        operation: where.operation,
        key: where.key,
        before,
        cue,
        after,
        commands: tx.commandsSince(from),
      }),
    );
  };

  // A never-sent Attempt's NotSent keeps its lane: when Kept, it blocks that key.
  const notSent = (at: At, why: NotSentWhy, head: Head) =>
    void ledger.owe({
      ...oweOf(at, Option.some(head.id), head.input),
      lane: Option.some(at.id),
      channel: "notSent",
      reason: why,
      value: { why },
      route: Route.Current(),
    });

  const invoke = (at: At, lane: Lane, retryCount: number) => {
    const call = tx.mint("call");

    const head = {
      ...lane.head,
      retryCount,
      phase: Phase.OnWire({ call }),
    };

    sendLane(at.id, { ...lane, head });
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
    const sendCount = lane.head.retryCount + (resend ? 1 : 0);

    if (!persisted(at.actor)) {
      invoke(at, lane, sendCount);

      return;
    }

    saveActor(at.actor);

    Option.match(saveAwaited(at.actor, { attempt: lane.head.id, purpose }), {
      onNone: () => invoke(at, lane, sendCount),
      onSome: (ticket) =>
        setLane(at.id, {
          ...lane,
          head: {
            ...lane.head,
            phase: resend ? Phase.Recapturing({ ticket }) : Phase.Acknowledging({ ticket }),
          },
        }),
    });
  };

  const hold = (at: At, lane: Lane) =>
    setLane(at.id, { ...lane, head: { ...lane.head, phase: Phase.Held() } });

  // RETURN_TYPE: a new head of the World's Head contract.
  const headFor = (input: Values, owner: OwnedBy): Head => ({
    id: tx.mintAttempt(),
    input,
    retryCount: 0,
    owner,
    phase: Phase.Unsent(),
    progress: Option.none(),
    started: Option.some(tx.mintPosition()),
  });

  // The head is gone: the oldest queued commit is promoted to a new head, or the lane drops.
  const vacate = (at: At, lane: Lane) => {
    const [next, ...rest] = lane.queue;

    if (next === undefined) {
      dropLane(at.id, lane);

      return;
    }

    setLane(at.id, { ...lane, head: headFor(next.input, next.owner), queue: rest });
  };

  // The call or ticket a displaced head waits on: its interrupted call, or its storage ticket.
  const waitOf = (lane: Lane) =>
    Phase.$match(lane.head.phase, {
      Acknowledging: () => defect("an Acknowledging head is superseded, never displaced"),
      Unsent: () => defect("an Unsent head is superseded, never displaced"),
      Withdrawing: ({ ticket }) => ({ key: ticket, head: lane.head }),
      Recapturing: () => defect("a Recapturing head is released, never displaced"),
      Resending: () => defect("a Resending head is released, never displaced"),
      OnWire: ({ call }) => {
        tx.command(Command.Interrupt({ call }));

        return { key: call, head: { ...lane.head, phase: Phase.Cancelling({ call }) } };
      },
      Cancelling: ({ call }) => ({ key: call, head: lane.head }),
      Held: () => defect("a Held head is released, never displaced"),
    });

  // The input of the commit a cue brings: a declined commit's row keeps it with its key. Only a
  // commit is ever declined.
  const committed = (cue: Cue) => {
    const notACommit = () => defect(`the lane's table declines only a commit, not ${cue._tag}`);

    return Cue.$match(cue, {
      CommitReject: ({ input }) => input,
      CommitLatest: ({ input }) => input,
      CommitSerialize: ({ input }) => input,
      CommitCancel: ({ input }) => input,
      Retry: notACommit,
      Cancel: notACommit,
      TurnEnded: notACommit,
      Stored: notACommit,
      Refused: notACommit,
      Answered: notACommit,
      DisposalStarts: notACommit,
      BoundPassed: notACommit,
    });
  };

  const perform = (at: At, move: Move, cue: Cue) =>
    Move.$match(move, {
      Stay: () => undefined,
      Mint: ({ input, owner }) =>
        setLane(at.id, {
          actor: at.actor,
          operation: at.operation,
          head: headFor(input, owner),
          queue: [],
        }),
      Queue: ({ input, owner, latest }) => {
        const lane = laneAt(at);
        const queued = { input, owner };
        setLane(at.id, { ...lane, queue: latest ? [queued] : [...lane.queue, queued] });
      },
      Replace: ({ input, owner }) => {
        const lane = laneAt(at);
        setLane(at.id, { ...lane, head: headFor(input, owner), queue: [] });
      },
      Displace: ({ input, owner, owed }) => {
        const lane = laneAt(at);
        const { key, head } = waitOf(lane);
        const displaced = { actor: at.actor, operation: at.operation, lane: at.id, head, owed };
        tx.put("displaced", key, displaced);
        setLane(at.id, { ...lane, head: headFor(input, owner), queue: [] });
      },
      // A declined commit has no Attempt and no lane; its ending is a row like any other.
      Decline: ({ why }) =>
        void ledger.owe({
          ...oweOf(at, Option.none(), committed(cue)),
          lane: Option.none(),
          channel: "notSent",
          reason: why,
          value: { why },
          route: Route.Current(),
        }),
      // A head the disposal holds is saved Held, so the next boot wakes no one for it.
      Become: ({ phase }) => {
        const lane = laneAt(at);

        setLane(at.id, { ...lane, head: { ...lane.head, phase } });
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
        vacate(at, lane);
        notSent(at, why, lane.head);
      },
      Release: () => vacate(at, laneAt(at)),
      Interrupt: ({ call }) => {
        const lane = laneAt(at);
        tx.command(Command.Interrupt({ call }));
        setLane(at.id, { ...lane, head: { ...lane.head, phase: Phase.Cancelling({ call }) } });
      },
      Flush: ({ purpose }) => flush(at, laneAt(at), purpose),
      Send: () => invoke(at, laneAt(at), laneAt(at).head.retryCount),
      Resend: () => invoke(at, laneAt(at), laneAt(at).head.retryCount + 1),
      HoldRefused: () => {
        const lane = laneAt(at);
        setLane(at.id, { ...lane, head: { ...lane.head, phase: Phase.Held() } });
        // Owed with no lane as before: giving it its lane lets a key-less retry in its handler name
        // it, which changes retry behaviour, owed elsewhere.
        ledger.owe({
          ...oweOf(at, Option.some(lane.head.id), lane.head.input),
          lane: Option.none(),
          channel: "unknown",
          reason: "StorageRefused",
          value: { why: "StorageRefused" },
          route: Route.Current(),
        });
      },
      // Every hold writes the Held head's record, not in flight.
      Answer: ({ channel, reason, value, interrupt }) => {
        const lane = laneAt(at);

        if (Option.isSome(interrupt)) tx.command(Command.Interrupt({ call: interrupt.value }));

        if (channel === "unknown") hold(at, lane);
        else vacate(at, lane);

        ledger.owe({
          ...oweOf(at, Option.some(lane.head.id), lane.head.input),
          lane: Option.some(at.id),
          channel,
          reason,
          value,
          route: fromOwner(lane.head.owner),
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
    report({ ...at, key: Option.some(at.key) }, before, cue, from, stateAt(at.id));

    return move;
  };

  const owedOrRecorded = (
    d: Displaced,
    ending: {
      readonly channel: Channel;
      readonly reason: string;
      // FLOW_STATE_ALLOW_UNKNOWN: a call's value is the contract's own, mapped when its row is heard.
      readonly value: unknown;
    },
  ) => {
    const at = atOf(d.lane, { actor: d.actor, operation: d.operation, head: d.head, queue: [] });
    const attempt = Option.some(d.head.id);

    if (d.owed) {
      ledger.owe({
        ...oweOf(at, attempt, d.head.input),
        lane: Option.some(d.lane),
        ...ending,
        route: ending.channel === "notSent" ? Route.Current() : fromOwner(d.head.owner),
      });

      return;
    }

    const row = { operation: d.operation, attempt };
    tx.act(Act.Ended({ actor: d.actor, ending: { ...row, ...ending } }));
    tx.act(Act.RowRecorded({ row, why: "evidence" }));
  };

  /**
   * Applies a cue to the displaced head that waits on a call or ticket, by the head's own cell:
   * an answer or a store's verdict ends it, owed when a cancel was pending on it, else evidence.
   * Returns whether a displaced head waited on that key.
   */
  const applyDisplaced = (key: string, cue: Cue) => {
    const d = tx.world().displaced.get(key);

    if (d === undefined) return false;
    const move = cell(LaneState.Head({ head: d.head, queued: 0 }), cue);

    if (Move.$is("Stay")(move)) return true;

    tx.drop("displaced", key);
    saveWork(d.actor);

    // A displaced head only stays, ends with its call's answer, or ends unsent.
    const impossible = () => defect(`a displaced head has no move ${move._tag} for ${cue._tag}`);

    Move.$match(move, {
      Answer: (answer) => {
        for (const call of Option.toArray(answer.interrupt))
          tx.command(Command.Interrupt({ call }));
        owedOrRecorded(d, { channel: answer.channel, reason: answer.reason, value: answer.value });
      },
      EndUnsent: ({ why }) =>
        owedOrRecorded(d, { channel: "notSent", reason: why, value: { why } }),
      Stay: impossible,
      Mint: impossible,
      Decline: impossible,
      Queue: impossible,
      Replace: impossible,
      Displace: impossible,
      Become: impossible,
      Owe: impossible,
      Withdraw: impossible,
      Release: impossible,
      Interrupt: impossible,
      Flush: impossible,
      Send: impossible,
      Resend: impossible,
      HoldRefused: impossible,
      Impossible: impossible,
    });

    return true;
  };

  /**
   * Ends every commit queued on a lane NotSent with the given reason: a queued commit has no
   * Attempt, so its row names none.
   */
  const endQueue = (at: At, why: NotSentWhy) => {
    const lane = laneAt(at);
    setLane(at.id, { ...lane, queue: [] });

    for (const queued of lane.queue)
      ledger.owe({
        ...oweOf(at, Option.none(), queued.input),
        lane: Option.none(),
        channel: "notSent",
        reason: why,
        value: { why },
        route: Route.Current(),
      });
  };

  // ── members.
  return { operationOf, atOf, report, apply, applyDisplaced, endQueue };
};

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
  Phase.$match(lane.head.phase, {
    Acknowledging: () => false,
    Unsent: () => false,
    Withdrawing: () => false,
    Recapturing: () => false,
    Resending: () => false,
    OnWire: () => true,
    Cancelling: () => true,
    Held: () => false,
  });

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
