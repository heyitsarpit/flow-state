import { Option, Result } from "effect";
import { type Mapping, Operation, type Values } from "./compiled.ts";
import { Evidence, type Member } from "./evidence.ts";
import { Resolved, runTurn, TurnResult } from "./turn.ts";
import { isInFlight, ROOT_ACTIVATION, type Tx, without } from "./tx.ts";
import { isDecline } from "./vocabulary.ts";
import { actorKey, type Ending, type Incarnation, Mail } from "./world.ts";
import type { Persistence } from "./persist.ts";
import type { LaneSteps } from "./lanes.ts";
import type { IncarnationSteps } from "./incarnations.ts";

/**
 * Serving mail (Turn R2, R20, Actors R12, R15): each admitted event or ending runs as one turn.
 */
export const makeServe = (
  tx: Tx,
  persistence: Persistence,
  lanes: LaneSteps,
  incarnations: IncarnationSteps,
) => {
  const { incarnationOf, endingMail } = tx;
  const { saveActor, keep, park } = persistence;
  const { commit, retry, cancel, lookup, flushLanes, admitToLane, viewOf } = lanes;
  const { armSchedules, stopSchedules, setIncarnation, publish } = incarnations;

  // ── serving mail.
  // RETURN_TYPE: an Option of the operation's mapping, whichever channel selects it.
  const endingMapping = (operation: Operation, ending: Ending): Option.Option<Mapping> => {
    if (ending.channel === "success") return Option.some(operation.success);

    if (ending.channel === "failure")
      return Option.fromUndefinedOr(
        operation.failure.get(ending.reason) ??
          (isDecline(ending.reason) ? operation.failure.get("NotSent") : undefined),
      );

    return Operation.$match(operation, {
      Write: (w) => Option.some(w.unknown),
      Read: () => Option.none(),
    });
  };

  const turn = (
    incarnation: Incarnation,
    tag: string,
    payload: Values,
    route: {
      readonly late: boolean;
      readonly own: Option.Option<string>;
      readonly ending: Option.Option<Ending>;
    },
  ) => {
    const compiled = tx.machines.get(incarnation.actor.machine);

    if (compiled === undefined) return;

    const strands = [...tx.world().lanes.values()].some(
      (l) =>
        actorKey(l.actor) === actorKey(incarnation.actor) &&
        isInFlight(l) &&
        l.head.owner === incarnation.activation,
    );

    const result = runTurn({
      compiled,
      state: incarnation.state,
      memory: incarnation.memory,
      tag,
      payload,
      late: route.late,
      now: tx.env.now,
      lane: viewOf(incarnation, route.own),
      leavingStrandsWork: strands,
    });

    TurnResult.$match(result, {
      Unhandled: () => tx.emit(Evidence.Unhandled({ actor: incarnation.actor, event: tag })),
      Denied: ({ reasons }) =>
        tx.emit(Evidence.Denied({ actor: incarnation.actor, event: tag, reasons })),
      Refused: ({ code }) => {
        tx.emit(
          Evidence.Issue({
            code,
            ending: Option.map(route.ending, (e) => ({
              operation: e.operation,
              attempt: e.attempt,
              actor: incarnation.actor,
            })),
          }),
        );

        Option.match(route.ending, {
          onNone: () => undefined,
          onSome: (e) => {
            if (e.redelivered) keep(incarnation.actor, e);
            else endingMail(incarnation.actor, { ...e, redelivered: true });
          },
        });
      },
      Accepted: (accepted) => {
        const entered = Option.isSome(accepted.target);
        const activation = entered ? tx.next() : incarnation.activation;

        const base: Incarnation = {
          ...(entered ? stopSchedules(incarnation) : incarnation),
          state: Option.getOrElse(accepted.target, () => incarnation.state),
          activation,
          memory: accepted.memory,
        };

        const after = armSchedules(base, accepted.arm);
        setIncarnation(after);

        const owner = entered || accepted.part.node !== "root" ? activation : ROOT_ACTIVATION;
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

        tx.insertEvidence(
          reports,
          Evidence.Turn({
            actor: after.actor,
            event: tag,
            from: incarnation.state,
            to: after.state,
            parts: [accepted.part],
            members,
          }),
        );

        if (after.memory !== incarnation.memory || after.state !== incarnation.state)
          publish(after);
        saveActor(after.actor);
        flushLanes(after.actor);
      },
    });
  };

  const serveEnding = (incarnation: Incarnation, admitted: Ending) => {
    const compiled = tx.machines.get(incarnation.actor.machine);
    const operation = compiled?.operations.get(admitted.operation);

    if (operation === undefined) return;

    const decided = admitted.redelivered || admitted.parked;
    const ending = decided ? admitted : admitToLane(admitted);

    if (!decided)
      tx.emit(
        Evidence.Ended({
          operation: ending.operation,
          attempt: ending.attempt,
          channel: ending.channel,
          reason: ending.reason,
          actor: incarnation.actor,
        }),
      );

    const mapping = endingMapping(operation, ending);

    if (Option.isNone(mapping)) {
      tx.emit(
        Evidence.Recorded({
          operation: ending.operation,
          attempt: ending.attempt,
          why: "evidence",
        }),
      );

      return;
    }

    const payload = Option.match(mapping.value.from, {
      onNone: () => Result.succeed<Values>({}),
      // FLOW_STATE_ALLOW_UNKNOWN: a throw from an outcome mapper refuses the turn (WriteLanes R10).
      onSome: (from) => Result.try({ try: () => from.run(ending.value), catch: () => from.slot }),
    });

    tx.emit(
      Evidence.Delivered({
        operation: ending.operation,
        attempt: ending.attempt,
        event: mapping.value.event,
        actor: incarnation.actor,
      }),
    );

    if (Result.isFailure(payload)) {
      tx.emit(
        Evidence.Issue({
          code: "InvalidTurn",
          ending: Option.some({
            operation: ending.operation,
            attempt: ending.attempt,
            actor: incarnation.actor,
          }),
        }),
      );

      if (ending.redelivered) keep(incarnation.actor, ending);
      else endingMail(incarnation.actor, { ...ending, redelivered: true });

      return;
    }

    const alive =
      ending.current || ending.owner === ROOT_ACTIVATION || ending.owner === incarnation.activation;

    turn(incarnation, mapping.value.event, payload.success, {
      late: !alive,
      own: ending.lane,
      ending: Option.some(ending),
    });
  };

  const serve = (mail: Mail) =>
    Mail.$match(mail, {
      Event: ({ actor, tag, payload }) => {
        const incarnation = incarnationOf(actor);

        if (incarnation !== undefined)
          turn(incarnation, tag, payload, {
            late: false,
            own: Option.none(),
            ending: Option.none(),
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
        turn(left, armed.send, {}, { late: false, own: Option.none(), ending: Option.none() });
      },
      Ending: ({ actor, ending }) => {
        const incarnation = incarnationOf(actor);

        if (incarnation !== undefined) {
          serveEnding(incarnation, ending);

          return;
        }

        // No incarnation to hear it: the ending waits on its lane for the next one (Actors R10).
        const decided = ending.redelivered || ending.parked ? ending : admitToLane(ending);
        Option.match(decided.lane, {
          onNone: () => undefined,
          onSome: (lane) => park(actor, lane, decided.operation, { ...decided, parked: true }),
        });
      },
    });

  const drain = () => {
    for (let served = 0; served < 10_000 && tx.world().mail.length > 0; served += 1) {
      const [first, ...rest] = tx.world().mail;
      tx.set({ ...tx.world(), mail: rest });

      if (first !== undefined) serve(first);
    }
  };

  return { endingMapping, turn, serveEnding, serve, drain };
};

/**
 * Serving mail.
 */
export type ServeSteps = ReturnType<typeof makeServe>;
