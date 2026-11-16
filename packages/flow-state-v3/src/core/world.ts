import { type Brand, Data, type Option } from "effect";
import type { Evidence } from "./evidence.ts";
import { emptyLedger, type Ledger, type OwedId } from "./ledger.ts";
import { Life } from "./life.ts";
import type { IssueCode, ScheduleDeadline } from "./vocabulary.ts";
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
export type Armed = { readonly arming: number; readonly dueAt: number; readonly send: string };

/**
 * One live incarnation of an identity.
 *
 * **Details**
 *
 * `state` is the active leaf's path. `activations` numbers each entry of the states on its chain,
 * outermost first: a re-entry is a new activation, so work its old activation owns ends late.
 * `history` holds each exited compound's last active child. `bound` names the provider of each
 * context slot, `context` holds each slot's selected value and `baselines` each `onContext`
 * reaction's last selection.
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
  // FLOW_STATE_ALLOW_UNKNOWN: a slot's value has the type its selector returns, typed at the definition.
  readonly context: ReadonlyMap<string, unknown>;
  // FLOW_STATE_ALLOW_UNKNOWN: a reaction's selection has the type its select returns.
  readonly baselines: ReadonlyArray<unknown>;
};

/**
 * An incarnation's open issue: the source that raised it (`event X`, `schedule X`, `operation X`
 * or `creation`), its code and the callback slot that failed, if one did. Only a later accepted
 * turn of the same source clears it.
 */
export type Issue = {
  readonly source: string;
  readonly code: IssueCode;
  readonly slot: Option.Option<string>;
};

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
  // FLOW_STATE_ALLOW_UNKNOWN: each slot's last-seen value, as JSON; a return compares against it.
  readonly seen: ReadonlyMap<string, unknown>;
};

/**
 * An identity whose actor record could not encode at a step's end: none of its records went, and
 * its touched lanes and the tickets its sends await wait until a step can write the whole identity.
 */
export type Withheld = {
  readonly actor: ActorId;
  readonly lanes: ReadonlyArray<string>;
  readonly tickets: ReadonlyArray<Ticket>;
};

/**
 * Everything the Runtime decides from: plain data, replaced whole by each step.
 *
 * **Details**
 *
 * `quarantined` holds each record the boot could not read, by its key, with why: its bytes stay
 * until the identity saves over it or, for a lane, a cancel on its key clears it. `owedParts` holds,
 * per identity, how many records its owed rows were last written in, so a write that needs fewer
 * removes the rest.
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
  readonly owedParts: ReadonlyMap<string, number>;
  readonly ended: ReadonlyMap<string, Ended>;
  readonly life: Life;
};

/**
 * A world with nothing in it.
 */
// RETURN_TYPE: the empty value of the World contract.
export const emptyWorld = (persistence: boolean): World => ({
  incarnations: new Map(),
  records: new Map(),
  lanes: new Map(),
  owed: emptyLedger,
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
  owedParts: new Map(),
  ended: new Map(),
  life: Life.Inert(),
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
  Persist: { writes: ReadonlyArray<Write>; due: Due };
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
