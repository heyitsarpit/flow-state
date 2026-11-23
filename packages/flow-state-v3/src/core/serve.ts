import { Option, Result } from "effect";
import { callSlot, type Mapping, Operation, type Values } from "./compiled.ts";
import { Act } from "./evidence-of.ts";
import { runTurn, TurnResult } from "./walk.ts";
import { RuntimeDefaults } from "./defaults.ts";
import { Change, refusalOf } from "./change.ts";
import { scopeOf } from "./reads.ts";
import { routeOf, Trigger } from "./trigger.ts";
import { isInFlight, pick, type Tx } from "./tx.ts";
import { Heard, type LedgerSteps, type Owed, Route } from "./ledger.ts";
import {
  type ActivationId,
  type ActorId,
  actorKey,
  type Incarnation,
  type Lane,
  Mail,
  OwnedBy,
} from "./world.ts";
import type { LaneSteps } from "./lanes.ts";
import type { IncarnationSteps } from "./incarnations.ts";
import { makeFirings } from "./firings.ts";

/**
 * The activations that own an actor's pending work: each InFlight head and every queued commit,
 * a queue behind a Held head included. A late turn may not exit any of them.
 */
export const pendingOwners = (lanes: Iterable<Lane>) => {
  const owners = new Set<ActivationId>();

  // The root is never left, so its work never strands a late turn.
  const add = (owner: OwnedBy) =>
    OwnedBy.$match(owner, {
      Root: () => undefined,
      State: ({ activation }) => void owners.add(activation),
    });

  for (const lane of lanes) {
    if (isInFlight(lane)) add(lane.head.owner);

    for (const queued of lane.queue) add(queued.owner);
  }

  return owners;
};

/**
 * Serving mail: each admitted event or ending runs as one turn.
 */
