import { Brand, Data, Equal, Option } from "effect";
import type { Evidence } from "./evidence.ts";
import type { Ledger, OwedId } from "./ledger.ts";
import { Life } from "./life.ts";
import type { IssueCode, ReadFailure, ScheduleDeadline } from "./vocabulary.ts";
import type { Values } from "./compiled.ts";
import type { Selected } from "./slots.ts";

/**
 * An actor's identity: its machine and its name.
 */
export type ActorId = { readonly machine: string; readonly name: string };

/**
 * The text an identity is stored under, made only by {@link actorKey}.
 */
export type ActorKey = string & Brand.Brand<"flow-state/ActorKey">;

/**
 * The id a write lane is kept under, made by {@link laneId}, or read back from a saved lane record.
 */
export type LaneId = string & Brand.Brand<"flow-state/LaneId">;

/**
 * An Attempt's id, made by the world's mint, or read back from a saved lane record.
 */
export type AttemptId = string & Brand.Brand<"flow-state/AttemptId">;

const actorKeyOf = Brand.nominal<ActorKey>();

const laneIdOf = Brand.nominal<LaneId>();

/**
 * A lane id read back from a saved lane record, once the boot has checked it against the record.
 */
export const restoredLaneId = laneIdOf;

/**
 * An Attempt id read back from a saved lane record: the one the mint made before the reload.
 */
export const restoredAttemptId = Brand.nominal<AttemptId>();

// Each identity's key, minted once: an identity is immutable, so its key never changes.
const keys = new WeakMap<ActorId, ActorKey>();

/**
 * The text an identity is stored under: machine, then the name with `%`, `/` and `|` escaped.
 */
