import { Option } from "effect";
import { operationNamed, type OperationReference, type Reference } from "../fixtures/reference.ts";
import { type ActorRef, Observation, sameActor } from "../port.ts";
import { Fact, type Facts, type Oracle, steps } from "./oracle.ts";

const DECLINE = "(decline)";

type Pending = {
  readonly owner: Option.Option<ActorRef>;
  readonly event: string;
  readonly id: string;
};

type Ledger = {
  readonly owed: Map<string, number>;
  readonly owedInSpan: Map<string, number>;
  readonly parked: Map<string, number>;
  readonly operations: Map<string, string>;
  readonly owners: Map<string, ActorRef>;
  readonly unowned: Set<string>;
  readonly open: Set<string>;
  readonly unsent: Set<string>;
  readonly excused: Set<string>;
  readonly claimedSuperseded: Set<string>;
  readonly disposed: Array<ActorRef>;
  readonly declineOwners: Map<string, Array<Option.Option<ActorRef>>>;
};

type Runtime = "live" | "disposing";

const keyOf = (operation: string, attempt: Option.Option<string>) =>
  `${operation} ${Option.getOrElse(attempt, () => DECLINE)}`;

const bump = (counts: Map<string, number>, key: string, by: number) => {
  const next = (counts.get(key) ?? 0) + by;

  if (next === 0) counts.delete(key);
  else counts.set(key, next);
};

const take = (counts: Map<string, number>, key: string) => {
  if ((counts.get(key) ?? 0) > 0) bump(counts, key, -1);
};

const pay = (ledger: Ledger, key: string, what: string) => {
  if ((ledger.owed.get(key) ?? 0) > 0) {
    bump(ledger.owed, key, -1);
    take(ledger.owedInSpan, key);

    return [];
  }

  return [`WriteLanes I15: ${key} was ${what} with no ending owed (twice, or never decided)`];
};

const ownerOf = (ledger: Ledger, operation: string, attempt: Option.Option<string>) =>
  Option.isSome(attempt)
    ? Option.fromUndefinedOr(ledger.owners.get(attempt.value))
    : Option.flatten(Option.fromUndefinedOr(ledger.declineOwners.get(operation)?.[0]));

const disposedOwner = (ledger: Ledger, owner: Option.Option<ActorRef>) =>
  Option.exists(owner, (o) => ledger.disposed.some((d) => sameActor(d, o)));

const unexcused = (operation: OperationReference, attempted: boolean, claimed: boolean) => {
  const claim = claimed
    ? "; the runtime reported Superseded, which no later commit of the same actor backs"
    : "";

  if (!attempted)
    return `a decline has no Attempt for a later commit to replace or interrupt${claim}`;

  if (operation.concurrency === "cancel")
    return `no later commit of the same actor and operation interrupted it while undecided (cancel)${claim}`;

  if (operation.concurrency === "latest")
    return `no later commit of the same actor and operation replaced it while queued (latest)${claim}`;

  return `its operation is ${operation.concurrency}, which replaces and interrupts nothing${claim}`;
};

const recordedWithCause = (
  ledger: Ledger,
  reference: Reference,
  recorded: Extract<Observation, { readonly _tag: "Recorded" }>,
) => {
  const operation = Option.filter(operationNamed(reference, recorded.operation), (o) => o.attempts);

  if (Option.isNone(operation)) return [];
  const owner = ownerOf(ledger, recorded.operation, recorded.attempt);

  if (Option.isSome(recorded.attempt) && ledger.unowned.has(recorded.attempt.value)) return [];

  const excused = Option.exists(recorded.attempt, (a) => ledger.excused.has(a));

  if (recorded.why !== "ignored" && (excused || disposedOwner(ledger, owner))) return [];

  const claimed = Option.exists(recorded.attempt, (a) => ledger.claimedSuperseded.has(a));

  const why =
    recorded.why === "ignored"
      ? "the suite does not read Flow.ignore mappings"
      : unexcused(operation.value, Option.isSome(recorded.attempt), claimed);

  return [
    `WriteLanes I15: ${keyOf(recorded.operation, recorded.attempt)} was recorded (${recorded.why}) and not delivered, with no cause the suite saw: ${why}`,
  ];
};

const excuseEarlier = (
  ledger: Ledger,
  reference: Reference,
  operation: string,
  committer: ActorRef,
) => {
  const policy = Option.match(operationNamed(reference, operation), {
    onNone: () => undefined,
    onSome: (o) => o.concurrency,
  });

  const replaced = [...ledger.open].filter((earlier) => {
    const by = ledger.owners.get(earlier);

    const sameLane =
      ledger.operations.get(earlier) === operation && by !== undefined && sameActor(by, committer);

    return sameLane && (policy === "cancel" || (policy === "latest" && ledger.unsent.has(earlier)));
  });

  for (const earlier of replaced) ledger.excused.add(earlier);
};