export const makeServe = (
  tx: Tx,
  lanes: LaneSteps,
  incarnations: IncarnationSteps,
  ledger: LedgerSteps,
) => {
  const { incarnationOf } = tx;
  const { viewOf } = lanes;
  const { schedules, apply, context } = incarnations;

  // ── serving mail.
  // RETURN_TYPE: an Option of the operation's mapping, whichever channel selects it.
  const endingMapping = (
    operation: Operation,
    ending: Pick<Owed, "channel" | "reason">,
  ): Option.Option<Mapping> => {
    // The channel picks the mapper: a NotSent never reaches a failure tag of the same name.
    const byChannel = {
      success: () => Option.some(operation.success),
      notSent: () =>
        Operation.$match(operation, {
          Write: (w) => w.notSent,
          Read: () => Option.none<Mapping>(),
        }),
      failure: () => Option.fromUndefinedOr(operation.failure.get(ending.reason)),
      unknown: () =>
        Operation.$match(operation, {
          Write: (w) => Option.some(w.unknown),
          Read: () => Option.none<Mapping>(),
        }),
    } as const satisfies Record<Owed["channel"], () => Option.Option<Mapping>>;

    return byChannel[ending.channel]();
  };

  // The depth a late ending is routed from: its owner's nearest surviving ancestor, which is the
  // deepest active state entered before the owner was (0 for the root).
  const depthBelow = (incarnation: Incarnation, owner: ActivationId) =>
    incarnation.activations.filter((a) => a < owner).length;

  // What a turn that ran nothing applies: an ending's row was heard and moved nothing but its
  // lane; a firing's send did not commit; an event applies nothing.
  const ranNothing = (incarnation: Incarnation, trigger: Trigger) =>
    Trigger.$match(trigger, {
      Event: () => undefined,
      Firing: ({ firing }) =>
        void apply(Option.some(incarnation), Change.Settled({ firing, refusal: Option.none() })),
      Ending: ({ row }) => void apply(Option.some(incarnation), Change.Unturned({ row })),
    });

  /**
   * One turn of an incarnation: its trigger's walk, then the change it decided, applied. Returns
   * how an ending's row was heard.
   */
  const turn = (incarnation: Incarnation, tag: string, payload: Values, trigger: Trigger) => {
    const compiled = tx.machines.get(incarnation.actor.machine);

    if (compiled === undefined) return;

    const route = routeOf(trigger);

    // The activations owning pending work, read on the first question of a late turn only.
    let owning = Option.none<ReadonlySet<ActivationId>>();

    const owned = () =>
      Option.getOrElse(owning, () => {
        const read = pendingOwners(tx.lanesOf(incarnation.actor).map(([, lane]) => lane));
        owning = Option.some(read);

        return read;
      });

    const result = runTurn({
      compiled,
      ...scopeOf(incarnation),
      activations: incarnation.activations,
      history: incarnation.history,
      tag,
      payload: tx.env.admit(payload),
      late: Option.isSome(route.late),
      unrepeatable: route.unrepeatable,
      from: Option.match(route.late, {
        onNone: () => incarnation.activations.length,
        onSome: (owner) => depthBelow(incarnation, owner),
      }),
      now: tx.env.now,
      lane: viewOf(incarnation, route.own),
      owns: (activation) => owned().has(activation),
      step: (name, series, attempt) =>
        schedules.stepper(incarnation.actor, name, tx.env.now)(series, attempt),
    });

    const applied = (change: Change) => void apply(Option.some(incarnation), change);

    TurnResult.$match(result, {
      Unhandled: () => {
        tx.act(Act.Unhandled({ actor: incarnation.actor, event: tag }));
        ranNothing(incarnation, trigger);
      },
      Denied: ({ reasons }) => {
        tx.act(Act.Denied({ actor: incarnation.actor, event: tag, reasons }));
        ranNothing(incarnation, trigger);
      },
      Refused: ({ code, slot }) => applied(refusalOf(trigger, { code, slot })),
      Accepted: ({ turn: decided }) => applied(Change.Turn({ turn: decided, trigger })),
    });
  };

  // One try of an owed row: its mapped event's turn, whose applier moves the row. An unmapped row
  // closes as evidence; a mapper that throws refuses the turn.
  const serveEnding = (incarnation: Incarnation, ending: Owed) => {
    const compiled = tx.machines.get(incarnation.actor.machine);
    const operation = compiled?.operations.get(ending.operation);

    const mapping = Option.flatMap(Option.fromUndefinedOr(operation), (op) =>
      endingMapping(op, ending),
    );

    if (operation === undefined || Option.isNone(mapping)) {
      ledger.afterTry(ending.id, ending.actor, Heard.Unmapped());

      return;
    }

    const input = Option.getOrElse(ending.input, () => ({}));

    const payload = Option.match(mapping.value.from, {
      onNone: () => Result.succeed<Values>({}),
      // FLOW_STATE_ALLOW_UNKNOWN: a throw from an outcome mapper refuses the turn.
      onSome: (from) =>
        callSlot(from, ending.value, { input, key: pick(input, operation.keyFields) }),
    });

    tx.act(Act.Heard({ row: ending, event: mapping.value.event, actor: incarnation.actor }));

    // An ending is late when the activation it was routed from has been left.
    const late = Route.$match(ending.route, {
      Current: () => Option.none<ActivationId>(),
      From: ({ owner }) =>
        OwnedBy.$match(owner, {
          Root: () => Option.none<ActivationId>(),
          State: ({ activation }) =>
            incarnation.activations.includes(activation)
              ? Option.none<ActivationId>()
              : Option.some(activation),
        }),
    });

    const trigger = Trigger.Ending({ row: ending, late });

    if (Result.isFailure(payload))
      apply(
        Option.some(incarnation),
        refusalOf(trigger, { code: "InvalidTurn", slot: payload.failure }),
      );
    else turn(incarnation, mapping.value.event, payload.success, trigger);
  };

  const firings = makeFirings(tx, incarnations, (incarnation, schedule, payload, firing) =>
    turn(incarnation, schedule.send, payload, Trigger.Firing({ firing })),
  );

  // A context update: the consumer's providers read again, applied as its `Inputs` change.
  const update = (actor: ActorId) => {
    const incarnation = incarnationOf(actor);

    if (incarnation === undefined) return;

    for (const read of Option.toArray(context.inputsOf(incarnation)))
      apply(Option.some(incarnation), Change.Inputs({ read }));
  };

  const serveOne = (mail: Mail) =>
    Mail.$match(mail, {
      Event: ({ actor, tag, payload, resendable }) => {
        const incarnation = incarnationOf(actor);

        if (incarnation !== undefined)
          turn(incarnation, tag, payload, Trigger.Event({ tag, resendable }));
      },
      Firing: firings.firing,
      Context: ({ actor }) => update(actor),
      Ending: ({ actor, id }) => {
        const incarnation = incarnationOf(actor);

        // A row is in the mailbox only while its identity can hear it; every end suspends it.
        if (incarnation !== undefined)
          for (const row of Option.toArray(ledger.tried(actor, id))) serveEnding(incarnation, row);
      },
    });

  // One item, then its actor's front mail, in the same call: no other mail, yield or notify falls
  // between a change and the turns that repair it.
  const serve = (mail: Mail) => {
    serveOne(mail);

    for (let front = tx.takeFront(); front.length > 0; front = tx.takeFront())
      for (const event of front) serveOne(event);
  };

  // A context update whose providers have not settled is not taken: its actor is passed over this
  // rotation, and mail behind it stays behind it, so one wave gives one consistent update.
  const passedOver = (key: string) =>
    Option.exists(
      tx.peek(key),
      (mail) => Mail.$is("Context")(mail) && context.settling(mail.actor),
    );

  // Serves one item; returns the mail its turns enqueued, which follows it and the loop guard's
  // chain it follows or starts. Mail enqueued between items follows none.
  const served = (mail: Mail) => {
    tx.serving(mail, serve);
    firings.recheckLanes();

    return tx.takeFresh();
  };

  const drain = () => {
    tx.takeFresh();

    for (let count = 0; count < RuntimeDefaults.drainYield && tx.world().mail.size > 0;) {
      const [key] = tx.world().mail.keys();

      if (key === undefined) return;
      count += 1;

      // One event from the next actor in rotation; then its follow-ups, first, oldest first
      // within each actor.
      if (passedOver(key)) tx.rotate(key);
      else {
        const first = tx.takeOldest(key, "rotate");

        if (first !== undefined) count = followUps(served(first), count);
      }
    }
  };

  // Serves the follow-ups an admitted event started, in the order they were enqueued, until none
  // is left or the step yields; returns how many items the step has served.
  const followUps = (added: ReadonlyArray<Mail>, countBefore: number) => {
    let count = countBefore;
    let chain = added.map((m) => actorKey(m.actor));

    while (chain.length > 0 && count < RuntimeDefaults.drainYield) {
      const [next, ...later] = chain;
      chain = later;

      if (next === undefined || !tx.world().mail.has(next)) continue;
      count += 1;

      if (passedOver(next)) continue;

      const followUp = tx.takeOldest(next, "keep");

      if (followUp !== undefined)
        chain = [...chain, ...served(followUp).map((m) => actorKey(m.actor))];
    }

    return count;
  };

  return { endingMapping, turn, serveEnding, serve, drain, recheckLanes: firings.recheckLanes };
};
