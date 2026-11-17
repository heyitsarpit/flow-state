import { type Brand, Data, Equal, Option } from "effect";
import type { Evidence } from "./evidence.ts";
import type { Ledger, OwedId } from "./ledger.ts";
import { Life } from "./life.ts";
import type { IssueCode, ScheduleDeadline } from "./vocabulary.ts";
import type { Values } from "./compiled.ts";
import type { Baseline, Frame, Selected } from "./slots.ts";

/**
 * An actor's identity: its machine and its name.
 */
export type ActorId = { readonly machine: string; readonly name: string };

// Each identity's key, minted once: an identity is immutable, so its key never changes.
const keys = new WeakMap<ActorId, string>();

/**
 * The text an identity is stored under: machine, then the name with `%`, `/` and `|` escaped.
 */
export const actorKey = (actor: ActorId) => {
  const known = keys.get(actor);

  if (known !== undefined) return known;

  const key = `${actor.machine}/${actor.name.replaceAll("%", "%25").replaceAll("/", "%2F").replaceAll("|", "%7C")}`;
  keys.set(actor, key);

  return key;
};

/**
 * Whether two identities are the same: the same machine and name.
 */
export const sameActor = (a: ActorId, b: ActorId) => a.machine === b.machine && a.name === b.name;

/**
 * The id a write lane is kept under: its identity, operation and key text.
 */
export const laneId = (actor: ActorId, operation: string, keyText: string) =>
  `${actorKey(actor)}|${operation}|${keyText}`;

/**
 * A storage ticket's id: the batch an acknowledgement or capture waits on.
 */
export type TicketId = string & Brand.Brand<"flow-state/TicketId">;

/**
 * A host timer's id.
 */
export type TimerId = string & Brand.Brand<"flow-state/TimerId">;

/**
 * A call's id: one invocation of a commit or lookup.
 */
export type CallId = string & Brand.Brand<"flow-state/CallId">;

/**
 * A ticket a batch carries: the Attempt it acknowledges or captures, or the disposal's write.
 */
export type Ticket =
  | {
      readonly id: TicketId;
      readonly attempt: string;
      readonly purpose: "acknowledge" | "capture";
    }
  | { readonly id: TicketId; readonly purpose: "flush" };

/**
 * One record write of a batch: its new canonical text, or `None` to remove it.
 */
export type Write = { readonly key: string; readonly record: Option.Option<string> };

/**
 * A schedule's live arming: its arming number (a firing of an older arming is discarded) and its
 * deadline.
 */
export type Armed = {
  readonly arming: number;
  readonly dueAt: number;
  readonly send: string;
  readonly timer: TimerId;
};

/**
 * One live incarnation of an identity.
 *
 * **Details**
 *
 * `state` is the active leaf's path. `activations` numbers each entry of the states on its chain,
 * outermost first: a re-entry is a new activation, so work its old activation owns ends late.
 * `history` holds each exited compound's last active child. `bound` names the provider of each
 * context slot, `context` holds each slot's selection and `baselines` each `onContext` reaction's
 * last selection with the inputs it read. `grace` is the timer of a free incarnation's grace.
 */
export type Incarnation = {
  readonly id: string;
  readonly actor: ActorId;
  readonly state: string;
  readonly activations: ReadonlyArray<number>;
  readonly history: ReadonlyMap<string, string>;
  readonly memory: Values;
  readonly schedules: ReadonlyMap<string, Armed>;
  readonly issues: ReadonlyArray<Issue>;
  readonly bound: ReadonlyMap<string, ActorId>;
  readonly context: ReadonlyMap<string, Selected>;
  // The slots whose reactions have not been told their current selection yet, with the one each
  // last saw: none for a slot never selected then.
  readonly stale: ReadonlyMap<string, Option.Option<Selected>>;
  // None for a reaction whose select has never given a selection.
  readonly baselines: ReadonlyArray<Option.Option<Baseline>>;
  readonly grace: Option.Option<TimerId>;
};

