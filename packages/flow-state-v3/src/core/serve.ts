import { Data, Option, Result } from "effect";
import { callSlot, type Mapping, Operation, type Values } from "./compiled.ts";
import { defect } from "./defect.ts";
import type { Member } from "./evidence.ts";
import { Act } from "./evidence-of.ts";
import { Resolved, runTurn, TurnResult } from "./turn.ts";
import { RuntimeDefaults } from "./defaults.ts";
import { chainOf, historyAfter } from "./tree.ts";
import { isInFlight, type Tx } from "./tx.ts";
import { type Heard, type LedgerSteps, type Owed, Route } from "./ledger.ts";
import {
  type ActivationId,
  actorKey,
  type Incarnation,
  type Issue,
  IssueSource,
  type Lane,
  Mail,
  OwnedBy,
  withIssue,
  withoutIssue,
} from "./world.ts";
import type { LaneSteps } from "./lanes.ts";
import type { IncarnationSteps } from "./incarnations.ts";

/**
 * What a turn answers: a public or internal event, a schedule's firing, or an owed ending's mapped
 * event, with the activation it is late for when that activation has been left. Only an ending's
 * turn acts on its own lane.
 */
export type Trigger = Data.TaggedEnum<{
  Event: { tag: string };
  Firing: { schedule: string };
  Ending: { row: Owed; late: Option.Option<ActivationId> };
}>;

/**
 * Constructors and matchers for {@link Trigger}.
 */
export const Trigger = Data.taggedEnum<Trigger>();

// What a turn's trigger decides: the activation it is late for, the lane it acts on as owner, the
// row it hears, and the source whose issue it raises or clears.
const routeOf = (trigger: Trigger) =>
  Trigger.$match(trigger, {
    Event: ({ tag }) => ({
      late: Option.none<ActivationId>(),
      own: Option.none<string>(),
      ending: Option.none<Owed>(),
      source: IssueSource.Event({ tag }),
    }),
    Firing: ({ schedule }) => ({
      late: Option.none<ActivationId>(),
      own: Option.none<string>(),
      ending: Option.none<Owed>(),
      source: IssueSource.Schedule({ name: schedule }),
    }),
    Ending: ({ row, late }) => ({
      late,
      own: row.lane,
      ending: Option.some(row),
      source: IssueSource.Operation({ name: row.operation }),
    }),
  });

const HEARD: Heard = "Heard";

const REFUSED: Heard = "Refused";

