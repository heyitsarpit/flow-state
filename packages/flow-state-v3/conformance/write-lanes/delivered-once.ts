import { Data, Option } from "effect";
import { type LaneId, laneOf, sameLane } from "../dsl/domain.ts";
import { Fact, oracle, violation } from "../dsl/oracle.ts";
import { operationNamed, type OperationReference, type Reference } from "../fixtures/reference.ts";
import {
  type ActorRef,
  type Channel,
  type Delivered,
  type Ended,
  type Minted,
  Observation,
  type Recorded,
  sameActor,
} from "../port.ts";
import type { Request } from "../world/network.ts";

type Life = Data.TaggedEnum<{ Owed: { inDisposal: boolean }; Parked: {} }>;

const Life = Data.taggedEnum<Life>();

type Ending = {
  readonly operation: string;
  readonly attempt: Option.Option<string>;
  readonly owner: Option.Option<ActorRef>;
  readonly life: Life;
};

type Replacement = "none" | "maybe" | "sure";

type Written = {
  readonly id: string;
  readonly owner: Option.Option<ActorRef>;
  readonly operation: string;
  readonly policy: Option.Option<OperationReference>;
  readonly lane: Option.Option<LaneId>;
  readonly sent: boolean;
  readonly decided: Option.Option<Channel>;
  readonly replaced: Replacement;
};

type Runtime = "live" | "disposing";

const LIVE: Runtime = "live";

const DISPOSING: Runtime = "disposing";

type Ledger = {
  readonly written: ReadonlyArray<Written>;
  readonly endings: ReadonlyArray<Ending>;
  readonly forgotten: ReadonlyArray<ActorRef>;
  readonly runtime: Runtime;
};

type Found = ReadonlyArray<string>;

type Pending = {
  readonly owner: Option.Option<ActorRef>;
  readonly event: string;
  readonly name: string;
};

type Walk = {
  readonly ledger: Ledger;
  readonly pending: ReadonlyArray<Pending>;
  readonly found: Found;
};

type Step = { readonly reference: Reference; readonly requests: ReadonlyArray<Request> };

const EMPTY: Ledger = { written: [], endings: [], forgotten: [], runtime: LIVE };

const nameOf = (operation: string, attempt: Option.Option<string>) =>
  Option.match(attempt, {
    onNone: () => `a decline of ${operation}`,
    onSome: (id) => `${operation} ${id}`,
  });

const writtenOf = (ledger: Ledger, id: string) =>
  Option.fromUndefinedOr(ledger.written.find((w) => w.id === id));

const changed = (ledger: Ledger, id: string, change: (w: Written) => Written) => ({
  ...ledger,
  written: ledger.written.map((w) => (w.id === id ? change(w) : w)),
});

const policyOf = (reference: Reference, owner: Option.Option<ActorRef>, operation: string) =>
  Option.match(owner, {
    onNone: () => operationNamed(reference, operation),
    onSome: (o) => Option.fromUndefinedOr(reference[o.machine]?.[operation]),
  });

const replacement = (earlier: Written, lane: Option.Option<LaneId>) => {
  const replaces = Option.match(earlier.policy, {
    onNone: () => false,
    onSome: (p) => p.concurrency === "cancel" || (p.concurrency === "latest" && !earlier.sent),
  });

  if (!replaces || Option.isSome(earlier.decided)) return earlier.replaced;

  return Option.match(Option.all([earlier.lane, lane]), {
    onNone: () => (earlier.replaced === "sure" ? "sure" : "maybe"),
    onSome: ([a, b]) => (sameLane(a, b) ? "sure" : earlier.replaced),
  });
};

