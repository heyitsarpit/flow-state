import { type Brand, Data, type Option } from "effect";
import type { Evidence } from "./evidence.ts";
import type { Channel, ScheduleDeadline } from "./vocabulary.ts";
import type { Values } from "./compiled.ts";

/**
 * An actor's identity: its machine and its name.
 */
export type ActorId = { readonly machine: string; readonly name: string };

/**
 * The text an identity is stored under: machine, then the name with `%`, `/` and `|` escaped.
 */
export const actorKey = (actor: ActorId) =>
  `${actor.machine}/${actor.name.replaceAll("%", "%25").replaceAll("/", "%2F").replaceAll("|", "%7C")}`;

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
 * A ticket a batch carries: the Attempt it acknowledges or captures.
 */
export type Ticket = {
  readonly id: TicketId;
  readonly attempt: string;
  readonly purpose: "acknowledge" | "capture";
};

/**
 * One record write of a batch: its new value, or `None` to remove it.
 */
export type Write = { readonly key: string; readonly record: Option.Option<Values> };

/**
 * A schedule's live arming: its arming number (a firing of an older arming is discarded) and its
 * deadline.
 */
export type Armed = { readonly arming: number; readonly dueAt: number; readonly send: string };

/**
 * One live incarnation of an identity.
 *
 * **Details**
 *
 * `activation` numbers the current leaf's entry: a re-entry is a new activation, so work its old
 * activation owns ends late (Turn R20).
 */
export type Incarnation = {
  readonly id: string;
  readonly actor: ActorId;
  readonly state: string;
  readonly activation: number;
  readonly memory: Values;
  readonly schedules: ReadonlyMap<string, Armed>;
};

/**
 * Where an Attempt's send is (WriteLanes R6, R8, R14): its lane is InFlight in every phase but
 * `Held`.
 *
 * **Details**
 *
 * - `Acknowledging`: a persisted first send, waiting for storage to acknowledge it (WriteAhead R13).
 * - `Ready`: waiting to be invoked after its turn.
 * - `OnWire`: invoked; `call` names the live call.
 * - `Recapturing`: a persisted re-send, waiting for its lane record's capture.
 * - `Held`: a retained unknown.
 */
export type Phase = Data.TaggedEnum<{
  Acknowledging: { ticket: TicketId };
  Ready: {};
  OnWire: { call: CallId; cancelled: boolean };
  Recapturing: { ticket: TicketId };
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
  readonly mayHaveApplied: boolean;
  readonly sent: boolean;
  readonly owner: number;
  readonly phase: Phase;
};

/**
 * A write lane (WriteLanes R6): an identity's operation at one key, while it is not Idle.
 */
export type Lane = {
  readonly id: string;
  readonly actor: ActorId;
  readonly operation: string;
  readonly key: Values;
  readonly keyText: string;
  readonly head: Head;
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
 * An ending as it waits in a mailbox: mapped and routed when its turn is admitted.
 */
export type Ending = {
  readonly operation: string;
  readonly attempt: Option.Option<string>;
  readonly lane: Option.Option<string>;
  readonly channel: Channel;
  readonly reason: string;
  // FLOW_STATE_ALLOW_UNKNOWN: the ending's value is the commit's or lookup's own, mapped at admission.
  readonly value: unknown;
  readonly owner: number;
  readonly current: boolean;
  readonly redelivered: boolean;
  readonly parked: boolean;
};

/**
 * One item of an actor's mailbox (Actors R12).
 */
export type Mail = Data.TaggedEnum<{
  Event: { actor: ActorId; tag: string; payload: Values };
  Ending: { actor: ActorId; ending: Ending };
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
 * Who holds a use of an identity.
 */
export type Use = "story" | "host" | "component";

/**
 * An identity's saved record, as the Runtime's copy holds it.
 */
export type ActorRecord = {
  readonly actor: ActorId;
  readonly state: string;
  readonly memory: Values;
  readonly schedules: ReadonlyArray<typeof ScheduleDeadline.Type>;
};

/**
 * Where the Runtime's disposal is.
 */
export type Disposal = Data.TaggedEnum<{
  Open: {};
  Disposing: {};
  Disposed: {};
}>;

/**
 * Constructors and matchers for {@link Disposal}.
 */
export const Disposal = Data.taggedEnum<Disposal>();

/**
 * Endings parked on a lane for the identity's next incarnation, in the order they ended
 * (Actors R22, Restore R3).
 */
export type Parked = {
  readonly lane: string;
  readonly actor: ActorId;
  readonly operation: string;
  readonly endings: ReadonlyArray<Ending>;
  readonly kept: boolean;
};

/**
 * Everything the Runtime decides from: plain data, replaced whole by each step.
 */
export type World = {
  readonly incarnations: ReadonlyMap<string, Incarnation>;
  readonly records: ReadonlyMap<string, ActorRecord>;
  readonly lanes: ReadonlyMap<string, Lane>;
  readonly parked: ReadonlyMap<string, Parked>;
  readonly reads: ReadonlyMap<CallId, Read>;
  readonly mail: ReadonlyArray<Mail>;
  readonly uses: ReadonlyMap<string, ReadonlyArray<Use>>;
  readonly timers: ReadonlyMap<TimerId, Timer>;
  readonly tickets: ReadonlyMap<TicketId, TimerId>;
  readonly counter: number;
  readonly persistence: boolean;
  readonly disposal: Disposal;
};

/**
 * A world with nothing in it.
 */
// RETURN_TYPE: the empty value of the World contract.
export const emptyWorld = (persistence: boolean): World => ({
  incarnations: new Map(),
  records: new Map(),
  lanes: new Map(),
  parked: new Map(),
  reads: new Map(),
  mail: [],
  uses: new Map(),
  timers: new Map(),
  tickets: new Map(),
  counter: 0,
  persistence,
  disposal: Disposal.Open(),
});

/**
 * Work a step returns for the driver to run (Turn's composition note).
 */
export type Command = Data.TaggedEnum<{
  Invoke: {
    call: CallId;
    machine: string;
    operation: string;
    input: Values;
    attempt: Option.Option<{
      readonly id: string;
      readonly key: Values;
      readonly retryCount: number;
      readonly mayHaveApplied: boolean;
    }>;
  };
  Interrupt: { call: CallId };
  Arm: { timer: TimerId; at: number };
  Disarm: { timer: TimerId };
  Persist: {
    scope: string;
    writes: ReadonlyArray<Write>;
    ticket: Option.Option<Ticket>;
  };
}>;

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
