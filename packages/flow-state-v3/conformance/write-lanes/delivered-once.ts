import { Array as Arr, Option } from "effect";
import { Fact, oracle, violation } from "../dsl/oracle.ts";
import type { OperationReference, Reference } from "../fixtures/reference.ts";
import {
  type ActorRef,
  type Delivered,
  type Ended,
  type Minted,
  Observation,
  type Recorded,
  sameActor,
  type Turn,
} from "../port.ts";
import type { Request } from "../world/network.ts";
import {
  acrossReload,
  type Ending,
  firstIn,
  keptAfterRefusals,
  Life,
  nameOf,
  refusedOnce,
  relived,
  same,
  taken,
  WAITING,
} from "./ending-lives.ts";
import { mintedInto, policyOf, sentIn, type Written } from "./written-attempts.ts";

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
  readonly ending: Option.Option<Ending>;
};

type Walk = {
  readonly ledger: Ledger;
  readonly pending: ReadonlyArray<Pending>;
  readonly secondRefusals: number;
  readonly found: Found;
};

type Step = { readonly reference: Reference; readonly requests: ReadonlyArray<Request> };

const EMPTY: Ledger = { written: [], endings: [], forgotten: [], runtime: LIVE };

const writtenOf = (ledger: Ledger, id: string) =>
  Option.fromUndefinedOr(ledger.written.find((w) => w.id === id));

const changed = (ledger: Ledger, id: string, change: (w: Written) => Written) => ({
  ...ledger,
  written: ledger.written.map((w) => (w.id === id ? change(w) : w)),
});

const minted = (ledger: Ledger, reference: Reference, m: Minted) => ({
  ...ledger,
  written: mintedInto(ledger.written, reference, m),
});

const sent = (ledger: Ledger, step: Step, id: string) => ({
  ...ledger,
  written: sentIn(ledger.written, step.reference, step.requests, id),
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
    life: Life.Owed({ inDisposal: ledger.runtime === "disposing", lastTry: false }),
  };

  return [{ ...decided, endings: [...decided.endings, ending] }, found];
};

const withEndings = (ledger: Ledger, endings: ReadonlyArray<Ending>) => ({ ...ledger, endings });

const takenFrom = (
  ledger: Ledger,
  operation: string,
  attempt: Option.Option<string>,
  tags: ReadonlyArray<Life["_tag"]>,
) =>
  Option.map(
    taken(ledger.endings, operation, attempt, tags),
    ([endings, ending]) => [withEndings(ledger, endings), ending] as const,
  );

const noneOwed = (operation: string, attempt: Option.Option<string>, what: string) =>
  `WriteLanes I15: ${nameOf(operation, attempt)} was ${what} with no ending owed (twice, or never decided)`;

// RETURN_TYPE: a [state, violations] pair; the branches' literal arrays would infer different tuples.
const paid = (
  ledger: Ledger,
  operation: string,
  attempt: Option.Option<string>,
  what: string,
): readonly [Ledger, Found] =>
  Option.match(takenFrom(ledger, operation, attempt, ["Owed"]), {
    onNone: () => [ledger, [noneOwed(operation, attempt, what)]],
    onSome: ([next]) => [next, []],
  });

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

  const letGo =
    r.why === "letGo" ? takenFrom(ledger, r.operation, r.attempt, WAITING) : Option.none();

  if (Option.isSome(letGo)) return [letGo.value[0], cause];

  const [next, found] = paid(ledger, r.operation, r.attempt, "recorded");

  return [next, [...cause, ...found]];
};

// RETURN_TYPE: a [state, violations] pair; the branches' literal arrays would infer different tuples.
const parkedNow = (
  ledger: Ledger,
  operation: string,
  attempt: Option.Option<string>,
): readonly [Ledger, Found] =>
  Option.match(firstIn(ledger.endings, operation, attempt, ["Owed"]), {
    onNone: () =>
      Option.isSome(firstIn(ledger.endings, operation, attempt, WAITING))
        ? [ledger, []]
        : paid(ledger, operation, attempt, "parked"),
    onSome: ([, at]) => [withEndings(ledger, relived(ledger.endings, at, Life.Parked())), []],
  });