const minted = (ledger: Ledger, reference: Reference, m: Minted) => {
  const policy = policyOf(reference, m.actor, m.operation);

  const lane = Option.flatMap(Option.all([m.actor, policy]), ([owner, p]) =>
    p.keyFields.length === 0
      ? Option.some(laneOf(owner, reference, m.operation, {}))
      : Option.map(m.key, (k) => laneOf(owner, reference, m.operation, k)),
  );

  const written = ledger.written.map((w) =>
    w.operation === m.operation &&
    Option.exists(Option.all([w.owner, m.actor]), ([a, b]) => sameActor(a, b))
      ? { ...w, replaced: replacement(w, lane) }
      : w,
  );

  const fresh: Written = {
    id: m.attempt,
    owner: m.actor,
    operation: m.operation,
    policy,
    lane,
    sent: false,
    decided: Option.none(),
    replaced: "none",
  };

  return { ...ledger, written: [...written, fresh] };
};

const sent = (ledger: Ledger, step: Step, id: string) =>
  changed(ledger, id, (w) => {
    const request = step.requests.find(
      (r) => r.operation === w.operation && Option.contains(r.key, id),
    );

    const lane = Option.orElse(w.lane, () =>
      Option.flatMap(Option.all([w.owner, Option.fromUndefinedOr(request)]), ([owner, r]) =>
        Option.some(laneOf(owner, step.reference, w.operation, r.input)),
      ),
    );

    return { ...w, sent: true, lane };
  });

// RETURN_TYPE: a [state, violations] pair; the branches' literal arrays would infer different tuples.
const ended = (ledger: Ledger, e: Ended): readonly [Ledger, Found] => {
  const write = Option.flatMap(e.attempt, (id) => writtenOf(ledger, id));
  const owner = Option.match(write, { onNone: () => e.actor, onSome: (w) => w.owner });
  const name = nameOf(e.operation, e.attempt);

  const settledBefore = Option.exists(write, (w) =>
    Option.exists(w.decided, (c) => c !== "unknown"),
  );

  const unowned = Option.exists(write, (w) => Option.isNone(w.owner));

  const found: Array<string> = [];

  if (settledBefore)
    found.push(
      `WriteLanes I16: ${name} ended ${e.channel} ${e.reason} after it had already ended definitely; a settled ending is never replaced`,
    );

  if (unowned)
    found.push(
      `WriteLanes I15: ${name} ended, and its Minted with no actor leaves its committer unknown`,
    );

  const decided = Option.match(write, {
    onNone: () => ledger,
    onSome: (w) => changed(ledger, w.id, (x) => ({ ...x, decided: Option.some(e.channel) })),
  });

  const ending: Ending = {
    operation: e.operation,
    attempt: e.attempt,
    owner,
    life: Life.Owed({ inDisposal: ledger.runtime === "disposing" }),
  };

  return [{ ...decided, endings: [...decided.endings, ending] }, found];
};

const same = (ending: Ending, operation: string, attempt: Option.Option<string>) =>
  ending.operation === operation &&
  Option.match(attempt, {
    onNone: () => Option.isNone(ending.attempt),
    onSome: (id) => Option.contains(ending.attempt, id),
  });

const firstIn = (
  ledger: Ledger,
  operation: string,
  attempt: Option.Option<string>,
  tag: Life["_tag"],
) => ledger.endings.findIndex((x) => same(x, operation, attempt) && x.life._tag === tag);

// RETURN_TYPE: a [state, violations] pair; the branches' literal arrays would infer different tuples.
const paid = (
  ledger: Ledger,
  operation: string,
  attempt: Option.Option<string>,
  what: string,
): readonly [Ledger, Found] => {
  const at = firstIn(ledger, operation, attempt, "Owed");

  if (at < 0)
    return [
      ledger,
      [
        `WriteLanes I15: ${nameOf(operation, attempt)} was ${what} with no ending owed (twice, or never decided)`,
      ],
    ];

  return [{ ...ledger, endings: ledger.endings.toSpliced(at, 1) }, []];
};

const forgottenOwner = (ledger: Ledger, owner: Option.Option<ActorRef>) =>
  Option.exists(owner, (o) => ledger.forgotten.some((f) => sameActor(f, o)));

const unexcused = (policy: OperationReference, attempted: boolean) => {
  if (!attempted) return "a decline has no Attempt for a later commit to replace or interrupt";

  if (policy.concurrency === "cancel")
    return "no later commit of the same lane interrupted it while undecided (cancel)";

  if (policy.concurrency === "latest")
    return "no later commit of the same lane replaced it while queued (latest)";

  return `its operation is ${policy.concurrency}, which replaces and interrupts nothing`;
};

