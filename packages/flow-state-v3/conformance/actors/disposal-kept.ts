import { Data, Option, Predicate } from "effect";
import { type LaneId, laneOf, sameLane } from "../dsl/domain.ts";
import { Fact } from "../dsl/oracle.ts";
import type { Reference } from "../fixtures/reference.ts";
import { type ActorRef, type Json, Observation, sameActor } from "../port.ts";
import {
  isAnswered,
  isHeld,
  type Ledger,
  laneOfHead,
  named,
  openHeads,
  type Owed,
} from "./disposal-ledger.ts";

type KeptLane = Data.TaggedEnum<{
  Dropped: { owed: Owed };
  Unbound: { owed: Owed; by: "disposeActor" | "forget" };
}>;

const KeptLane = Data.taggedEnum<KeptLane>();

/**
 * The lanes the disposal oracle keeps watching between lives: a definite head a Runtime disposal
 * dropped (until a new commit of the lane), and a lane left unbound by disposeActor or forget
 * (until an ensure adopts its actor). A lane holds at most one of each, since an unbound lane's
 * call may settle in a later Runtime disposal.
 */
export type Kept = ReadonlyArray<{ readonly lane: LaneId; readonly kept: KeptLane }>;

type KeptMove = Data.TaggedEnum<{
  Keep: { lane: LaneId; kept: KeptLane };
  Recommitted: { owner: ActorRef; operation: string; lane: Option.Option<LaneId> };
  Adopted: { owner: ActorRef };
}>;

const KeptMove = Data.taggedEnum<KeptMove>();

const recommits = (
  e: Kept[number],
  owner: ActorRef,
  operation: string,
  lane: Option.Option<LaneId>,
) =>
  Option.match(lane, {
    onNone: () => sameActor(e.lane.owner, owner) && e.lane.operation === operation,
    onSome: (l) => sameLane(e.lane, l),
  });

// RETURN_TYPE: a reducer's step; `reduce` needs the accumulator's declared type.
const keptStep = (kept: Kept, by: KeptMove): Kept =>
  KeptMove.$match(by, {
    Keep: (k) => [
      ...kept.filter((e) => !sameLane(e.lane, k.lane) || e.kept._tag !== k.kept._tag),
      { lane: k.lane, kept: k.kept },
    ],
    Recommitted: ({ owner, operation, lane }) =>
      kept.filter((e) => !KeptLane.$is("Dropped")(e.kept) || !recommits(e, owner, operation, lane)),
    Adopted: ({ owner }) =>
      kept.filter((e) => !KeptLane.$is("Unbound")(e.kept) || !sameActor(e.lane.owner, owner)),
  });

const unboundOf = (kept: Kept) =>
  kept.flatMap((e) => (KeptLane.$is("Unbound")(e.kept) ? [e.kept] : []));

const droppedOf = (kept: Kept) =>
  kept.flatMap((e) =>
    KeptLane.$is("Dropped")(e.kept) ? [{ lane: e.lane, owed: e.kept.owed }] : [],
  );

/**
 * The kept lanes after a Runtime disposal dropped these definite heads.
 */
export const dropHeads = (
  kept: Kept,
  heads: ReadonlyArray<{ readonly lane: LaneId; readonly owed: Owed }>,
) =>
  heads
    .map(({ lane, owed }) => KeptMove.Keep({ lane, kept: KeptLane.Dropped({ owed }) }))
    .reduce(keptStep, kept);

const RULE = { disposeActor: "Actors I29", forget: "Actors I32" } as const;

/**
 * The reports in a step after `fact`.
 */
export const reportsAfter = (step: ReadonlyArray<Fact>, fact: Fact) =>
  step
    .slice(step.indexOf(fact) + 1)
    .flatMap((f) => (Fact.$is("Reported")(f) ? [f.observation] : []));

/**
 * The events delivered for an Attempt among these reports.
 */
export const deliveredEvents = (reports: ReadonlyArray<Observation>, { id, attempt }: Owed) =>
  reports.flatMap((o) =>
    Observation.$is("Delivered")(o) &&
    o.operation === attempt.operation &&
    Option.contains(o.attempt, id)
      ? [o.event]
      : [],
  );

const uncertain = (row: Json) =>
  Predicate.isObjectKeyword(row) &&
  Object.entries(row).some(([k, v]) => k === "uncertain" && v === true);

const releasedUnbound = (kept: Kept, observation: Observation) => {
  if (!Observation.$is("Evidence")(observation) || observation.kind !== "Released") return [];

  return unboundOf(kept)
    .filter(({ owed }) => Option.contains(observation.attempt, owed.id))
    .map(
      ({ owed, by }) =>
        `${RULE[by]}: ${named(owed)} was Held or on the wire when the suite called ${by} on its actor, and the runtime released it before any ensure adopted the lane; ${by} keeps every lane that is not Idle`,
    );
};