/**
 * Each bound slot's last-seen selection: the one its reactions still owe a wave for, else its
 * current one; none for a slot never selected.
 */
export const lastSeenOf = (incarnation: Incarnation) =>
  new Map(
    [...incarnation.bound.keys()].map((slot) => [
      slot,
      incarnation.stale.get(slot) ?? Option.fromUndefinedOr(incarnation.context.get(slot)),
    ]),
  );

/**
 * What raised an issue: an event's turn, a schedule's, an operation's ending, a context slot's
 * selector, an `onContext` reaction, or the incarnation's creation. An issue is replaced or cleared
 * only by its own source.
 */
export type IssueSource = Data.TaggedEnum<{
  Event: { tag: string };
  Schedule: { name: string };
  Operation: { name: string };
  Context: { slot: string };
  OnContext: { at: number };
  Creation: {};
}>;

/**
 * Constructors and matchers for {@link IssueSource}.
 */
export const IssueSource = Data.taggedEnum<IssueSource>();

/**
 * An issue source as a snapshot names it: `event X`, `schedule X`, `operation X`, `context X`,
 * `onContext N` or `creation`.
 */
export const sourceText = (source: IssueSource) =>
  IssueSource.$match(source, {
    Event: ({ tag }) => `event ${tag}`,
    Schedule: ({ name }) => `schedule ${name}`,
    Operation: ({ name }) => `operation ${name}`,
    Context: ({ slot }) => `context ${slot}`,
    OnContext: ({ at }) => `onContext ${at}`,
    Creation: () => "creation",
  });

/**
 * An incarnation's open issue: the source that raised it, its code and the callback slot that
 * failed, if one did. Only a later accepted turn of the same source clears it.
 */
export type Issue = {
  readonly source: IssueSource;
  readonly code: IssueCode;
  readonly slot: Option.Option<string>;
};

/**
 * An incarnation with one more open issue, in place of any its source raised before.
 */
export const withIssue = (incarnation: Incarnation, issue: Issue) => ({
  ...incarnation,
  issues: [...incarnation.issues.filter((i) => !Equal.equals(i.source, issue.source)), issue],
});

/**
 * An incarnation with its source's issue cleared; the same incarnation when it had none.
 */
export const withoutIssue = (incarnation: Incarnation, source: IssueSource) =>
  incarnation.issues.some((i) => Equal.equals(i.source, source))
    ? { ...incarnation, issues: incarnation.issues.filter((i) => !Equal.equals(i.source, source)) }
    : incarnation;

/**
 * What an identity showed when its last incarnation ended: its terminal snapshot's state and
 * memory, kept until the identity starts again.
 */
export type Ended = { readonly state: string; readonly memory: Values };

/**
 * Where a lane's head stands: one tag per history and wait, never a flag (WriteLanes model).
 *
 * **Details**
 *
 * - `Acknowledging`: never sent; its acknowledgement batch is out.
 * - `Unsent`: never sent; waits for its turn to end.
 * - `Withdrawing`: never sent; a cancel came while it was acknowledging, and waits for storage.
 * - `Recapturing`: sent before; its re-send waits for its lane record's capture.
 * - `Resending`: sent before; a retry owes its re-send, which waits for its turn to end.
 * - `OnWire`: invoked, with no ending yet; `call` names the live call.
 * - `Cancelling`: on the wire, and interrupted by a cancel.
 * - `Held`: its last ending was a retained unknown, and it is not on the wire.
 */
export type Phase = Data.TaggedEnum<{
  Acknowledging: { ticket: TicketId };
  Unsent: {};
  Withdrawing: { ticket: TicketId };
  Recapturing: { ticket: TicketId };
  Resending: {};
  OnWire: { call: CallId };
  Cancelling: { call: CallId };
  Held: {};
}>;

/**
 * Constructors and matchers for {@link Phase}.
 */