const withCause = (ledger: Ledger, reference: Reference, r: Recorded) => {
  const write = Option.flatMap(r.attempt, (id) => writtenOf(ledger, id));

  const owner = Option.match(write, {
    onNone: () =>
      Option.flatMap(
        Option.fromUndefinedOr(ledger.endings.find((x) => same(x, r.operation, r.attempt))),
        (x) => x.owner,
      ),
    onSome: (w) => w.owner,
  });

  const policy = Option.match(write, {
    onNone: () => policyOf(reference, owner, r.operation),
    onSome: (w) => w.policy,
  });

  if (Option.isNone(policy) || Option.exists(write, (w) => Option.isNone(w.owner))) return [];

  const excused = Option.exists(write, (w) => w.replaced !== "none");

  if (r.why !== "ignored" && (excused || forgottenOwner(ledger, owner))) return [];

  const why =
    r.why === "ignored"
      ? "the suite does not read Flow.ignore mappings"
      : unexcused(policy.value, Option.isSome(r.attempt));

  return [
    `WriteLanes I15: ${nameOf(r.operation, r.attempt)} was recorded (${r.why}) and not delivered, with no cause the suite saw: ${why}`,
  ];
};

// RETURN_TYPE: a [state, violations] pair; the branches' literal arrays would infer different tuples.
const recorded = (ledger: Ledger, reference: Reference, r: Recorded): readonly [Ledger, Found] => {
  const cause = withCause(ledger, reference, r);
  const parked = firstIn(ledger, r.operation, r.attempt, "Parked");

  if (r.why === "letGo" && parked >= 0)
    return [{ ...ledger, endings: ledger.endings.toSpliced(parked, 1) }, cause];

  const [next, found] = paid(ledger, r.operation, r.attempt, "recorded");

  return [next, [...cause, ...found]];
};

// RETURN_TYPE: a [state, violations] pair; the branches' literal arrays would infer different tuples.
const parkedNow = (
  ledger: Ledger,
  operation: string,
  attempt: Option.Option<string>,
): readonly [Ledger, Found] => {
  const owed = firstIn(ledger, operation, attempt, "Owed");

  if (owed < 0 && firstIn(ledger, operation, attempt, "Parked") >= 0) return [ledger, []];

  if (owed < 0) return paid(ledger, operation, attempt, "parked");

  return [
    {
      ...ledger,
      endings: ledger.endings.map((x, at) => (at === owed ? { ...x, life: Life.Parked() } : x)),
    },
    [],
  ];
};

// RETURN_TYPE: a [state, violations] pair; the branches' literal arrays would infer different tuples.
const unparked = (
  ledger: Ledger,
  operation: string,
  attempt: Option.Option<string>,
): readonly [Ledger, Found] => {
  const at = firstIn(ledger, operation, attempt, "Parked");

  if (at < 0)
    return [ledger, [`WriteLanes I15: ${nameOf(operation, attempt)} unparked, never parked`]];

  return [
    {
      ...ledger,
      endings: ledger.endings.map((x, i) =>
        i === at ? { ...x, life: Life.Owed({ inDisposal: false }) } : x,
      ),
    },
    [],
  ];
};

const delivered = (walk: Walk, d: Delivered) => {
  const { ledger } = walk;
  const name = nameOf(d.operation, d.attempt);
  const write = Option.flatMap(d.attempt, (id) => writtenOf(ledger, id));

  const owner = Option.match(write, {
    onNone: () =>
      Option.flatMap(
        Option.fromUndefinedOr(
          ledger.endings.find((x) => same(x, d.operation, d.attempt) && Life.$is("Owed")(x.life)),
        ),
        (x) => x.owner,
      ),
    onSome: (w) => w.owner,
  });

  const replaced = Option.exists(write, (w) => w.replaced === "sure")
    ? [
        `WriteLanes I15: ${name} was delivered, though a later commit of its lane replaced it; a replaced Attempt's ending is evidence only`,
      ]
    : [];

  const disposing =
    ledger.runtime === "disposing"
      ? [
          `WriteLanes I15: ${name} was delivered after the suite started the Runtime's disposal, which delivers nothing and parks every ending`,
        ]
      : [];

  const [next, found] = paid(ledger, d.operation, d.attempt, "delivered");

  return {
    ledger: next,
    pending: [...walk.pending, { owner, event: d.event, name }],
    found: [...walk.found, ...replaced, ...found, ...disposing],
  };
};