const endedUnknownAgain = (kept: Kept, observation: Observation) => {
  if (!Observation.$is("Ended")(observation) || observation.channel !== "unknown") return [];

  return droppedOf(kept)
    .filter(({ owed }) => Option.contains(observation.attempt, owed.id))
    .map(
      ({ owed }) =>
        `Actors I36: ${named(owed)} ended definitely during the Runtime's disposal, yet a later boot ended it unknown ${observation.reason}, so its head stayed Held; a definite ending drops the head`,
    );
};

const recommitted = (reference: Reference, observation: Observation) => {
  if (!Observation.$is("Minted")(observation) || Option.isNone(observation.actor)) return [];
  const owner = observation.actor.value;
  const { operation } = observation;

  return [
    KeptMove.Recommitted({
      owner,
      operation,
      lane: Option.map(observation.key, (key) => laneOf(owner, reference, operation, key)),
    }),
  ];
};

const readHeld = (reference: Reference, kept: Kept, read: Data.TaggedEnum.Value<Fact, "Read">) => {
  const lane = laneOf(read.actor, reference, read.operation, read.key);
  const found = droppedOf(kept).find((d) => sameLane(d.lane, lane));

  if (found === undefined || !Option.exists(read.row, uncertain)) return [];

  return [
    `Actors I36: ${named(found.owed)} ended definitely during the Runtime's disposal, and after the next boot its row reads uncertain, so its head stayed Held; a definite ending drops the head`,
  ];
};

const adopted = (
  step: ReadonlyArray<Fact>,
  ledger: Ledger,
  kept: Kept,
  fact: Data.TaggedEnum.Value<Fact, "Ensured">,
) => {
  const reports = reportsAfter(step, fact);

  return unboundOf(kept)
    .filter(({ owed }) => sameActor(owed.attempt.owner, fact.actor))
    .filter(
      ({ owed }) =>
        (isHeld(ledger, owed.id) || isAnswered(ledger, owed.id)) &&
        deliveredEvents(reports, owed).length === 0,
    )
    .map(
      ({ owed, by }) =>
        `${RULE[by]}: ${named(owed)} was Held or on the wire when the suite called ${by} on its actor; the ensure that adopted the actor delivered no ending of it (an unbound lane binds to the adopting incarnation, which hears it once), so the lane did not survive ${by}`,
    );
};

const unbind = (ledger: Ledger, actor: ActorRef, by: "disposeActor" | "forget") =>
  openHeads(ledger).flatMap((owed) =>
    sameActor(owed.attempt.owner, actor)
      ? Option.toArray(laneOfHead(ledger, owed.id)).map((lane) =>
          KeptMove.Keep({ lane, kept: KeptLane.Unbound({ owed, by }) }),
        )
      : [],
  );

const moved = (kept: Kept, moves: ReadonlyArray<KeptMove>, found: ReadonlyArray<string>) =>
  [moves.reduce(keptStep, kept), found] as const;

/**
 * The kept lanes after one fact, with what the fact breaks: a release or an unknown ending of a
 * kept lane, a read of a dropped head's row as uncertain, or an adopting ensure that delivers
 * nothing for a lane left Held or settled while unbound.
 */
export const keptFact = (
  reference: Reference,
  step: ReadonlyArray<Fact>,
  ledger: Ledger,
  kept: Kept,
  fact: Fact,
) =>
  Fact.$match(fact, {
    Stepped: () => moved(kept, [], []),
    Requested: () => moved(kept, [], []),
    Answered: () => moved(kept, [], []),
    Reported: ({ observation }) =>
      moved(kept, recommitted(reference, observation), [
        ...releasedUnbound(kept, observation),
        ...endedUnknownAgain(kept, observation),
      ]),
    Reloaded: () => moved(kept, [], []),
    Disposed: ({ actor }) => moved(kept, unbind(ledger, actor, "disposeActor"), []),
    Forgot: ({ actor }) => moved(kept, unbind(ledger, actor, "forget"), []),
    Ensured: (ensured) =>
      moved(
        kept,
        [KeptMove.Adopted({ owner: ensured.actor })],
        adopted(step, ledger, kept, ensured),
      ),
    Released: () => moved(kept, [], []),
    DisposingRuntime: () => moved(kept, [], []),
    Drove: () => moved(kept, [], []),
    Unstoppable: () => moved(kept, [], []),
    Advanced: () => moved(kept, [], []),
    Read: (read) => moved(kept, [], readHeld(reference, kept, read)),
  });