// RETURN_TYPE: a [state, violations] pair; the branches' literal arrays would infer different tuples.
const unparked = (
  ledger: Ledger,
  operation: string,
  attempt: Option.Option<string>,
): readonly [Ledger, Found] =>
  Option.match(firstIn(ledger.endings, operation, attempt, WAITING), {
    onNone: () => [
      ledger,
      [`WriteLanes I15: ${nameOf(operation, attempt)} unparked, never parked`],
    ],
    onSome: ([x, at]) => {
      const life = Life.Owed({ inDisposal: false, lastTry: Life.$is("Kept")(x.life) });

      return [withEndings(ledger, relived(ledger.endings, at, life)), []];
    },
  });

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

  const owed = Option.orElse(takenFrom(ledger, d.operation, d.attempt, ["Owed"]), () =>
    Option.map(
      takenFrom(ledger, d.operation, d.attempt, ["Kept"]),
      ([next, x]) =>
        [next, { ...x, life: Life.Owed({ inDisposal: false, lastTry: true }) }] as const,
    ),
  );

  const next = Option.match(owed, { onNone: () => ledger, onSome: ([l]) => l });

  const found = Option.isNone(owed) ? [noneOwed(d.operation, d.attempt, "delivered")] : [];

  const ending = Option.map(owed, ([, x]) => x);

  return {
    ...walk,
    ledger: next,
    pending: [...walk.pending, { owner, event: d.event, name, ending }],
    found: [...walk.found, ...replaced, ...found, ...disposing],
  };
};

const runBy = (owner: Option.Option<ActorRef>, event: string, turn: Turn) =>
  event === turn.event &&
  Option.match(owner, { onNone: () => true, onSome: (o) => sameActor(o, turn.actor) });

const turned = (walk: Walk, turn: Turn) => {
  const delivery = Arr.findFirstIndex(walk.pending, (p) => runBy(p.owner, p.event, turn));

  if (Option.isSome(delivery))
    return { ...walk, pending: walk.pending.toSpliced(delivery.value, 1) };

  const again = Arr.findFirstIndex(
    walk.ledger.endings,
    (x) => Life.$is("Refused")(x.life) && runBy(x.owner, x.life.event, turn),
  );

  return Option.match(again, {
    onNone: () => walk,
    onSome: (at) => ({
      ...walk,
      ledger: { ...walk.ledger, endings: walk.ledger.endings.toSpliced(at, 1) },
    }),
  });
};

const settled = (walk: Walk, runs: (p: Pending) => boolean) =>
  Option.match(Arr.findFirstIndex(walk.pending, runs), {
    onNone: () => walk,
    onSome: (at) => ({ ...walk, pending: walk.pending.toSpliced(at, 1) }),
  });

const refused = (walk: Walk, code: string) => {
  if (code === "UnmappedEnding" && walk.pending.length === 1) return { ...walk, pending: [] };

  if (code !== "InvalidTurn") return walk;

  if (walk.pending.length === 0) return { ...walk, secondRefusals: walk.secondRefusals + 1 };

  const [only, ...rest] = walk.pending;

  if (only === undefined || rest.length > 0) return walk;

  const back = Option.toArray(Option.map(only.ending, (x) => refusedOnce(x, only.event)));

  return {
    ...walk,
    pending: [],
    ledger: { ...walk.ledger, endings: [...walk.ledger.endings, ...back] },
  };
};

const reported = (walk: Walk, step: Step, observed: Observation) => {
  const apply = ([ledger, found]: readonly [Ledger, Found]) => ({
    ...walk,
    ledger,
    found: [...walk.found, ...found],
  });

  return Observation.$match(observed, {
    Turn: (turn) => turned(walk, turn),
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
    Incarnated: () => walk,
    Finished: () => walk,
    RuntimeDisposed: () => walk,
  });
};