const settled = (walk: Walk, runs: (p: Pending) => boolean) => {
  const at = walk.pending.findIndex(runs);

  return at < 0 ? walk : { ...walk, pending: walk.pending.toSpliced(at, 1) };
};

const refused = (walk: Walk, code: string) => {
  const refusal = code === "InvalidTurn" || code === "UnmappedEnding";

  return refusal && walk.pending.length === 1 ? { ...walk, pending: [] } : walk;
};

const reported = (walk: Walk, step: Step, observed: Observation) => {
  const apply = ([ledger, found]: readonly [Ledger, Found]) => ({
    ...walk,
    ledger,
    found: [...walk.found, ...found],
  });

  return Observation.$match(observed, {
    Turn: ({ event, actor }) =>
      settled(
        walk,
        (p) =>
          p.event === event &&
          Option.match(p.owner, { onNone: () => true, onSome: (o) => sameActor(o, actor) }),
      ),
    Minted: (m) => ({ ...walk, ledger: minted(walk.ledger, step.reference, m) }),
    Sent: ({ attempt }) => ({ ...walk, ledger: sent(walk.ledger, step, attempt) }),
    Ended: (e) => apply(ended(walk.ledger, e)),
    Delivered: (d) => delivered(walk, d),
    Parked: ({ operation, attempt }) => apply(parkedNow(walk.ledger, operation, attempt)),
    Unparked: ({ operation, attempt }) => apply(unparked(walk.ledger, operation, attempt)),
    Recorded: (r) => apply(recorded(walk.ledger, step.reference, r)),
    Unhandled: ({ event }) => settled(walk, (p) => p.event === event),
    Denied: ({ event }) => settled(walk, (p) => p.event === event),
    Evidence: () => walk,
    Issue: ({ code }) => refused(walk, code),
    RuntimeDisposed: () => walk,
  });
};

const reloaded = (ledger: Ledger) => ({
  ...ledger,
  runtime: LIVE,
  endings: ledger.endings.flatMap((x) =>
    Life.$match(x.life, {
      Owed: ({ inDisposal }) => (inDisposal ? [{ ...x, life: Life.Parked() }] : []),
      Parked: () => [x],
    }),
  ),
});

const withLedger = (walk: Walk, change: (ledger: Ledger) => Ledger) => ({
  ...walk,
  ledger: change(walk.ledger),
});

const learned = (walk: Walk, step: Step, fact: Fact) =>
  Fact.$match(fact, {
    Stepped: () => walk,
    Requested: () => walk,
    Answered: () => walk,
    Reported: ({ observation }) => reported(walk, step, observation),
    Reloaded: () => withLedger(walk, reloaded),
    Disposed: () => walk,
    Forgot: ({ actor }) => withLedger(walk, (l) => ({ ...l, forgotten: [...l.forgotten, actor] })),
    Ensured: ({ actor }) =>
      withLedger(walk, (l) => {
        const at = l.forgotten.findIndex((f) => sameActor(f, actor));

        return at < 0 ? l : { ...l, forgotten: l.forgotten.toSpliced(at, 1) };
      }),
    Released: () => walk,
    DisposingRuntime: () => withLedger(walk, (l) => ({ ...l, runtime: DISPOSING })),
    Drove: () => walk,
    Unstoppable: () => walk,
    Advanced: () => walk,
    Read: () => walk,
  });