export const Phase = Data.taggedEnum<Phase>();

/**
 * The lane's addressable Attempt, with the activation that owns it.
 */
export type Head = {
  readonly id: string;
  readonly input: Values;
  readonly retryCount: number;
  readonly owner: number;
  readonly phase: Phase;
};

/**
 * Orders keys and lane ids as a store orders its keys: by UTF-16 code units, whatever the host's
 * locale.
 */
export const byCodeUnits = (a: string, b: string) => Number(a > b) - Number(a < b);

/**
 * Whether a head's Attempt was sent before: it was re-sent, or it is Held, Recapturing or
 * Resending. Derived, never stored.
 */
export const sentBefore = (head: Head) =>
  head.retryCount > 0 ||
  Phase.$is("Held")(head.phase) ||
  Phase.$is("Recapturing")(head.phase) ||
  Phase.$is("Resending")(head.phase);

/**
 * A commit waiting behind a lane's head: its input and owning activation. It has no Attempt until
 * it is promoted.
 */
export type Queued = { readonly input: Values; readonly owner: number };

/**
 * A write lane while it is not Idle: an identity's operation at one key, with the commits queued
 * behind its head, oldest first. Its id and key are derived from the identity, the operation and
 * the head's input.
 */
export type Lane = {
  readonly actor: ActorId;
  readonly operation: string;
  readonly head: Head;
  readonly queue: ReadonlyArray<Queued>;
};

/**
 * An earlier head a cancel-policy commit replaced while it waited for storage or was on the wire.
 *
 * **Details**
 *
 * It is kept by the call or ticket it waits on, apart from any lane, since its lane may end first.
 * `owed` says a cancel was pending on it, so its ending is delivered; otherwise it is evidence.
 */
export type Displaced = {
  readonly actor: ActorId;
  readonly operation: string;
  readonly lane: string;
  readonly head: Head;
  readonly owed: boolean;
};

/**
 * A lookup in flight: the activation that owns it and the incarnation it reports to.
 */
export type Read = {
  readonly call: CallId;
  readonly actor: ActorId;
  readonly incarnation: string;
  readonly operation: string;
  readonly owner: number;
};

/**
 * One item of an actor's mailbox; an ending is a reference to its owed row, never the ending. A
 * context update asks the actor to read its providers again: at most one waits per actor.
 */
export type Mail = Data.TaggedEnum<{
  Event: { actor: ActorId; tag: string; payload: Values };
  Context: { actor: ActorId };
  Ending: { actor: ActorId; id: OwedId };
  Firing: {
    actor: ActorId;
    incarnation: string;
    schedule: string;
    arming: number;
  };
}>;

/**
 * Constructors and matchers for {@link Mail}.
 */
export const Mail = Data.taggedEnum<Mail>();

/**
 * What a host timer stands for.
 */
export type Timer = Data.TaggedEnum<{
  Schedule: {
    actor: ActorId;
    incarnation: string;
    schedule: string;
    arming: number;
  };
  Grace: { actor: ActorId; incarnation: string };
  Silent: { ticket: TicketId };
  Bound: {};
}>;

/**
 * Constructors and matchers for {@link Timer}.
 */
export const Timer = Data.taggedEnum<Timer>();

/**
 * The providers each identity of one ensure's context graph binds its slots to, by identity key:
 * the ensured actor's and every provider's on the way up.
 */
export type Wiring = ReadonlyMap<string, ReadonlyMap<string, ActorId>>;

/**
 * Who holds a use of an identity.
 */
export type Use = "story" | "host" | "component" | "context";

/**
 * An identity's saved record, as the Runtime's copy holds it.
 */