const UNMAPPED: Heard = "Unmapped";

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
  const { commit, retry, cancel, lookup, flushLanes, viewOf } = lanes;
  const { armSchedules, stopNamed, setIncarnation, publish } = incarnations;

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

  // A refusal raises its source's issue, replacing that source's earlier one. Issues are not part
  // of the record, so raising one writes nothing.
  const raised = (incarnation: Incarnation, issue: Issue) => {
    const next = withIssue(incarnation, issue);

    tx.putIncarnation(next);

    return next;
  };

  // The depth a late ending is routed from: its owner's nearest surviving ancestor, which is the
  // deepest active state entered before the owner was (0 for the root).
  const depthBelow = (incarnation: Incarnation, owner: ActivationId) =>
    incarnation.activations.filter((a) => a < owner).length;

  // Counts a turn's sends toward the loop guard of the admitted event it follows; fails with the
  // refusal's slot, naming that event, when they would pass the guard.
  const counted = (count: number) => {
    const id = Option.getOrElse(tx.chainNow(), () => defect("a turn sent outside a served item"));
    const chain = tx.world().chains.get(id) ?? defect("a chain followed after it was cleared");

    if (chain.sent + count > RuntimeDefaults.loopGuard)
      return Result.fail(
        `loop guard: ${String(RuntimeDefaults.loopGuard)} events sent from ${chain.root}`,
      );

    tx.put("chains", id, { ...chain, sent: chain.sent + count });

    return Result.succeed(id);
  };

  const turn = (incarnation: Incarnation, tag: string, payload: Values, trigger: Trigger) => {
    const compiled = tx.machines.get(incarnation.actor.machine);

    if (compiled === undefined) return HEARD;

    const route = routeOf(trigger);

    const owning = pendingOwners(tx.lanesOf(incarnation.actor).map(([, lane]) => lane));

    const result = runTurn({
      compiled,
      state: incarnation.state,
      activations: incarnation.activations,
      history: incarnation.history,
      memory: incarnation.memory,
      tag,
      payload: tx.env.admit(payload),
      late: Option.isSome(route.late),
      from: Option.match(route.late, {
        onNone: () => incarnation.activations.length,
        onSome: (owner) => depthBelow(incarnation, owner),
      }),
      now: tx.env.now,
      lane: viewOf(incarnation, route.own),
      owns: (activation) => owning.has(activation),
    });

    return TurnResult.$match(result, {
      Unhandled: () => {
        tx.act(Act.Unhandled({ actor: incarnation.actor, event: tag }));

        return HEARD;
      },
      Denied: ({ reasons }) => {
        tx.act(Act.Denied({ actor: incarnation.actor, event: tag, reasons }));

        return HEARD;
      },
      Refused: ({ code, slot }) => {
        publish(
          raised(
            incarnation,
            tx.refuse(
              incarnation.actor,
              { source: route.source, code, slot: Option.some(slot) },
              route.ending,
            ),
          ),
        );

        return REFUSED;
      },
      Accepted: (accepted) => {
        const sends = accepted.actions.filter(Resolved.$is("Send"));

        const chain = sends.length === 0 ? Option.none() : Option.some(counted(sends.length));

        // The turn that would send past the loop guard is refused whole, naming its chain.
        if (Option.isSome(chain) && Result.isFailure(chain.value)) {
          publish(
            raised(
              incarnation,
              tx.refuse(
                incarnation.actor,
                {
                  source: route.source,
                  code: "InvalidTurn",
                  slot: Option.some(chain.value.failure),
                },
                route.ending,
              ),
            ),
          );

          return REFUSED;
        }

        const base: Incarnation = Option.match(accepted.move, {
          onNone: () => ({ ...incarnation, memory: tx.env.admit(accepted.memory) }),
          onSome: (move) => {
            const exited = new Set(
              move.exits.flatMap((path) =>
                (compiled.states.get(path)?.schedules ?? []).map((s) => s.name),
              ),
            );

            const kept = incarnation.activations.slice(
              0,
              incarnation.activations.length - move.exits.length,
            );

            return {
              ...stopNamed(incarnation, exited),
              state: move.leaf,
              activations: [...kept, ...move.enters.map(() => tx.mintActivation())],
              history: historyAfter(incarnation.history, incarnation.state, move),
              memory: tx.env.admit(accepted.memory),
            };
          },
        });

        const after = armSchedules(withoutIssue(base, route.source), accepted.arm);

        setIncarnation(after);

        // The work a transition starts is owned by the activation of the state it names: its
        // target's when it moves, its handler's otherwise, the root's at the root.
        const ownerOf = (path: string) =>
          Option.match(Option.fromUndefinedOr(after.activations[chainOf(path).length - 1]), {
            onNone: () => OwnedBy.Root(),
            onSome: (activation) => OwnedBy.State({ activation }),
          });

        const owner = Option.match(accepted.move, {
          onNone: () => (accepted.handler === "" ? OwnedBy.Root() : ownerOf(accepted.handler)),
          onSome: (move) => ownerOf(move.target),
        });

        const members: Array<Member> = [];
        const reports = tx.evidenceCount();

        for (const action of accepted.actions) {
          if (Resolved.$is("Send")(action)) continue;

          const operation = compiled.operations.get(action.operation);

          if (operation === undefined) continue;

          const member = Resolved.$match(action, {
            Commit: ({ input }) => Option.some(commit(after, operation, input, owner)),
            Retry: ({ key }) =>
              Option.some(retry(after, operation, tx.env.admit(key), route.own, owner)),
            Cancel: ({ key }) =>
              Option.some(cancel(after, operation, tx.env.admit(key), route.own)),
            Lookup: ({ input }) => {
              lookup(after, operation, tx.env.admit(input), owner);

              return Option.none<Member>();
            },
            Send: () => Option.none<Member>(),
          });

          Option.match(member, { onNone: () => undefined, onSome: (m) => void members.push(m) });
        }

        tx.insertAct(
          reports,
          Act.Turned({
            actor: after.actor,
            event: tag,
            from: incarnation.state,
            to: after.state,
            parts: [accepted.part],
            members,
          }),
        );

        publish(after);
        incarnations.context.wave(after.actor);
        flushLanes(after.actor);

        // Each send is delivered after the turn has committed, in written order.
        for (const sent of sends)
          incarnations.deliver(
            sent.actor,
            { tag: sent.tag, payload: sent.payload },
            Option.some(after.actor),
          );

        return HEARD;
      },
    });
  };

  // One try of an owed row: its mapped event's turn. An unmapped row is recorded as evidence by
  // its close; a mapper that throws refuses the turn.
  const serveEnding = (incarnation: Incarnation, ending: Owed) => {
    const compiled = tx.machines.get(incarnation.actor.machine);
    const operation = compiled?.operations.get(ending.operation);

    if (operation === undefined) return UNMAPPED;

    const mapping = endingMapping(operation, ending);

    if (Option.isNone(mapping)) return UNMAPPED;

    const payload = Option.match(mapping.value.from, {
      onNone: () => Result.succeed<Values>({}),
      // FLOW_STATE_ALLOW_UNKNOWN: a throw from an outcome mapper refuses the turn.
      onSome: (from) => callSlot(from, ending.value),
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

    if (Result.isFailure(payload)) {
      publish(
        raised(
          incarnation,
          tx.refuse(
            incarnation.actor,
            {
              source: routeOf(trigger).source,
              code: "InvalidTurn",
              slot: Option.some(payload.failure),
            },
            Option.some(ending),
          ),
        ),
      );

      return REFUSED;
    }

    return turn(incarnation, mapping.value.event, payload.success, trigger);
  };

  const serve = (mail: Mail) =>
    Mail.$match(mail, {
      Event: ({ actor, tag, payload }) => {
        const incarnation = incarnationOf(actor);

        if (incarnation !== undefined) turn(incarnation, tag, payload, Trigger.Event({ tag }));
      },
      Firing: ({ actor, incarnation: id, schedule, arming }) => {
        const incarnation = incarnationOf(actor);
        const armed = incarnation?.schedules.get(schedule);

        if (
          incarnation === undefined ||
          incarnation.id !== id ||
          armed === undefined ||
          armed.arming !== arming
        )
          return;

        const schedules = new Map(incarnation.schedules);
        schedules.delete(schedule);
        const left = { ...incarnation, schedules };
        setIncarnation(left);
        turn(left, armed.send, {}, Trigger.Firing({ schedule }));
      },
      Context: ({ actor }) => incarnations.context.update(actor),
      Ending: ({ actor, id }) => {
        const incarnation = incarnationOf(actor);

        // A row is in the mailbox only while its identity can hear it; every end suspends it.
        if (incarnation !== undefined)
          ledger.tryOne(actor, id, (row) => serveEnding(incarnation, row));
      },
    });

  // A context update whose providers have not settled waits at the front of its mailbox: it is
  // read once they have, so one wave gives one consistent update, and mail behind it stays behind
  // it.
  const deferred = (mail: Mail) => {
    if (!Mail.$is("Context")(mail) || !incarnations.context.settling(mail.actor)) return false;

    tx.enqueueFirst([mail]);
    tx.takeFresh();

    return true;
  };

  // Serves one item; returns the mail its turns enqueued, which follows it and the loop guard's
  // chain it follows or starts. Mail enqueued between items follows none.
  const served = (mail: Mail) => {
    tx.follow(mail);
    serve(mail);
    tx.followNone();

    return tx.takeFresh();
  };

  const drain = () => {
    tx.takeFresh();

    for (let count = 0; count < RuntimeDefaults.drainYield && tx.world().mail.size > 0;) {
      const [key] = tx.world().mail.keys();

      if (key === undefined) return;

      // One event from the next actor in rotation; then its follow-ups, first, oldest first
      // within each actor.
      const first = tx.takeOldest(key, "rotate");
      count += 1;

      if (first !== undefined && !deferred(first)) count = followUps(served(first), count);
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
      const followUp = next === undefined ? undefined : tx.takeOldest(next, "keep");

      if (followUp === undefined) continue;
      count += 1;

      if (!deferred(followUp))
        chain = [...chain, ...served(followUp).map((m) => actorKey(m.actor))];
    }

    return count;
  };

  return { endingMapping, turn, serveEnding, serve, drain };
};