const reloaded = (ledger: Ledger) => ({
  ...ledger,
  runtime: LIVE,
  endings: acrossReload(ledger.endings),
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
      withLedger(walk, (l) =>
        Option.match(
          Arr.findFirstIndex(l.forgotten, (f) => sameActor(f, actor)),
          {
            onNone: () => l,
            onSome: (at) => ({ ...l, forgotten: l.forgotten.toSpliced(at, 1) }),
          },
        ),
      ),
    Released: () => walk,
    DisposingRuntime: () => withLedger(walk, (l) => ({ ...l, runtime: DISPOSING })),
    Drove: () => walk,
    Unstoppable: () => walk,
    Advanced: () => walk,
    Read: () => walk,
  });

const judgeStep = (ledger: Ledger, step: Step, facts: ReadonlyArray<Fact>) => {
  const start: Walk = { ledger, pending: [], secondRefusals: 0, found: [] };
  const walk = facts.reduce((w, fact) => learned(w, step, fact), start);
  const kept = keptAfterRefusals(walk.ledger.endings, walk.secondRefusals);
  const walked = { ...walk, ledger: { ...walk.ledger, endings: kept.endings } };

  const unredelivered = kept.unredelivered.map(
    (x) =>
      `WriteLanes I15: ${nameOf(x.operation, x.attempt)} was refused at admission and not delivered once more after queued mail`,
  );

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

  return [walked.ledger, [...walked.found, ...unrun, ...undelivered, ...unredelivered]] as const;
};

type State = { readonly ledger: Ledger; readonly reference: Reference };

/**
 * Every ending is delivered once to its own actor, parked for it, or recorded as evidence by
 * declaration: never both, never twice; and a settled ending is never followed by another.
 *
 * **Details**
 *
 * Each ending the runtime reports has one life: `Owed` (decided, not yet disposed of; `inDisposal`
 * when decided during the Runtime's disposal; `lastTry` when a refusal would keep it), `Parked`,
 * `Refused` (its first admission refused; owed one more try in the same step) or `Kept` (refused
 * twice; it waits on its lane for one try per boot or adoption, Actors R15). A delivery or a
 * record pays the oldest owed ending of its Attempt (a decline, which has no Attempt, by its
 * operation, first in first out), and a delivery with none owed takes a kept one as its last try;
 * a park moves it to `Parked`; an unpark makes a parked or kept one owed again; a let-go record
 * drops a parked or kept one. Checks (R10):
 *
 * - by the end of the step that decided it, no ending is owed, except one decided during the
 *   Runtime's disposal, which is parked at the next reload whether or not a `Parked` was reported;
 * - a delivery, park or record pays an owed ending; an unpark finds a parked or kept one;
 * - a delivery is run, in its step, by a turn of the actor that committed it, or is unhandled or
 *   denied by its handlers, or refused;
 * - an ending whose first admission an `InvalidTurn` refused is delivered once more after queued
 *   mail in the same step (a later turn of its event by its actor), or refused a second time, and
 *   is then kept (I15's refusal exception). The second try is not reported as a `Delivered`;
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
 *   decides, which the restore oracle owns. Parked and kept endings stay across it.
 * - `Unhandled` and `Denied` carry no actor, so they settle a delivery by its event only. An
 *   `Issue` carries only its code, so an InvalidTurn or UnmappedEnding refuses a delivery only
 *   when it is the one delivery pending in its step, and an InvalidTurn with no delivery pending
 *   counts as a second refusal of some refused ending of that step. An InvalidTurn of an external
 *   event in the same step would excuse a missing redelivery.
 * - UnmappedEnding is final: the runtime has no mapping to try again.
 * - That a kept ending gets its try at the next boot or adoption is not checked (a kept ending
 *   that is lost passes).
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