export type ActorRecord = {
  readonly actor: ActorId;
  readonly state: string;
  readonly memory: Values;
  readonly schedules: ReadonlyArray<typeof ScheduleDeadline.Type>;
  readonly context: ReadonlyMap<string, ActorId>;
  // Each slot's last-seen selection; a slot never selected has none.
  readonly seen: ReadonlyMap<string, Selected>;
  // Each reaction's baseline inputs that differ from `seen` and `memory`; none with no baseline.
  readonly frames: ReadonlyArray<Option.Option<Frame>>;
  // The bindings of every provider up its context graph, which a provider started again for it keeps.
  readonly graph: Wiring;
};

/**
 * An identity whose actor record could not encode at a step's end: none of its records went, and
 * its touched lanes wait until a step can write the whole identity. The tickets its step minted
 * were refused, never withheld.
 */
type Withheld = {
  readonly actor: ActorId;
  readonly lanes: ReadonlyArray<string>;
};

/**
 * Everything the Runtime decides from: plain data, replaced whole by each step.
 *
 * **Details**
 *
 * `quarantined` holds each record the boot could not read, by its key, with why: its bytes stay
 * until the identity saves over it or, for a lane, a cancel on its key clears it.
 *
 * The last four maps are indexes, each derived from the facts above by the step operation that
 * changes them ({@link indexesOf} rebuilds them): each identity's lanes, the lane whose head waits
 * on each call or ticket, each provider's live consumers, and each ticket's silence timer.
 */
export type World = {
  readonly incarnations: ReadonlyMap<string, Incarnation>;
  readonly records: ReadonlyMap<string, ActorRecord>;
  readonly lanes: ReadonlyMap<string, Lane>;
  readonly owed: Ledger;
  readonly reads: ReadonlyMap<CallId, Read>;
  readonly displaced: ReadonlyMap<string, Displaced>;
  readonly mail: ReadonlyMap<string, ReadonlyArray<Mail>>;
  readonly uses: ReadonlyMap<string, ReadonlyArray<Use>>;
  readonly timers: ReadonlyMap<TimerId, Timer>;
  readonly counter: number;
  readonly attempts: number;
  readonly persistence: boolean;
  readonly withheld: ReadonlyMap<string, Withheld>;
  readonly quarantined: ReadonlyMap<string, string>;
  readonly ended: ReadonlyMap<string, Ended>;
  readonly life: Life;
  readonly lanesOfActor: ReadonlyMap<string, ReadonlySet<string>>;
  readonly laneOfWait: ReadonlyMap<string, string>;
  readonly consumersOf: ReadonlyMap<string, ReadonlySet<string>>;
  readonly silenceOf: ReadonlyMap<string, TimerId>;
};

/**
 * A world with nothing in it.
 */
// RETURN_TYPE: the empty value of the World contract.
export const emptyWorld = (persistence: boolean): World => ({
  incarnations: new Map(),
  records: new Map(),
  lanes: new Map(),
  owed: new Map(),
  reads: new Map(),
  displaced: new Map(),
  mail: new Map(),
  uses: new Map(),
  timers: new Map(),
  counter: 0,
  attempts: 0,
  persistence,
  withheld: new Map(),
  quarantined: new Map(),
  ended: new Map(),
  life: Life.Inert(),
  lanesOfActor: new Map(),
  laneOfWait: new Map(),
  consumersOf: new Map(),
  silenceOf: new Map(),
});

/**
 * The call or ticket a lane's head waits on, if it waits on one.
 */
export const waitOf = (lane: Lane) =>
  Phase.$match(lane.head.phase, {
    Acknowledging: ({ ticket }) => Option.some<string>(ticket),
    Unsent: () => Option.none<string>(),
    Withdrawing: ({ ticket }) => Option.some<string>(ticket),
    Recapturing: ({ ticket }) => Option.some<string>(ticket),
    Resending: () => Option.none<string>(),
    OnWire: ({ call }) => Option.some<string>(call),
    Cancelling: ({ call }) => Option.some<string>(call),
    Held: () => Option.none<string>(),
  });

/**
 * The order incarnations started in: the counter their id was minted with.
 */
