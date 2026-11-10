import { Option, Predicate } from "effect";
import { Fact, type Facts, type Oracle, steps } from "../dsl/oracle.ts";
import { operationNamed, type Reference } from "../fixtures/reference.ts";
import { type ActorRef, type Json, Observation, sameActor } from "../port.ts";
import { type Answer, type Request, RequestPhase } from "../world/network.ts";

type Head = { readonly attempt: string; readonly owner: ActorRef; readonly operation: string };

type Owed = { readonly heads: ReadonlyArray<Head>; readonly since: string };

type Ledger = {
  readonly owners: Map<string, ActorRef>;
  readonly heads: Map<string, Head>;
  readonly sends: Set<string>;
  readonly settled: Set<string>;
  readonly unsure: Set<string>;
  readonly uses: Array<ActorRef>;
};

const fieldsOf = (input: Json, fields: ReadonlyArray<string>) =>
  fields.map((field) =>
    Predicate.isObjectKeyword(input)
      ? (Object.entries(input).find(([key]) => key === field)?.[1] ?? null)
      : null,
  );

const laneOf = (owner: ActorRef, reference: Reference, request: Request) => {
  const fields = Option.match(operationNamed(reference, request.operation), {
    onNone: () => [],
    onSome: (o) => o.keyFields,
  });

  return JSON.stringify([
    owner.machine,
    owner.id,
    request.operation,
    fieldsOf(request.input, fields),
  ]);
};

const decide = (ledger: Ledger, reference: Reference, request: Request, answer: Answer) => {
  for (const attempt of Option.toArray(request.key)) {
    const channel = Option.match(operationNamed(reference, request.operation), {
      onNone: () => "unknown",
      onSome: (o) => o.classify(answer, ledger.unsure.has(attempt)),
    });

    if (channel === "unknown") ledger.unsure.add(attempt);
    else ledger.settled.add(attempt);
  }
};

const sent = (ledger: Ledger, reference: Reference, request: Request) => {
  const attempt = Option.getOrUndefined(request.key);
  const owner = attempt === undefined ? undefined : ledger.owners.get(attempt);
  const write = Option.exists(operationNamed(reference, request.operation), (o) => o.attempts);

  if (attempt === undefined || owner === undefined || !write) return;

  if (ledger.sends.has(attempt)) ledger.unsure.add(attempt);
  ledger.sends.add(attempt);
  ledger.heads.set(laneOf(owner, reference, request), {
    attempt,
    owner,
    operation: request.operation,
  });

  if (RequestPhase.$is("Answered")(request.phase))
    decide(ledger, reference, request, request.phase.answer);
};

const cancelled = (ledger: Ledger, reference: Reference, actor: ActorRef, event: string) => {
  for (const [lane, head] of ledger.heads) {
    const cancels = Option.exists(
      operationNamed(reference, head.operation),
      (o) => Object.hasOwn(o.cancels, event) && sameActor(head.owner, actor),
    );

    if (cancels) ledger.heads.delete(lane);
  }
};

const learnUses = (ledger: Ledger, fact: Fact) => {
  if (Fact.$is("Ensured")(fact)) ledger.uses.push(fact.actor);

  if (Fact.$is("Released")(fact)) {
    const at = ledger.uses.findIndex((u) => sameActor(u, fact.actor));

    if (at >= 0) ledger.uses.splice(at, 1);
  }

  if (Fact.$is("Disposed")(fact)) {
    const kept = ledger.uses.filter((u) => !sameActor(u, fact.actor));
    ledger.uses.splice(0, ledger.uses.length, ...kept);
  }
};

const learnReport = (ledger: Ledger, observation: Observation) => {
  if (Observation.$is("Minted")(observation) && Option.isSome(observation.actor))
    ledger.owners.set(observation.attempt, observation.actor.value);

  if (Observation.$is("Evidence")(observation) && observation.kind === "Released")
    for (const attempt of Option.toArray(observation.attempt)) ledger.settled.add(attempt);
};

const learn = (ledger: Ledger, reference: Reference, fact: Fact) => {
  learnUses(ledger, fact);

  if (Fact.$is("Reported")(fact)) learnReport(ledger, fact.observation);

  if (Fact.$is("Answered")(fact)) decide(ledger, reference, fact.request, fact.answer);

  if (Fact.$is("Drove")(fact)) cancelled(ledger, reference, fact.actor, fact.event);

  if (Fact.$is("Requested")(fact)) sent(ledger, reference, fact.request);
};

