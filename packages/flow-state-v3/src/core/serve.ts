import { Option, Result } from "effect";
import { type Mapping, Operation, type Values } from "./compiled.ts";
import type { Member } from "./evidence.ts";
import { Act } from "./evidence-of.ts";
import { Resolved, runTurn, TurnResult } from "./turn.ts";
import { chainOf, historyAfter } from "./tree.ts";
import { isInFlight, ROOT_ACTIVATION, type Tx, without, withEntry } from "./tx.ts";
import type { Heard, LedgerSteps, Owed } from "./ledger.ts";
import { type ActorId, actorKey, type Incarnation, type Issue, type Lane, Mail } from "./world.ts";
import type { LaneSteps } from "./lanes.ts";
import type { IncarnationSteps } from "./incarnations.ts";

const HEARD: Heard = "Heard";

const REFUSED: Heard = "Refused";

// How many mail items one step serves before it leaves the rest to a later step.
const DRAIN_CAP = 10_000;

// How many follow-ups one admitted event may start before the next is refused.
const FOLLOW_UPS = 64;

const UNMAPPED: Heard = "Unmapped";

/**
 * The activations that own an actor's pending work: each InFlight head and every queued commit,
 * a queue behind a Held head included. A late turn may not exit any of them.
 */
export const pendingOwners = (lanes: Iterable<Lane>, actor: ActorId) => {
  const owners = new Set<number>();

  for (const lane of lanes)
    if (actorKey(lane.actor) === actorKey(actor)) {
      if (isInFlight(lane)) owners.add(lane.head.owner);

      for (const queued of lane.queue) owners.add(queued.owner);
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
    if (ending.channel === "success") return Option.some(operation.success);

    // The origin picks the mapper: a NotSent never reaches a failure tag of the same name.
    if (ending.channel === "notSent")
      return Operation.$match(operation, {
        Write: (w) => w.notSent,
        Read: () => Option.none(),
      });

    if (ending.channel === "failure")
      return Option.fromUndefinedOr(operation.failure.get(ending.reason));

    return Operation.$match(operation, {
      Write: (w) => Option.some(w.unknown),
      Read: () => Option.none(),
    });
  };

  // A refusal raises its source's issue, replacing that source's earlier one. Issues are not part
  // of the record, so raising one writes nothing.
  const raised = (incarnation: Incarnation, issue: Issue) => {
    const next = {
      ...incarnation,
      issues: [...incarnation.issues.filter((i) => i.source !== issue.source), issue],
    };

    tx.set({
      ...tx.world(),
      incarnations: withEntry(tx.world().incarnations, actorKey(next.actor), next),
    });

    return next;
  };

  // The depth a late ending is routed from: its owner's nearest surviving ancestor, which is the
  // deepest active state entered before the owner was (0 for the root).
  const depthBelow = (incarnation: Incarnation, owner: number) =>
    incarnation.activations.filter((a) => a < owner).length;

  const turn = (
    incarnation: Incarnation,
    tag: string,
    payload: Values,
    route: {
      readonly late: Option.Option<number>;
      readonly own: Option.Option<string>;
      readonly ending: Option.Option<Owed>;
      readonly source: string;
    },
  ) => {
    const compiled = tx.machines.get(incarnation.actor.machine);

    if (compiled === undefined) return HEARD;

    const owning = pendingOwners(tx.world().lanes.values(), incarnation.actor);

    const result = runTurn({
      compiled,
      state: incarnation.state,
      activations: incarnation.activations,
      history: incarnation.history,
      memory: incarnation.memory,
      tag,
      payload,
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
        tx.act(
          Act.Refused({
            code,
            actor: incarnation.actor,
            ending: route.ending,
            source: route.source,
            slot: Option.some(slot),
          }),
        );
        publish(raised(incarnation, { source: route.source, code, slot: Option.some(slot) }));

        return REFUSED;
      },
      Accepted: (accepted) => {
        const base: Incarnation = Option.match(accepted.move, {
          onNone: () => ({ ...incarnation, memory: accepted.memory }),
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
              activations: [...kept, ...move.enters.map(() => tx.next())],
              history: historyAfter(incarnation.history, incarnation.state, move),
              memory: accepted.memory,
            };
          },
        });

        const after = armSchedules(
          { ...base, issues: base.issues.filter((i) => i.source !== route.source) },
          accepted.arm,
        );

        setIncarnation(after);

        // The work a transition starts is owned by the activation of the state it names: its
        // target's when it moves, its handler's otherwise, the root's at the root.
        const owner = Option.match(accepted.move, {
          onNone: () =>
            accepted.handler === ""
              ? ROOT_ACTIVATION
              : (after.activations[chainOf(accepted.handler).length - 1] ?? ROOT_ACTIVATION),
          onSome: (move) => after.activations[chainOf(move.target).length - 1] ?? ROOT_ACTIVATION,
        });

        const members: Array<Member> = [];
        const reports = tx.evidenceCount();

        for (const action of accepted.actions) {
          const operation = compiled.operations.get(action.operation);

          if (operation === undefined) continue;

          const member = Resolved.$match(action, {
            Commit: ({ input }) => Option.some(commit(after, operation, input, owner)),
            Retry: ({ key }) => Option.some(retry(after, operation, key, route.own, owner)),
            Cancel: ({ key }) => Option.some(cancel(after, operation, key, route.own)),
            Lookup: ({ input }) => {
              lookup(after, operation, input, owner);

              return Option.none<Member>();
            },
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
      onSome: (from) => Result.try({ try: () => from.run(ending.value), catch: () => from.slot }),
    });

    tx.act(Act.Heard({ row: ending, event: mapping.value.event, actor: incarnation.actor }));

    const source = `operation ${ending.operation}`;

    if (Result.isFailure(payload)) {
      const slot = Option.some(payload.failure);
      tx.act(
        Act.Refused({
          code: "InvalidTurn",
          actor: incarnation.actor,
          ending: Option.some(ending),
          source,
          slot,
        }),
      );
      publish(raised(incarnation, { source, code: "InvalidTurn", slot }));

      return REFUSED;
    }

    const alive =
      ending.current ||
      ending.owner === ROOT_ACTIVATION ||
      incarnation.activations.includes(ending.owner);

    return turn(incarnation, mapping.value.event, payload.success, {
      late: alive ? Option.none() : Option.some(ending.owner),
      own: ending.lane,
      ending: Option.some(ending),
      source,
    });
  };

  const serve = (mail: Mail) =>
    Mail.$match(mail, {
      Event: ({ actor, tag, payload }) => {
        const incarnation = incarnationOf(actor);

        if (incarnation !== undefined)
          turn(incarnation, tag, payload, {
            late: Option.none(),
            own: Option.none(),
            ending: Option.none(),
            source: `event ${tag}`,
          });
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

        const left = { ...incarnation, schedules: without(incarnation.schedules, schedule) };
        setIncarnation(left);
        turn(
          left,
          armed.send,
          {},
          {
            late: Option.none(),
            own: Option.none(),
            ending: Option.none(),
            source: `schedule ${schedule}`,
          },
        );
      },
      Context: ({ actor }) => incarnations.context.update(actor),
      Ending: ({ actor, id }) => {
        const incarnation = incarnationOf(actor);

        // A row is in the mailbox only while its identity can hear it; every end suspends it.
        if (incarnation !== undefined) ledger.tryOne(id, (row) => serveEnding(incarnation, row));
      },
    });

  // An actor's oldest mail, taken from its mailbox; a rotated actor goes to the back while it
  // still has mail, a follow-up's actor keeps its place.
  const takeOldest = (key: string, rotated: boolean) => {
    const [first, ...rest] = tx.world().mail.get(key) ?? [];
    const others = rotated || rest.length === 0 ? without(tx.world().mail, key) : tx.world().mail;
    tx.set({ ...tx.world(), mail: rest.length === 0 ? others : withEntry(others, key, rest) });

    return first;
  };

  // Only events and context updates count against the follow-up cap: an ending or a firing is
  // never refused by it.
  const capped = (mail: Mail) => Mail.$is("Event")(mail) || Mail.$is("Context")(mail);

  const refuseFollowUp = (mail: Mail) =>
    tx.act(
      Act.Refused({
        code: "InvalidTurn",
        actor: mail.actor,
        ending: Option.none(),
        source: "chain",
        slot: Option.none(),
      }),
    );

  // A context update whose providers have not settled goes back to its mailbox's end: it is read
  // once they have, so one wave gives one consistent update.
  const deferred = (mail: Mail) => {
    if (!Mail.$is("Context")(mail) || !incarnations.context.settling(mail.actor)) return false;

    // It keeps its place: mail behind it stays behind it.
    tx.enqueueFirst([mail]);
    tx.takeFresh();

    return true;
  };

  // Serves one item of a chain that has started `count` follow-ups so far. An event whose turn
  // would start the follow-up past the cap is undone and refused, with an issue naming the chain.
  // A context update in that place is undone and waits, at its place, until the chain is over: a
  // context update is never dropped. An ending or a firing is never refused by it.
  const counted = (mail: Mail, count: number) => {
    const before = tx.checkpoint();
    serve(mail);
    const added = tx.takeFresh();
    const started = count + added.filter(capped).length;
    const waits = Mail.$is("Context")(mail) && count > 0;

    if (started <= FOLLOW_UPS || !capped(mail) || (Mail.$is("Context")(mail) && !waits))
      return { added, count: started };

    tx.rollback(before);

    if (waits) tx.enqueueFirst([mail]);
    else refuseFollowUp(mail);
    tx.takeFresh();

    return { added: [], count };
  };

  const drain = () => {
    tx.takeFresh();

    for (let served = 0; served < DRAIN_CAP && tx.world().mail.size > 0;) {
      const [key] = tx.world().mail.keys();

      if (key === undefined) return;

      // One event from the next actor in rotation; then its follow-ups, first, oldest first
      // within each actor, at most FOLLOW_UPS of them.
      const first = takeOldest(key, true);
      served += 1;

      if (first !== undefined && !deferred(first)) served = followUps(counted(first, 0), served);
    }
  };

  // Serves the follow-ups an admitted event started, in the order they were enqueued, until none
  // is left or the step's cap; returns how many items the step has served.
  const followUps = (start: ReturnType<typeof counted>, servedBefore: number) => {
    let served = servedBefore;
    let chain = start.added.map((m) => actorKey(m.actor));
    let count = start.count;

    while (chain.length > 0 && served < DRAIN_CAP) {
      const [next, ...later] = chain;
      chain = later;
      const followUp = next === undefined ? undefined : takeOldest(next, false);

      if (followUp === undefined) continue;
      served += 1;

      if (deferred(followUp)) continue;

      const after = counted(followUp, count);
      count = after.count;
      chain = [...chain, ...after.added.map((m) => actorKey(m.actor))];
    }

    return served;
  };

  return { endingMapping, turn, serveEnding, serve, drain };
};

/**
 * Serving mail.
 */
export type ServeSteps = ReturnType<typeof makeServe>;