export const startOrder = (incarnation: Incarnation) =>
  Number(incarnation.id.slice(incarnation.id.lastIndexOf("-") + 1));

/**
 * A world's indexes rebuilt from its facts by scanning: what the step operations keep up to date.
 */
const indexesOf = (world: World) => {
  const lanesOfActor = new Map<string, Set<string>>();
  const laneOfWait = new Map<string, string>();
  const consumersOf = new Map<string, Set<string>>();
  const silenceOf = new Map<string, TimerId>();

  for (const [id, lane] of world.lanes) {
    const key = actorKey(lane.actor);
    lanesOfActor.set(key, (lanesOfActor.get(key) ?? new Set()).add(id));

    for (const wait of Option.toArray(waitOf(lane))) laneOfWait.set(wait, id);
  }

  for (const incarnation of world.incarnations.values())
    for (const provider of incarnation.bound.values()) {
      const key = actorKey(provider);
      consumersOf.set(key, (consumersOf.get(key) ?? new Set()).add(actorKey(incarnation.actor)));
    }

  for (const [id, timer] of world.timers)
    if (Timer.$is("Silent")(timer)) silenceOf.set(timer.ticket, id);

  return { lanesOfActor, laneOfWait, consumersOf, silenceOf };
};

const sameEntries = <V>(
  kept: ReadonlyMap<string, V>,
  built: ReadonlyMap<string, V>,
  same: (a: V, b: V) => boolean,
) =>
  kept.size === built.size &&
  [...built].every(([key, value]) => {
    const held = kept.get(key);

    return held !== undefined && same(held, value);
  });

const sameOrder = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
  a.size === b.size && [...a].every((member, at) => [...b][at] === member);

const sameMembers = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
  a.size === b.size && [...a].every((member) => b.has(member));

/**
 * The indexes of a world that differ from their rebuild by {@link indexesOf}: none when every
 * step operation kept them in step. Each identity's lanes must also keep the lanes table's order.
 */
export const indexDrift = (world: World) => {
  const built = indexesOf(world);

  return [
    sameEntries(world.lanesOfActor, built.lanesOfActor, sameOrder) ? [] : ["lanesOfActor"],
    sameEntries(world.laneOfWait, built.laneOfWait, (a, b) => a === b) ? [] : ["laneOfWait"],
    sameEntries(world.consumersOf, built.consumersOf, sameMembers) ? [] : ["consumersOf"],
    sameEntries(world.silenceOf, built.silenceOf, (a, b) => a === b) ? [] : ["silenceOf"],
  ].flat();
};

/**
 * Work a step returns for the driver to run.
 */
export type Command = Data.TaggedEnum<{
  Invoke: {
    call: CallId;
    machine: string;
    operation: string;
    input: Values;
    attempt: {
      readonly id: string;
      readonly key: Values;
      readonly retryCount: number;
      readonly mayHaveApplied: boolean;
    };
  };
  Lookup: { call: CallId; machine: string; operation: string; input: Values };
  Interrupt: { call: CallId };
  Arm: { timer: TimerId; at: number };
  Disarm: { timer: TimerId };
  Persist: { writes: ReadonlyArray<Write>; refused: ReadonlyArray<TicketId>; due: Due };
}>;

/**
 * When a step's writes must be issued: within the capture interval, at once, or at once with the
 * tickets whose answer its sends await.
 */
export type Due = Data.TaggedEnum<{
  Later: {};
  Now: {};
  Awaited: { tickets: ReadonlyArray<Ticket> };
}>;

/**
 * Constructors and matchers for {@link Due}.
 */
export const Due = Data.taggedEnum<Due>();

/**
 * Constructors and matchers for {@link Command}.
 */
export const Command = Data.taggedEnum<Command>();

/**
 * What one step returns: the next world, its commands and its evidence, in order.
 */
export type Out = {
  readonly world: World;
  readonly commands: ReadonlyArray<Command>;
  readonly evidence: ReadonlyArray<Evidence>;
};