const delivered = (step: ReadonlyArray<Fact>, head: Head) =>
  step
    .slice(step.findIndex(Fact.$is("Reloaded")))
    .some(
      (fact) =>
        Fact.$is("Reported")(fact) &&
        Observation.$is("Delivered")(fact.observation) &&
        fact.observation.operation === head.operation &&
        Option.contains(fact.observation.attempt, head.attempt),
    );

const survived = (ledger: Ledger, step: ReadonlyArray<Fact>, owed: Owed) =>
  owed.heads
    .filter((head) => ledger.uses.some((u) => sameActor(u, head.owner)))
    .filter((head) => !delivered(step, head))
    .map(
      (head) =>
        `Actors I29: ${head.operation} ${head.attempt} of ${head.owner.machine}/${head.owner.id} was Held or on the wire when the Runtime's disposal began (at "${owed.since}"); the next boot re-attached its actor and delivered no ending of it (Restore I6), so its lane did not survive the disposal`,
    );

const invoked = (request: Request) =>
  `Actors I30: the server received a ${request.operation} request${Option.match(request.key, { onNone: () => "", onSome: (k) => ` (${k})` })} after the Runtime's disposal began; nothing is invoked from its start`;

const heldNow = (ledger: Ledger) =>
  [...ledger.heads.values()].filter((head) => !ledger.settled.has(head.attempt));

const stepName = (step: ReadonlyArray<Fact>) => {
  const [first] = step;

  return first !== undefined && Fact.$is("Stepped")(first) ? first.what : "";
};

// RETURN_TYPE: the Ledger record; inference would widen its empty collections.
const fresh = (): Ledger => ({
  owners: new Map(),
  heads: new Map(),
  sends: new Set(),
  settled: new Set(),
  unsure: new Set(),
  uses: [],
});

const judge = (facts: Facts) => {
  const ledger = fresh();
  let owed: Option.Option<Owed> = Option.none();

  return steps(facts.timeline).flatMap((step) => {
    const found = step.flatMap((fact) => {
      learn(ledger, facts.reference, fact);

      if (Fact.$is("DisposingRuntime")(fact) && Option.isNone(owed))
        owed = Option.some({ heads: heldNow(ledger), since: stepName(step) });

      return Fact.$is("Requested")(fact) && Option.isSome(owed) ? [invoked(fact.request)] : [];
    });

    if (!step.some(Fact.$is("Reloaded"))) return found;

    const judged = Option.match(owed, {
      onNone: () => [],
      onSome: (o) => survived(ledger, step, o),
    });

    owed = Option.none();

    return [...found, ...judged];
  });
};

/**
 * Runtime disposal keeps every lane that is not Idle and invokes nothing from its start.
 *
 * **Details**
 *
 * - Nothing invoked: from the step that starts the Runtime's disposal to the next reload, the
 *   suite's server receives no request, write or read.
 * - Every lane kept: a lane whose newest Attempt the server received, with no definite answer
 *   (none yet, or one its commit takes as unknown), no cancel the suite drove since and no
 *   `Released` evidence for it, is Held or on the wire when the disposal starts. At the next boot,
 *   each such lane whose actor the reload re-attaches must deliver an ending of that Attempt:
 *   unknown { Restored }, or the ending the disposal parked in its place (Restore I6). A boot that
 *   delivers none has dropped the lane.
 *
 * **Gotchas**
 *
 * - Anchored to the suite's facts: its server's requests and answers, the fixtures' references
 *   (how a commit classifies an answer, its key fields, the events that cancel it), and the uses
 *   the suite holds. Who committed an Attempt is the runtime's report (its Minted's actor); an
 *   Attempt with no actor is not judged here (`delivered-once` and `lane-queue` judge that).
 * - Only Attempts the server received are judged: a commit that never left (queued behind a head)
 *   is the runtime's own report, and its NotSent { Disposed } is judged by `delivered-once`.
 * - A lane whose actor the suite released or disposed before the reload is not re-attached, so it
 *   is not observed; disposeActor's half of the rule is not judged here.
 * - A handler's own cancel (one not on an event the suite drove, such as Pay's on `IntentRead`
 *   in UNSURE) is known only from the runtime's `Released` evidence, as `lane-queue` takes it. This
 *   is lenient: a runtime that claims a release it did not make, then drops the lane, is not
 *   caught here.
 * - A reload with no disposal before it judges nothing here; what a plain reload restores is the
 *   restore oracle's (planned).
 */
export const disposal: Oracle = {
  name: "disposal",
  guarantee: "Actors I29, I30",
  check: judge,
};
