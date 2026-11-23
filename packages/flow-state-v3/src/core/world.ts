import { Brand, Data, Option, type Schema } from "effect";
import { laneText, ownerText } from "./record-key.ts";
import type { Evidence } from "./evidence.ts";
import type { Ledger, OwedId } from "./ledger.ts";
import { Life } from "./life.ts";
import type { IssueCode } from "./vocabulary.ts";
import type { SavedSchedules } from "./record-shape.ts";
import type { Values } from "./compiled.ts";
import type { Selected } from "./slots.ts";
import type { Alarmed } from "./alarms.ts";
import type { Scheduled, TimerKey } from "./timers.ts";
import {
  type Entry,
  type EntryKey,
  type Holder,
  holderText,
  type Placement,
  type ReadSlot,
  type Releasing,
} from "./entry-view.ts";

/**
 * An actor's identity: its machine and its name.
 */
export type ActorId = { readonly machine: string; readonly name: string };

/**
 * The text an identity is stored under, made only by {@link actorKey}.
 */
export type ActorKey = string & Brand.Brand<"flow-state/ActorKey">;

/**
 * The id a write lane is kept under, made by {@link laneId}.
 */
export type LaneId = string & Brand.Brand<"flow-state/LaneId">;

/**
 * An Attempt's id, made by the world's mint, or decoded from a saved record by its Schema.
 */
export type AttemptId = string & Brand.Brand<"flow-state/AttemptId">;

const actorKeyOf = Brand.nominal<ActorKey>();

const laneIdOf = Brand.nominal<LaneId>();

// Each identity's key, minted once: an identity is immutable, so its key never changes.
const keys = new WeakMap<ActorId, ActorKey>();

/**
 * The text an identity is stored under: machine, then the name with `%`, `/` and `|` escaped.
 */