const mint = (
  ledger: Ledger,
  reference: Reference,
  observed: Extract<Observation, { readonly _tag: "Minted" }>,
) => {
  if (Option.isSome(observed.actor)) {
    ledger.owners.set(observed.attempt, observed.actor.value);
    excuseEarlier(ledger, reference, observed.operation, observed.actor.value);
  } else ledger.unowned.add(observed.attempt);

  ledger.operations.set(observed.attempt, observed.operation);
  ledger.open.add(observed.attempt);
  ledger.unsent.add(observed.attempt);
};

const learn = (ledger: Ledger, reference: Reference, observed: Observation) => {
  if (Observation.$is("Minted")(observed)) mint(ledger, reference, observed);

  if (Observation.$is("Sent")(observed)) ledger.unsent.delete(observed.attempt);

  if (
    Observation.$is("Evidence")(observed) &&
    observed.kind === "Superseded" &&
    Option.isSome(observed.attempt)
  )
    ledger.claimedSuperseded.add(observed.attempt.value);
};

const owe = (
  ledger: Ledger,
  runtime: Runtime,
  ended: Extract<Observation, { readonly _tag: "Ended" }>,
) => {
  const key = keyOf(ended.operation, ended.attempt);

  bump(ledger.owed, key, 1);

  if (runtime === "disposing") bump(ledger.owedInSpan, key, 1);

  if (Option.isNone(ended.attempt))
    ledger.declineOwners.set(ended.operation, [
      ...(ledger.declineOwners.get(ended.operation) ?? []),
      ended.actor,
    ]);
  else ledger.open.delete(ended.attempt.value);

  return Option.exists(ended.attempt, (a) => ledger.unowned.has(a))
    ? [`WriteLanes I15: ${key} ended, and its Minted with no actor leaves its committer unknown`]
    : [];
};

const record = (
  ledger: Ledger,
  reference: Reference,
  recorded: Extract<Observation, { readonly _tag: "Recorded" }>,
) => {
  const key = keyOf(recorded.operation, recorded.attempt);
  const cause = recordedWithCause(ledger, reference, recorded);

  if (recorded.why === "letGo" && (ledger.parked.get(key) ?? 0) > 0) {
    bump(ledger.parked, key, -1);

    return cause;
  }

  return [...cause, ...pay(ledger, key, "recorded")];
};

const park = (ledger: Ledger, parked: Extract<Observation, { readonly _tag: "Parked" }>) => {
  const key = keyOf(parked.operation, parked.attempt);
  const reparked = (ledger.owed.get(key) ?? 0) === 0 && (ledger.parked.get(key) ?? 0) > 0;

  if (reparked) return [];
  bump(ledger.parked, key, 1);

  return pay(ledger, key, "parked");
};

const settleOne = (
  ledger: Ledger,
  reference: Reference,
  observed: Observation,
  runtime: Runtime,
) => {
  if (Observation.$is("Ended")(observed)) return owe(ledger, runtime, observed);

  if (Observation.$is("Recorded")(observed)) return record(ledger, reference, observed);

  if (Observation.$is("Parked")(observed)) return park(ledger, observed);

  if (Observation.$is("Unparked")(observed)) {
    const key = keyOf(observed.operation, observed.attempt);

    if ((ledger.parked.get(key) ?? 0) === 0)
      return [`WriteLanes I15: ${key} unparked, never parked`];
    bump(ledger.parked, key, -1);
    bump(ledger.owed, key, 1);
  }

  return [];
};

const deliveries = (
  ledger: Ledger,
  runtime: Runtime,
  observed: Observation,
  pending: Array<Pending>,
) => {
  if (!Observation.$is("Delivered")(observed)) return [];
  const key = keyOf(observed.operation, observed.attempt);
  const owner = ownerOf(ledger, observed.operation, observed.attempt);

  if (Option.isNone(observed.attempt)) ledger.declineOwners.get(observed.operation)?.shift();
  pending.push({ owner, event: observed.event, id: key });
  const paid = pay(ledger, key, "delivered");

  if (runtime === "live") return paid;

  return [
    ...paid,
    `WriteLanes I15: ${key} was delivered after the suite started the Runtime's disposal, which delivers nothing and parks every ending`,
  ];
};

const runs = (observed: Observation, p: Pending) => {
  if (Observation.$is("Unhandled")(observed) || Observation.$is("Denied")(observed))
    return p.event === observed.event;

  return (
    Observation.$is("Turn")(observed) &&
    p.event === observed.event &&
    Option.match(p.owner, { onNone: () => true, onSome: (o) => sameActor(o, observed.actor) })
  );
};

const ran = (observed: Observation, pending: Array<Pending>) => {
  if (Observation.$is("Issue")(observed)) {
    const refused = observed.code === "InvalidTurn" || observed.code === "UnmappedEnding";

    if (refused && pending.length === 1) pending.splice(0, 1);

    return;
  }

  const at = pending.findIndex((p) => runs(observed, p));

  if (at >= 0) pending.splice(at, 1);
};