const judgeStep = (ledger: Ledger, step: Step, facts: ReadonlyArray<Fact>) => {
  const start: Walk = { ledger, pending: [], found: [] };
  const walked = facts.reduce((walk, fact) => learned(walk, step, fact), start);

  const unrun = walked.pending.map(
    (p) =>
      `WriteLanes I15: ${p.name} was delivered as ${p.event}${Option.match(p.owner, { onNone: () => "", onSome: (o) => ` to ${o.machine}/${o.id}` })} and no turn of its actor ran it`,
  );

  const undelivered = walked.ledger.endings.flatMap((x) =>
    Life.$is("Owed")(x.life) && !x.life.inDisposal
      ? [
          `WriteLanes I15: ${nameOf(x.operation, x.attempt)} ended and was never delivered, parked or recorded`,
        ]
      : [],
  );

  return [walked.ledger, [...walked.found, ...unrun, ...undelivered]] as const;
};

type State = { readonly ledger: Ledger; readonly reference: Reference };

/**
 * Every ending is delivered once to its own actor, parked for it, or recorded as evidence by
 * declaration: never both, never twice; and a settled ending is never followed by another.
 *
 * **Details**
 *
 * Each ending the runtime reports has one life: `Owed` (decided, not yet disposed of; `inDisposal`
 * when decided during the Runtime's disposal) or `Parked`. A delivery or a record pays the oldest
 * owed ending of its Attempt (a decline, which has no Attempt, by its operation, first in first
 * out); a park moves it to `Parked`; an unpark makes it owed again; a let-go record drops a parked
 * one. Checks (R10):
 *
 * - by the end of the step that decided it, no ending is owed, except one decided during the
 *   Runtime's disposal, which is parked at the next reload whether or not a `Parked` was reported;
 * - a delivery, park or record pays an owed ending; an unpark finds a parked one;
 * - a delivery is run, in its step, by a turn of the actor that committed it, or is unhandled or
 *   denied by its handlers, or refused (which the runtime retries);
 * - nothing is delivered between the start of the Runtime's disposal and the next reload;
 * - an ending is recorded and not delivered only for a cause the suite can derive: under
 *   `cancel`, a later commit of the same lane was minted while the Attempt was undecided; under
 *   `latest`, a later commit of the same lane was minted while it was never sent; or the suite
 *   forgot its actor. A disposed actor's ending is parked, not recorded;
 * - an Attempt a later commit of its lane surely replaced is never delivered (evidence by
 *   declaration);
 * - an Attempt that ended success or failure reports no later ending (I16).
 *
 * **Gotchas**
 *
 * - Anchored to the suite's own steps (forget, and an ensure that ends its excuse), the server's
 *   log (a keyed lane's key) and the fixtures' references. Who committed an Attempt is the
 *   runtime's report (its `Minted`'s actor); a `Minted` with no actor leaves its committer unknown,
 *   so its ending is a violation.
 * - A lane is (actor, operation, key). The key is `Minted`'s, else the key fields of the input of
 *   the Attempt's first request in the server's log. Where either Attempt's key is not known yet,
 *   a later commit of the same actor and operation excuses a record ("maybe" replaced) but never
 *   makes a delivery a violation.
 * - A reload forgets what is owed: what survives on disk is owed again as the endings the new boot
 *   decides, which the restore oracle owns. Parked endings stay parked across it.
 * - `Unhandled` and `Denied` carry no actor, so they settle a delivery by its event only. An
 *   `Issue` carries only its code, so an InvalidTurn or UnmappedEnding settles a delivery only
 *   when it is the one delivery pending in its step.
 * - Endings recorded for causes the suite cannot see yet (a releasing lane, an ended fragment's
 *   lookup) need the fragment fixtures; until then they read as violations.
 * - A parked ending still parked at the end of a case is not yet checked.
 */
export const deliveredOnce = oracle<State>({
  name: "delivered-once",
  guarantee: ["WriteLanes I15", "WriteLanes I16"],
  start: (reference) => ({ ledger: EMPTY, reference }),
  step: (state, facts, requests) => {
    const [ledger, found] = judgeStep(
      state.ledger,
      { reference: state.reference, requests },
      facts,
    );

    return [{ ...state, ledger }, found.map(violation)] as const;
  },
});
