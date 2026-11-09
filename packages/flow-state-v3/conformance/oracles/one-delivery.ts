import { Option } from "effect";
import { operationNamed, type Reference } from "../fixtures/reference.ts";
import { type ActorRef, Observation } from "../port.ts";
import { sameData } from "./equality.ts";
import { Fact, type Facts, type Oracle, steps } from "./oracle.ts";

const DECLINE = "(decline)";

type Pending = {
  readonly owner: Option.Option<ActorRef>;
  readonly event: string;
  readonly id: string;
};

type Ledger = {
  readonly owed: Map<string, number>;
  readonly parked: Map<string, number>;
  readonly owners: Map<string, ActorRef>;
  readonly superseded: Set<string>;
  readonly disposed: Array<ActorRef>;
  readonly declineOwners: Map<string, Array<Option.Option<ActorRef>>>;
};

const keyOf = (operation: string, attempt: Option.Option<string>) =>
  `${operation} ${Option.getOrElse(attempt, () => DECLINE)}`;

const bump = (counts: Map<string, number>, key: string, by: number) => {
  const next = (counts.get(key) ?? 0) + by;

  if (next === 0) counts.delete(key);
  else counts.set(key, next);
};

const pay = (ledger: Ledger, key: string, what: string) => {
  if ((ledger.owed.get(key) ?? 0) > 0) {
    bump(ledger.owed, key, -1);

    return [];
  }

  return [`WriteLanes I15: ${key} was ${what} with no ending owed (twice, or never decided)`];
};

const ownerOf = (ledger: Ledger, operation: string, attempt: Option.Option<string>) =>
  Option.isSome(attempt)
    ? Option.fromUndefinedOr(ledger.owners.get(attempt.value))
    : Option.flatten(Option.fromUndefinedOr(ledger.declineOwners.get(operation)?.[0]));

const disposedOwner = (ledger: Ledger, owner: Option.Option<ActorRef>) =>
  Option.match(owner, {
    onNone: () => ledger.disposed.length > 0,
    onSome: (o) => ledger.disposed.some((d) => sameData(d, o)),
  });

const recordedWithCause = (
  ledger: Ledger,
  reference: Reference,
  recorded: Extract<Observation, { readonly _tag: "Recorded" }>,
) => {
  const operation = Option.filter(operationNamed(reference, recorded.operation), (o) => o.attempts);

  if (Option.isNone(operation)) return [];
  const owner = ownerOf(ledger, recorded.operation, recorded.attempt);
  const superseded = Option.exists(recorded.attempt, (a) => ledger.superseded.has(a));
  const declared = operation.value.concurrency === "cancel" || superseded;

  if (recorded.why !== "ignored" && (declared || disposedOwner(ledger, owner))) return [];

  return [
    `WriteLanes I15: ${keyOf(recorded.operation, recorded.attempt)} was recorded (${recorded.why}) and not delivered, with no declared cause the suite saw`,
  ];
};

const learn = (ledger: Ledger, observed: Observation) => {
  if (Observation.$is("Minted")(observed) && Option.isSome(observed.actor))
    ledger.owners.set(observed.attempt, observed.actor.value);

  if (
    Observation.$is("Evidence")(observed) &&
    observed.kind === "Superseded" &&
    Option.isSome(observed.attempt)
  )
    ledger.superseded.add(observed.attempt.value);
};

const settleOne = (ledger: Ledger, reference: Reference, observed: Observation) => {
  if (Observation.$is("Ended")(observed)) {
    bump(ledger.owed, keyOf(observed.operation, observed.attempt), 1);

    if (Option.isNone(observed.attempt))
      ledger.declineOwners.set(observed.operation, [
        ...(ledger.declineOwners.get(observed.operation) ?? []),
        observed.actor,
      ]);

    return [];
  }

  if (Observation.$is("Recorded")(observed))
    return [
      ...recordedWithCause(ledger, reference, observed),
      ...pay(ledger, keyOf(observed.operation, observed.attempt), "recorded"),
    ];

  if (Observation.$is("Parked")(observed)) {
    const key = keyOf(observed.operation, observed.attempt);
    bump(ledger.parked, key, 1);

    return pay(ledger, key, "parked");
  }

  if (Observation.$is("Unparked")(observed)) {
    const key = keyOf(observed.operation, observed.attempt);

    if ((ledger.parked.get(key) ?? 0) === 0)
      return [`WriteLanes I15: ${key} unparked, never parked`];
    bump(ledger.parked, key, -1);
    bump(ledger.owed, key, 1);
  }

  return [];
};