// RETURN_TYPE: the Ledger record; inference would widen its empty collections.
const fresh = (): Ledger => ({
  owed: new Map(),
  owedInSpan: new Map(),
  parked: new Map(),
  operations: new Map(),
  owners: new Map(),
  unowned: new Set(),
  open: new Set(),
  unsent: new Set(),
  excused: new Set(),
  claimedSuperseded: new Set(),
  disposed: [],
  declineOwners: new Map(),
});

const forgetLife = (ledger: Ledger, runtime: Runtime) => {
  if (runtime === "disposing")
    for (const [key, count] of ledger.owedInSpan) bump(ledger.parked, key, count);
  ledger.owed.clear();
  ledger.owedInSpan.clear();
  ledger.declineOwners.clear();
};

const ledgerOf = (facts: Facts) => {
  const ledger = fresh();
  let runtime: Runtime = "live";

  return steps(facts.timeline).flatMap((step) => {
    const pending: Array<Pending> = [];

    const found = step.flatMap((fact) => {
      if (Fact.$is("Reloaded")(fact)) {
        forgetLife(ledger, runtime);
        runtime = "live";
      }

      if (Fact.$is("DisposingRuntime")(fact)) runtime = "disposing";

      if (Fact.$is("Disposed")(fact)) ledger.disposed.push(fact.actor);

      if (Fact.$is("Ensured")(fact)) {
        const at = ledger.disposed.findIndex((d) => sameActor(d, fact.actor));

        if (at >= 0) ledger.disposed.splice(at, 1);
      }

      if (!Fact.$is("Reported")(fact)) return [];
      const observed = fact.observation;
      learn(ledger, facts.reference, observed);
      ran(observed, pending);

      return [
        ...settleOne(ledger, facts.reference, observed, runtime),
        ...deliveries(ledger, runtime, observed, pending),
      ];
    });

    const unrun = pending.map(
      (p) =>
        `WriteLanes I15: ${p.id} was delivered as ${p.event}${Option.match(p.owner, { onNone: () => "", onSome: (o) => ` to ${o.machine}/${o.id}` })} and no turn of its actor ran it`,
    );

    const owedNow = [...ledger.owed.keys()].filter(
      (key) => (ledger.owed.get(key) ?? 0) > (ledger.owedInSpan.get(key) ?? 0),
    );

    const undelivered = owedNow.map(
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
 * owed. A delivery must be run, in that step, by a turn of the actor that committed it, or be
 * unhandled or denied by that actor's handlers, or refused (which the runtime retries).
 *
 * A referenced write's ending may be recorded and not delivered only for a cause the suite can
 * derive from its commits: under `cancel`, a later commit of the same actor and operation was
 * minted while the Attempt was undecided; under `latest`, a later commit of the same actor and
 * operation was minted while the Attempt was queued, never sent; or the suite disposed its actor.
 *
 * **Gotchas**
 *
 * - Anchored to the suite's own steps (dispose, and an ensure that ends a disposal's excuse) and
 *   the fixtures' references. Who committed an Attempt is the runtime's report (its Minted's
 *   actor), and so is the order of its commits; a Superseded claim alone excuses nothing, it only
 *   words the violation. A Minted with no actor leaves its committer unknown, so its ending is a
 *   violation.
 * - Minted carries no key on the prototype, so "the same lane" is checked as the same actor and
 *   operation: a later commit under another key of the operation also excuses. This is lenient,
 *   never a false violation.
 * - A reload forgets what was owed: what survives on disk is owed again as the endings the new
 *   boot decides, which the restore oracle owns. Parked endings stay parked across it, so a later
 *   boot may unpark each once.
 * - Disposal parks what the runtime decides after the suite starts its disposal: a call that
 *   settles within the bound, a never-sent commit's NotSent { Disposed }, and an unknown
 *   { Disposed } past the bound. From that start to the next reload, an ending decided in that span
 *   counts as parked at the reload, whether or not the runtime reported a `Parked` for it; an ending
 *   decided before the start is not exempt and reads as undelivered at the step that decided it.
 *   Any delivery in that span is a violation: disposal runs no machine event.
 * - `Unhandled` and `Denied` carry no actor, so they settle a delivery by its event only. An
 *   `Issue` carries only its code, so an InvalidTurn or UnmappedEnding settles a delivery only when
 *   it is the one delivery pending in its step; with more pending, the step reports them unrun.
 * - Endings recorded for causes the suite cannot see yet (a releasing lane, an ended fragment's
 *   lookup) need the fragment fixtures; until then they read as violations.
 * - A parked ending still parked at the end of a case is not yet checked.
 */
export const oneDelivery: Oracle = {
  name: "one-delivery",
  guarantee: "WriteLanes I15, I16, I22",
  check: (facts: Facts) => ledgerOf(facts),
};