export const actorKey = (actor: ActorId) => {
  const known = keys.get(actor);

  if (known !== undefined) return known;

  const key = actorKeyOf(
    `${actor.machine}/${actor.name.replaceAll("%", "%25").replaceAll("/", "%2F").replaceAll("|", "%7C")}`,
  );

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
  laneIdOf(`${actorKey(actor)}|${operation}|${keyText}`);

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
 * An incarnation's id: one life of an identity.
 */
export type IncarnationId = string & Brand.Brand<"flow-state/IncarnationId">;

/**
 * A state's activation: minted on each entry, so a later entry is a larger number.
 */
export type ActivationId = number & Brand.Brand<"flow-state/ActivationId">;

/**
 * A schedule's arming: minted on each arming, so a firing of an older one is told apart.
 */
export type ArmingId = number & Brand.Brand<"flow-state/ArmingId">;

/**
 * A loop guard chain's id: minted when an admitted item first enqueues mail.
 */
export type ChainId = number & Brand.Brand<"flow-state/ChainId">;

/**
 * Who owns a piece of work: the root, which lives as long as the incarnation, or the activation of
 * the state that started it.
 */
export type OwnedBy = Data.TaggedEnum<{ Root: {}; State: { activation: ActivationId } }>;

/**
 * Constructors and matchers for {@link OwnedBy}.
 */
export const OwnedBy = Data.taggedEnum<OwnedBy>();

/**
 * A ticket a batch carries: the Attempt it acknowledges or captures, or the disposal's write.
 */
export type Ticket =
  | {
      readonly id: TicketId;
      readonly attempt: AttemptId;
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
  readonly arming: ArmingId;
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
 * baseline: the value of its slot it last compared. `grace` is the timer of a free incarnation's
 * grace.
 * `started` is the mint's count when it started: live incarnations are ordered by it.
 */
export type Incarnation = {
  readonly id: IncarnationId;
  readonly started: number;
  readonly actor: ActorId;
  readonly state: string;
  readonly activations: ReadonlyArray<ActivationId>;
  readonly history: ReadonlyMap<string, string>;
  readonly memory: Values;
  readonly schedules: ReadonlyMap<string, Armed>;
  readonly issues: ReadonlyArray<Issue>;
  readonly bound: ReadonlyMap<string, ActorId>;
  readonly context: ReadonlyMap<string, Selected>;
  // None for a reaction that has not been live while its slot had a value.
  readonly baselines: ReadonlyArray<Option.Option<Selected>>;
  readonly grace: Option.Option<TimerId>;
};

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
  readonly id: AttemptId;
  readonly input: Values;
  readonly retryCount: number;
  readonly owner: OwnedBy;
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
export const sentBefore = (head: Head) => head.retryCount > 0 || SENT_BEFORE[head.phase._tag];

// The phases only an Attempt sent before reaches.
const SENT_BEFORE = {
  Acknowledging: false,
  Unsent: false,
  Withdrawing: false,
  Recapturing: true,
  Resending: true,
  OnWire: false,
  Cancelling: false,
  Held: true,
} as const satisfies Record<Phase["_tag"], boolean>;

/**
 * A commit waiting behind a lane's head: its input and owning activation. It has no Attempt until
 * it is promoted.
 */
export type Queued = { readonly input: Values; readonly owner: OwnedBy };

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
  readonly lane: LaneId;
  readonly head: Head;
  readonly owed: boolean;
};

/**
 * A lookup in flight: the activation that owns it and the incarnation it reports to.
 */
export type Read = {
  readonly call: CallId;
  readonly actor: ActorId;
  readonly incarnation: IncarnationId;
  readonly operation: string;
  readonly owner: OwnedBy;
};

/**
 * One item of an actor's mailbox; an ending is a reference to its owed row, never the ending. A
 * context update asks the actor to read its providers again: at most one waits per actor. An event
 * or context update carries the loop guard's chain it follows, if it follows one.
 */
export type Mail = Data.TaggedEnum<{
  Event: { actor: ActorId; tag: string; payload: Values; chain: Option.Option<ChainId> };
  Context: { actor: ActorId; chain: Option.Option<ChainId> };
  Ending: { actor: ActorId; id: OwedId };
  Firing: {
    actor: ActorId;
    incarnation: IncarnationId;
    schedule: string;
    arming: ArmingId;
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
    incarnation: IncarnationId;
    schedule: string;
    arming: ArmingId;
  };
  Grace: { actor: ActorId; incarnation: IncarnationId };
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
  // Each slot's last selection; a slot never selected has none.
  readonly seen: ReadonlyMap<string, Selected>;
  // Each reaction's baseline, the value of its slot it last compared; none with no baseline.
  readonly baselines: ReadonlyArray<Option.Option<Selected>>;
  // The bindings of every provider up its context graph, which a provider started again for it keeps.
  readonly graph: Wiring;
};

/**
 * A record key a step changed, with the identity whose record it is: its actor record, one of its
 * lane records, or its owed record.
 */
export type Mark = Data.TaggedEnum<{
  Actor: { actor: ActorId };
  Lane: { actor: ActorId; lane: LaneId };
  Owed: { actor: ActorId };
}>;

/**
 * Constructors and matchers for {@link Mark}.
 */
export const Mark = Data.taggedEnum<Mark>();

/**
 * Record keys not yet known to have landed, each with its {@link Mark}, in the order they were
 * first marked.
 */
export type Marks = ReadonlyMap<string, Mark>;

/**
 * Why a boot kept a record aside: it could not read it, or it is a lane record of an operation its
 * machine no longer declares, a hold an earlier release left, which forget drops.
 */
export type Quarantine = Data.TaggedEnum<{
  Unreadable: { code: ReadFailure; detail: Option.Option<string> };
  Retired: { actor: ActorId; operation: string; lane: LaneId };
}>;

/**
 * Constructors and matchers for {@link Quarantine}.
 */
export const Quarantine = Data.taggedEnum<Quarantine>();

/**
 * A quarantine's reason as reports and snapshots show it: the read's detail, else its code.
 */
export const quarantineText = (q: Quarantine) =>
  Quarantine.$match(q, {
    Unreadable: ({ code, detail }) => Option.getOrElse(detail, () => code),
    Retired: () => "operation",
  });

/**
 * Everything the Runtime decides from: plain data, replaced whole by each step.
 *
 * **Details**
 *
 * `records` holds the actor record of each identity with no incarnation: one the boot restored and
 * no start has read yet, or one an end kept. `marked` holds each record key a step changed since a
 * capture last took it; `withheld` each identity whose actor record could not encode at the last
 * capture, whose keys stay marked until it can.
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
  readonly lanes: ReadonlyMap<LaneId, Lane>;
  readonly owed: Ledger;
  readonly reads: ReadonlyMap<CallId, Read>;
  readonly displaced: ReadonlyMap<string, Displaced>;
  readonly mail: ReadonlyMap<string, ReadonlyArray<Mail>>;
  readonly uses: ReadonlyMap<ActorKey, ReadonlyArray<Use>>;
  readonly timers: ReadonlyMap<TimerId, Timer>;
  readonly counter: number;
  readonly attempts: number;
  readonly persistence: boolean;
  readonly marked: Marks;
  readonly withheld: ReadonlyMap<string, ActorId>;
  readonly quarantined: ReadonlyMap<string, Quarantine>;
  readonly ended: ReadonlyMap<string, Ended>;
  readonly life: Life;
  readonly lanesOfActor: ReadonlyMap<string, ReadonlySet<LaneId>>;
  readonly laneOfWait: ReadonlyMap<string, LaneId>;
  readonly consumersOf: ReadonlyMap<string, ReadonlySet<string>>;
  readonly silenceOf: ReadonlyMap<string, TimerId>;
  readonly chains: ReadonlyMap<ChainId, Chain>;
  readonly chainCount: number;
};

/**
 * The sends counted toward the loop guard for one admitted event, and that event, as the refusal
 * names it.
 */
export type Chain = { readonly root: string; readonly sent: number };

/**
 * How the loop guard's refusal names the admitted item a chain began with.
 */
export const rootOf = (mail: Mail) =>
  Mail.$match(mail, {
    Event: ({ actor, tag }) => `${tag} to ${actor.name}`,
    Context: ({ actor }) => `a context update of ${actor.name}`,
    Ending: ({ actor }) => `an ending of ${actor.name}`,
    Firing: ({ actor, schedule }) => `schedule ${schedule} of ${actor.name}`,
  });

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
  marked: new Map(),
  withheld: new Map(),
  quarantined: new Map(),
  ended: new Map(),
  life: Life.Inert(),
  lanesOfActor: new Map(),
  laneOfWait: new Map(),
  consumersOf: new Map(),
  silenceOf: new Map(),
  chains: new Map(),
  chainCount: 0,
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
 * Orders incarnations by when they started.
 */
export const byStart = (a: Incarnation, b: Incarnation) => a.started - b.started;

/**
 * A world's indexes rebuilt from its facts by scanning: what the step operations keep up to date.
 */
const indexesOf = (world: World) => {
  const lanesOfActor = new Map<string, Set<LaneId>>();
  const laneOfWait = new Map<string, LaneId>();
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
      readonly id: AttemptId;
      readonly key: Values;
      readonly retryCount: number;
      readonly mayHaveApplied: boolean;
    };
  };
  // A read runs in the work of the incarnation that owns it.
  Lookup: { call: CallId; actor: ActorId; operation: string; input: Values; owner: string };
  Interrupt: { call: CallId };
  // The end of each named incarnation's work: its reads stop and their cleanups are awaited, in
  // order; a failed cleanup is the ref's at an incarnation's end, the Runtime's at its disposal.
  EndWork: { owners: ReadonlyArray<string>; reportTo: "ref" | "runtime" };
  Arm: { timer: TimerId; at: number };
  Disarm: { timer: TimerId };
  Persist: { refused: ReadonlyArray<TicketId>; due: Due };
  Write: {
    writes: ReadonlyArray<Write>;
    marks: Marks;
    tickets: ReadonlyArray<Ticket>;
    refused: ReadonlyArray<TicketId>;
  };
}>;

/**
 * When the records a step marked must be captured: within the capture interval, at once, or at
 * once with the tickets whose answer its sends await.
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