const deliveries = (ledger: Ledger, observed: Observation, pending: Array<Pending>) => {
  if (!Observation.$is("Delivered")(observed)) return [];
  const key = keyOf(observed.operation, observed.attempt);
  const owner = ownerOf(ledger, observed.operation, observed.attempt);

  if (Option.isNone(observed.attempt)) ledger.declineOwners.get(observed.operation)?.shift();
  pending.push({ owner, event: observed.event, id: key });

  return pay(ledger, key, "delivered");
};

const ran = (observed: Observation, pending: Array<Pending>) => {
  const at = pending.findIndex((p) => {
    if (Observation.$is("Unhandled")(observed)) return p.event === observed.event;

    if (Observation.$is("Issue")(observed))
      return observed.code === "InvalidTurn" || observed.code === "UnmappedEnding";

    return (
      Observation.$is("Turn")(observed) &&
      p.event === observed.event &&
      Option.match(p.owner, { onNone: () => true, onSome: (o) => sameData(o, observed.actor) })
    );
  });

  if (at >= 0) pending.splice(at, 1);
};

// RETURN_TYPE: the Ledger record; inference would widen its empty collections.
const fresh = (): Ledger => ({
  owed: new Map(),
  parked: new Map(),
  owners: new Map(),
  superseded: new Set(),
  disposed: [],
  declineOwners: new Map(),
});

const forgetLife = (ledger: Ledger) => {
  ledger.owed.clear();
  ledger.parked.clear();
  ledger.declineOwners.clear();
};

const ledgerOf = (facts: Facts) => {
  const ledger = fresh();

  return steps(facts.timeline).flatMap((step) => {
    const pending: Array<Pending> = [];

    const found = step.flatMap((fact) => {
      if (Fact.$is("Reloaded")(fact)) forgetLife(ledger);

      if (Fact.$is("Disposed")(fact)) ledger.disposed.push(fact.actor);

      if (!Fact.$is("Reported")(fact)) return [];
      const observed = fact.observation;
      learn(ledger, observed);
      ran(observed, pending);

      return [
        ...settleOne(ledger, facts.reference, observed),
        ...deliveries(ledger, observed, pending),
      ];
    });

    const unrun = pending.map(
      (p) =>
        `WriteLanes I15: ${p.id} was delivered as ${p.event}${Option.match(p.owner, { onNone: () => "", onSome: (o) => ` to ${o.machine}/${o.id}` })} and no turn of its actor ran it`,
    );

    const undelivered = [...ledger.owed.keys()].map(
      (key) => `WriteLanes I15: ${key} ended and was never delivered, parked or recorded`,
    );

    return [...found, ...unrun, ...undelivered];
  });
};

/**
 * Every ending is delivered once to its own actor, parked for it, or recorded as evidence by
 * declaration: never both, never twice.
 *
 * **Details**
 *
 * A ledger over each step: an ending the runtime reports is owed until it is delivered, parked
 * (then owed again when unparked) or recorded. By the end of the step that decided it, nothing is
 * owed. A delivery must be run, in that step, by a turn of the actor that committed it (or be
 * refused or unhandled, which the runtime retries). A referenced write's ending may be recorded
 * and not delivered only for a cause the suite holds: its operation's concurrency is `cancel`,
 * the runtime said the Attempt was superseded, or the suite disposed its actor.
 *
 * **Gotchas**
 *
 * - Anchored to the suite's own steps (dispose) and the fixtures' references; who committed an
 *   Attempt, and whether it was superseded, are the runtime's reports.
 * - A reload forgets what was owed: what survives on disk is owed again as the endings the new
 *   boot decides, which the restore oracle owns.
 */
export const oneDelivery: Oracle = {
  name: "one-delivery",
  guarantee: "WriteLanes I15, I16, I22",
  check: (facts: Facts) => ledgerOf(facts),
};
