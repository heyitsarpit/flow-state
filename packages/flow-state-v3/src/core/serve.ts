import { Option, Result } from "effect";
import { type Mapping, Operation, type Values } from "./compiled.ts";
import type { Member } from "./evidence.ts";
import { Act } from "./evidence-of.ts";
import { Resolved, runTurn, TurnResult } from "./turn.ts";
import { isInFlight, ROOT_ACTIVATION, type Tx, without } from "./tx.ts";
import type { Heard, LedgerSteps, Owed } from "./ledger.ts";
import { actorKey, type Incarnation, Mail } from "./world.ts";
import type { LaneSteps } from "./lanes.ts";
import type { IncarnationSteps } from "./incarnations.ts";

const HEARD: Heard = "Heard";

const REFUSED: Heard = "Refused";

const UNMAPPED: Heard = "Unmapped";

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
  const { armSchedules, stopSchedules, setIncarnation, publish } = incarnations;

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

  const turn = (
    incarnation: Incarnation,
    tag: string,
    payload: Values,
    route: {
      readonly late: boolean;
      readonly own: Option.Option<string>;
      readonly ending: Option.Option<Owed>;
    },
  ) => {
    const compiled = tx.machines.get(incarnation.actor.machine);

    if (compiled === undefined) return HEARD;

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

    return TurnResult.$match(result, {
      Unhandled: () => {
        tx.act(Act.Unhandled({ actor: incarnation.actor, event: tag }));

        return HEARD;
      },
      Denied: ({ reasons }) => {
        tx.act(Act.Denied({ actor: incarnation.actor, event: tag, reasons }));

        return HEARD;
      },
      Refused: ({ code }) => {
        tx.act(Act.Refused({ code, actor: incarnation.actor, ending: route.ending }));

        return REFUSED;
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

        if (after.memory !== incarnation.memory || after.state !== incarnation.state)
          publish(after);
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

    if (Result.isFailure(payload)) {
      tx.act(
        Act.Refused({ code: "InvalidTurn", actor: incarnation.actor, ending: Option.some(ending) }),
      );

      return REFUSED;
    }

    const alive =
      ending.current || ending.owner === ROOT_ACTIVATION || ending.owner === incarnation.activation;

    return turn(incarnation, mapping.value.event, payload.success, {
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
      Ending: ({ actor, id }) => {
        const incarnation = incarnationOf(actor);

        // A row is in the mailbox only while its identity can hear it; every end suspends it.
        if (incarnation !== undefined) ledger.tryOne(id, (row) => serveEnding(incarnation, row));
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
