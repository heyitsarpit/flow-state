import { Option } from "effect";
import { endingOf } from "../dsl/domain.ts";
import type { Predicted } from "../dsl/lifecycle-owed.ts";
import { Fact, type Violation, violation } from "../dsl/oracle.ts";
import {
  type ActorRef,
  type Channel,
  type Json,
  Observation,
  sameActor,
  sameJson,
} from "../port.ts";
import { attemptKey, type Call, requested, type State } from "./anchor.ts";
import { RequestPhase } from "../world/network.ts";
import { Phase } from "./phases.ts";

const refusedTurn = (step: ReadonlyArray<Fact>) =>
  step.some(
    (f) =>
      Fact.$is("Reported")(f) &&
      Observation.$is("Issue")(f.observation) &&
      Option.isNone(f.observation.ending),
  );

/**
 * A step's end: each driven event a live actor still holds, which no turn, `Unhandled` or `Denied`
 * answered, breaks Turn R2, and its credit ends with the step. Kept while the Runtime is disposing;
 * not judged in a step with a refused turn (an `Issue` with no ending, Turn I3), which names no
 * actor.
 */
export const closed = <
  J extends { readonly state: State; readonly violations: ReadonlyArray<Violation> },
>(
  judged: J,
  step: ReadonlyArray<Fact>,
) => {
  if (judged.state.disposing) return judged;

  const left = refusedTurn(step)
    ? []
    : [...judged.state.actors].flatMap(([key, a]) =>
        Phase.$is("Live")(a.phase)
          ? a.driven.map((c) =>
              violation(`Turn I2 (R2): ${key} was sent ${c.event}, but no turn ran it in the step`),
            )
          : [],
      );

  return {
    ...judged,
    state: {
      ...judged.state,
      actors: new Map([...judged.state.actors].map(([key, a]) => [key, { ...a, driven: [] }])),
    },
    violations: [...judged.violations, ...left],
  };
};

/**
 * How the suite's server settled an Attempt, by the latest answer it gave the Attempt's request
 * in this step or an earlier one, classified by the request's own operation of the caller's
 * machine (`dsl/domain.ts` `endingOf`, against every request the server received); `None` when
 * no answer settles it.
 */
export const settledBy = (
  state: State,
  step: ReadonlyArray<Fact>,
  machine: string,
  attempt: Option.Option<string>,
) => {
  const requests = step.reduce(
    (s, f) => (Fact.$is("Requested")(f) || Fact.$is("Answered")(f) ? requested(s, f.request) : s),
    state,
  ).requests;

  const request = requests.findLast(
    (r) =>
      Option.exists(attempt, (id) => Option.contains(r.key, id)) &&
      RequestPhase.$is("Answered")(r.phase),
  );

  if (request === undefined || !RequestPhase.$is("Answered")(request.phase))
    return Option.none<Channel>();

  const { answer } = request.phase;

  return Option.flatMap(
    Option.fromUndefinedOr(state.reference[machine]?.[request.operation]),
    (o) => Option.map(endingOf(o, requests, request, answer), (e) => e.channel),
  );
};

/**
 * The predicted turn a mint belongs to: the step's latest, when it is the reported actor's. The
 * call's actor and key are the prediction's (the key its folds give, none for a key-less
 * operation); a mint no prediction owns records no call, so its ending routes `either`.
 */
export const mintOwed = (open: Option.Option<Predicted>, actor: Option.Option<ActorRef>) =>
  Option.filter(open, (t) => Option.exists(actor, (a) => sameActor(a, t.actor)));

/**
 * The retries a turn runs, by its predicted header and the rows of its machine (WriteLanes R9,
 * Turn R20), never its reported members: each names which calls it re-owns. Every row whose
 * event, from, to and claimed alternative match counts, since the guards that choose among them
 * are not all computed here (an allowed set: a retry no row of the turn names re-owns nothing).
 * A keyed retry names its folded key's lane, or every lane of its operation without one; a
 * key-less one on a keyed operation names its own ending's Attempt; on an unkeyed operation, its
 * one lane.
 */
export const retriesOwed = (
  state: State,
  turn: {
    readonly actor: ActorRef;
    readonly event: string;
    readonly from: string;
    readonly to: string;
    readonly at: Option.Option<string>;
    readonly keys: Readonly<Record<string, Json>>;
    readonly delivered: Option.Option<{
      readonly operation: string;
      readonly attempt: Option.Option<string>;
    }>;
  },
) =>
  (state.rows[turn.actor.machine] ?? [])
    .filter(
      (row) =>
        row.event === turn.event &&
        (row.from === "any" || row.from === turn.from) &&
        (row.to === "same" ? turn.to === turn.from : row.to === turn.to) &&
        (!row.claimed || Option.exists(row.at, (at) => Option.contains(turn.at, at))),
    )
    .flatMap((row) => row.members)
    .flatMap((m) => (m.kind === "retry" ? [m] : []))
    .map((m) => {
      const keyed = (state.reference[turn.actor.machine]?.[m.operation]?.keyFields.length ?? 0) > 0;
      const key = Option.fromUndefinedOr(turn.keys[m.operation]);

      const own = Option.flatMap(
        Option.filter(turn.delivered, (d) => d.operation === m.operation),
        (d) => d.attempt,
      );

      const matches = (call: Call) => {
        if (!keyed) return true;

        if (m.keyed)
          return Option.match(key, {
            onNone: () => true,
            onSome: (k) => Option.exists(call.key, (ck) => sameJson(ck, k)),
          });

        return Option.contains(own, call.attempt);
      };

      return { operation: m.operation, matches };
    });

/**
 * The machine of the call an ending names, from the suite's own mint record.
 */
export const machineOfCall = (state: State, operation: string, attempt: Option.Option<string>) =>
  Option.match(attempt, {
    onNone: () => "",
    onSome: (id) => state.calls.get(attemptKey(operation, id))?.actor.split(" ")[0] ?? "",
  });

/**
 * Whether a step boots a page, attaches a use, or neither, by the suite's facts.
 */
export const attachingKind = (step: ReadonlyArray<Fact>) => {
  if (step.some(Fact.$is("Reloaded"))) return "boot" as const;

  return step.some(Fact.$is("Ensured")) ? ("attach" as const) : ("none" as const);
};