export const actorKey = (actor: ActorId) => {
  const known = keys.get(actor);

  if (known !== undefined) return known;

  const key = actorKeyOf(ownerText(actor));

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
  laneIdOf(laneText(actor, operation, keyText));

/**
 * A storage ticket's id: the batch an acknowledgement or capture waits on.
 */
export type TicketId = string & Brand.Brand<"flow-state/TicketId">;

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
 * The key a tracked timer has in its incarnation: its schedule's name, and a keyed one's key text.
 */
export const trackOf = (name: string, key: Option.Option<TimerKey>) =>
  Option.match(key, { onNone: () => name, onSome: (k) => `${name}\u0000${k.text}` });

/**
 * One live incarnation of an identity.
 *
 * **Details**
 *
 * `state` is the active leaf's path. `activations` numbers each entry of the states on its chain,
 * outermost first: a re-entry is a new activation, so work its old activation owns ends late.
 * `history` holds each exited compound's last active child. `bound` names the provider of each
 * context slot, `context` holds each slot's selection and `baselines` each `onContext` reaction's
 * baseline: the value of its slot it last compared.
 * `started` is the mint's count when it started: live incarnations are ordered by it. `schedules`
 * holds each active schedule's state by name. `issues` holds the open issues of every source but a
 * schedule's, which are read from `schedules`.
 */
export type Incarnation = {
  readonly id: IncarnationId;
  readonly started: number;
  readonly actor: ActorId;
  readonly state: string;
  readonly activations: ReadonlyArray<ActivationId>;
  readonly history: ReadonlyMap<string, string>;
  readonly memory: Values;
  readonly schedules: ReadonlyMap<string, Scheduled>;
  readonly issues: ReadonlyArray<StoredIssue>;
  readonly bound: ReadonlyMap<string, ActorId>;
  readonly context: ReadonlyMap<string, Selected>;
  // None for a reaction that has not been live while its slot had a value.
  readonly baselines: ReadonlyArray<Option.Option<Selected>>;
};

/**
 * What raised an issue: an event's turn, a schedule's timer (a keyed one's key by its canonical
 * text; none for an unkeyed schedule or its `keys`), an owed ending of an operation at one key, a
 * read entry's last ending at one key, a placement's select, a released call of a key the
 * incarnation holds, a context slot's selector, or an `onContext` reaction. An issue is replaced or
 * cleared only by its own source.
 */
export type IssueSource = Data.TaggedEnum<{
  Event: { tag: string };
  Schedule: { name: string; key: Option.Option<string> };
  Ending: { operation: string; key: string };
  Entry: { operation: string; key: string };
  Placement: { operation: string };
  Call: { operation: string; key: string };
  Context: { slot: string };
  OnContext: { at: number };
}>;

/**
 * Constructors and matchers for {@link IssueSource}.
 */
export const IssueSource = Data.taggedEnum<IssueSource>();

/**
 * An issue source as a snapshot names it: `event X`, `schedule X` (a keyed one's `schedule X KEY`),
 * `operation X KEY`, `read X KEY`, `context X` or `onContext N`.
 */
export const sourceText = (source: IssueSource) =>
  IssueSource.$match(source, {
    Event: ({ tag }) => `event ${tag}`,
    Schedule: ({ name, key }) =>
      Option.match(key, {
        onNone: () => `schedule ${name}`,
        onSome: (k) => `schedule ${name} ${k}`,
      }),
    Ending: ({ operation, key }) => `operation ${operation} ${key}`,
    Entry: ({ operation, key }) => `read ${operation} ${key}`,
    Placement: ({ operation }) => `placement ${operation}`,
    Call: ({ operation, key }) => `call ${operation} ${key}`,
    Context: ({ slot }) => `context ${slot}`,
    OnContext: ({ at }) => `onContext ${at}`,
  });

/**
 * An incarnation's open issue: the source that raised it, its code and the callback slot that
 * failed, if one did. A schedule's issues are read from its timers' check outcomes; every other
 * source's is stored, and only its own source clears it: a later accepted turn of that source.
 */
export type Issue = {
  readonly source: IssueSource;
  readonly code: IssueCode;
  readonly slot: Option.Option<string>;
};

/**
 * The sources whose issues are stored: every source but a schedule's, read from its timers, an
 * ending's, read from its owed row's refusal, and an entry's, read from its last ending.
 */
export type StoredSource = Exclude<IssueSource, { readonly _tag: "Schedule" | "Ending" | "Entry" }>;

/**
 * A stored issue: one of a {@link StoredSource}.
 */
export type StoredIssue = Issue & { readonly source: StoredSource };

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
 * The lane's addressable Attempt, with the activation that owns it. `progress` is the last value
 * its commit reported with `progress(p)`, kept while the Attempt is the head and never saved.
 */
export type Head = {
  readonly id: AttemptId;
  readonly input: Values;
  readonly retryCount: number;
  readonly owner: OwnedBy;
  readonly phase: Phase;
  // FLOW_STATE_ALLOW_UNKNOWN: a progress value has the type its contract's progress Schema decodes.
  readonly progress: Option.Option<unknown>;
  // The position its Attempt started at, which a success write compares landed data with; none
  // for a head restored from a record. Never saved.
  readonly started: Option.Option<number>;
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
 * One item of an actor's mailbox; an ending is a reference to its owed row, never the ending. A
 * context update asks the actor to read its providers again: at most one waits per actor. An event
 * or context update carries the loop guard's chain it follows, if it follows one.
 */
export type Mail = Data.TaggedEnum<{
  // `resendable`: the source can send the event again (a host's send); an actor's send and a
  // context reaction cannot.
  Event: {
    actor: ActorId;
    tag: string;
    payload: Values;
    chain: Option.Option<ChainId>;
    resendable: boolean;
  };
  Context: { actor: ActorId; chain: Option.Option<ChainId> };
  Ending: { actor: ActorId; id: OwedId };
  Firing: {
    actor: ActorId;
    incarnation: IncarnationId;
    schedule: string;
    track: string;
    arming: ArmingId;
  };
}>;

/**
 * Constructors and matchers for {@link Mail}.
 */
export const Mail = Data.taggedEnum<Mail>();

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
  readonly schedules: SavedSchedules;
  readonly context: ReadonlyMap<string, ActorId>;
  // Each slot's last selection; a slot never selected has none.
  readonly seen: ReadonlyMap<string, Selected>;
  // Each reaction's baseline, the value of its slot it last compared; none with no baseline.
  readonly baselines: ReadonlyArray<Option.Option<Selected>>;
  // The bindings of every provider up its context graph, which a provider started again for it keeps.
  readonly graph: Wiring;
};

/**
 * A record key a step changed: an identity's position or work, with the identity whose record it
 * is, or a saved read entry, with the text it is written as (none to delete it).
 */
export type Mark = Data.TaggedEnum<{
  Actor: { actor: ActorId };
  Work: { actor: ActorId };
  Entry: { saved: Option.Option<string> };
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
 * Why a boot read a record no further: a position it resets (it failed its structure, or names a
 * state or holds a memory field the machine no longer reads), or a record it keeps byte for byte
 * (another format's key, a newer format, a work side that failed its structure, a machine no longer
 * declared, a name that does not read), with what failed.
 */
export type Quarantine = Data.TaggedEnum<{
  Reset: { why: "Structure" | "State" | "Memory"; detail: string };
  Kept: { why: "Foreign" | "Newer" | "Orphan" | "Name" | "Structure"; detail: string };
}>;

/**
 * Constructors and matchers for {@link Quarantine}.
 */
export const Quarantine = Data.taggedEnum<Quarantine>();

/**
 * A quarantine's reason as snapshots show it: what failed.
 */
export const quarantineText = (q: Quarantine) => q.detail;

/**
 * Where a carried part sits in an identity's work record: a whole subject, a contract's lanes, one
 * lane, a displaced Attempt of a lane, or a row after the given count of rows read before it.
 */
export type Place = Data.TaggedEnum<{
  Subject: { subject: string };
  Contract: { subject: string; contract: string };
  Lane: { subject: string; contract: string; keyText: string };
  Displaced: { subject: string; contract: string; keyText: string };
  Row: { after: number };
}>;

/**
 * Constructors and matchers for {@link Place}.
 */
export const Place = Data.taggedEnum<Place>();

/**
 * A part of a work record the boot could not read, carried byte for byte at its place: never
 * delivered, its lane key still held by the operation that names it, written back unchanged.
 */
export type CarriedPart = {
  readonly place: Place;
  readonly json: Schema.Json;
  readonly why: "Retired" | "Unread";
  readonly held: Option.Option<{ readonly operation: string; readonly keyText: string }>;
};

/**
 * An identity's carried parts, in the order they were read.
 */
export type Carried = ReadonlyArray<CarriedPart>;

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
 * `quarantined` holds each record the boot did not read, by its key, with why: its bytes stay until
 * the identity saves a position over a reset one, or forget removes them. `carried` holds each
 * identity's carried work parts, and `legacy` the format 5 keys its next work write removes.
 *
 * `alarms` holds the one host alarm of each owner fact that has a deadline, by the fact's key;
 * `wake` the deadline of the one wake the host holds, none while no alarm is due.
 *
 * The last three maps are indexes, each derived from the facts above by the step operation that
 * changes them ({@link indexesOf} rebuilds them): each identity's lanes, the lane whose head waits
 * on each call or ticket, and each provider's live consumers.
 */
export type World = {
  readonly incarnations: ReadonlyMap<string, Incarnation>;
  readonly records: ReadonlyMap<string, ActorRecord>;
  readonly lanes: ReadonlyMap<LaneId, Lane>;
  readonly owed: Ledger;
  readonly entries: ReadonlyMap<EntryKey, Entry>;
  readonly slots: ReadonlyMap<IncarnationId, ReadonlyMap<string, ReadSlot>>;
  readonly placements: ReadonlyMap<IncarnationId, ReadonlyMap<string, Placement>>;
  readonly releasing: ReadonlyMap<CallId, Releasing>;
  readonly displaced: ReadonlyMap<string, Displaced>;
  readonly mail: ReadonlyMap<string, ReadonlyArray<Mail>>;
  readonly uses: ReadonlyMap<ActorKey, ReadonlyArray<Use>>;
  readonly alarms: ReadonlyMap<string, Alarmed>;
  readonly wake: Option.Option<number>;
  readonly counter: number;
  readonly attempts: number;
  readonly persistence: boolean;
  readonly marked: Marks;
  readonly withheld: ReadonlyMap<string, ActorId>;
  readonly quarantined: ReadonlyMap<string, Quarantine>;
  readonly carried: ReadonlyMap<string, Carried>;
  readonly legacy: ReadonlyMap<string, ReadonlyArray<string>>;
  readonly ended: ReadonlyMap<string, Ended>;
  readonly life: Life;
  readonly lanesOfActor: ReadonlyMap<string, ReadonlySet<LaneId>>;
  readonly laneOfWait: ReadonlyMap<string, LaneId>;
  readonly consumersOf: ReadonlyMap<string, ReadonlySet<string>>;
  readonly callHome: ReadonlyMap<CallId, EntryKey>;
  readonly holders: ReadonlyMap<EntryKey, ReadonlyMap<string, Holder>>;
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
  entries: new Map(),
  slots: new Map(),
  placements: new Map(),
  releasing: new Map(),
  displaced: new Map(),
  mail: new Map(),
  uses: new Map(),
  alarms: new Map(),
  wake: Option.none(),
  counter: 0,
  attempts: 0,
  persistence,
  marked: new Map(),
  withheld: new Map(),
  quarantined: new Map(),
  carried: new Map(),
  legacy: new Map(),
  ended: new Map(),
  life: Life.Inert(),
  lanesOfActor: new Map(),
  laneOfWait: new Map(),
  consumersOf: new Map(),
  callHome: new Map(),
  holders: new Map(),
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

  return { lanesOfActor, laneOfWait, consumersOf, ...entryIndexesOf(world) };
};

// The read entries' indexes rebuilt: the entry whose request each call is, and each entry's
// holders, the slots that point at it.
const entryIndexesOf = (world: World) => {
  const callHome = new Map<string, string>();
  const holders = new Map<string, Map<string, Holder>>();

  for (const [key, entry] of world.entries)
    if (entry.request._tag === "Running") callHome.set(entry.request.call, key);

  const held = (entry: EntryKey, h: Holder) =>
    holders.set(entry, (holders.get(entry) ?? new Map<string, Holder>()).set(holderText(h), h));

  for (const [life, slots] of world.slots)
    for (const [operation, slot] of slots) held(slot.entry, { life, operation });

  for (const [life, placed] of world.placements)
    for (const [operation, placement] of placed)
      if (placement._tag === "Placed") held(placement.entry, { life, operation });

  return { callHome, holders };
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
    sameEntries(world.callHome, built.callHome, (a, b) => a === b) ? [] : ["callHome"],
    sameEntries(world.holders, built.holders, (a, b) =>
      sameMembers(new Set(a.keys()), new Set(b.keys())),
    )
      ? []
      : ["holders"],
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
  // A read's request belongs to its entry, so it runs in the Runtime's work, not a life's.
  Lookup: { call: CallId; machine: string; operation: string; input: Values };
  Interrupt: { call: CallId };
  // The end of each named incarnation's work: its reads stop and their cleanups are awaited, in
  // order; a failed cleanup is the ref's at an incarnation's end, the Runtime's at its disposal.
  EndWork: { owners: ReadonlyArray<string>; reportTo: "ref" | "runtime" };
  // The host's one wake: at the earliest alarm's deadline, a Tick; it replaces any earlier wake.
  Wake: { at: number };
  // No alarm is due: the host drops the wake it holds.
  Sleep: {};
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
