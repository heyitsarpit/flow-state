import { Data, Option, Predicate, Result } from "effect";
import { Alarm } from "./alarms.ts";
import { Operation, type Values } from "./compiled.ts";
import { Act } from "./evidence-of.ts";
import { CallResult } from "./input.ts";
import { type LedgerSteps, Route } from "./ledger.ts";
import { pick, type Tx } from "./tx.ts";
import type { Channel } from "./vocabulary.ts";
import {
  type ActorId,
  type AttemptId,
  type CallId,
  Command,
  type Incarnation,
  type IncarnationId,
  type OwnedBy,
} from "./world.ts";

/**
 * A read entry's name: its contract and its key's canonical text. It still names an entry after
 * the entry is removed.
 */
export type EntryKey = string;

/**
 * An entry's name from its contract and its key's canonical text.
 */
export const entryKeyOf = (contract: string, keyText: string) => `${contract}\u0000${keyText}`;

/**
 * Where an entry's one request stands: none, or one call asked at a position.
 */
export type Request = Data.TaggedEnum<{ Idle: {}; Running: { call: CallId; asked: number } }>;

/**
 * Constructors and matchers for {@link Request}.
 */
export const Request = Data.taggedEnum<Request>();

/**
 * A read's ending as a row carries it: a success with its value, or a failure by its tag, `Defect`
 * or `Interrupted`, with the lookup's error.
 */
export type ReadEnding = {
  readonly channel: "success" | "failure";
  readonly reason: string;
  // FLOW_STATE_ALLOW_UNKNOWN: a read's value or error is the lookup's own, mapped when heard.
  readonly value: unknown;
};

/**
 * One entry per contract and key, per Runtime: its key (the read's whole input), the landed data
 * with when it landed and the position its request was asked at, the position of the last
 * invalidation, its one request, whether one trailing request is wanted, its last landed ending
 * that was not a success, and when it lost its last hold.
 */
export type Entry = {
  readonly contract: string;
  readonly key: Values;
  // The machine and operation whose call reads it: its first holder's, which share the contract.
  readonly read: { readonly machine: string; readonly operation: string };
  // FLOW_STATE_ALLOW_UNKNOWN: landed data is the lookup's own value.
  readonly data: Option.Option<{ value: unknown; at: number; asked: Option.Option<number> }>;
  readonly staleAt: number;
  readonly request: Request;
  readonly again: boolean;
  readonly last: Option.Option<ReadEnding>;
  readonly unheldSince: Option.Option<number>;
  // Each live commit's optimistic update, in start order; never saved.
  readonly layers: ReadonlyArray<Layer>;
};

/**
 * One commit's optimistic update of an entry: its Attempt, the update readers see applied over
 * confirmed data, and the position its success settled at, after which a landed read confirms it.
 */
export type Layer = {
  readonly attempt: AttemptId;
  // FLOW_STATE_ALLOW_UNKNOWN: an update takes and returns the read's own value, typed at the commit.
  readonly update: (current: unknown) => unknown;
  readonly settled: Option.Option<number>;
};

/**
 * One read slot per life and operation: the entry it points at, its identity, the activation that
 * owns its ask, and whether it waits for an answer.
 */
export type ReadSlot = {
  readonly entry: EntryKey;
  readonly actor: ActorId;
  readonly owner: OwnedBy;
  readonly waiting: boolean;
};

// An entry's phase in its table: Idle, or Running with its request current or behind.
type Phase = "Idle" | "Current" | "Behind";

const PHASE = {
  idle: "Idle",
  current: "Current",
  behind: "Behind",
} as const satisfies Record<string, Phase>;

/**
 * A slot as its entry's holders name it: its life and its operation.
 */
export type Holder = { readonly life: IncarnationId; readonly operation: string };

/**
 * A holder's text, which its entry's holders are kept under.
 */
export const holderText = (h: Holder) => `${h.life}\u0000${h.operation}`;

/**
 * The read entries and slots of one step: the only writer of `entries`, `slots`, their call homes,
 * holders and releasing calls, and of the Collect alarms. Each change of an entry is one cue of
 * the entry table, applied to the entry's phase.
 */
export const makeEntries = (tx: Tx, ledger: LedgerSteps) => {
  // The entries a step took a hold from: judged at the step's end.
  const touched = new Set<EntryKey>();

  const now = () => tx.env.now;

  const readOf = (machine: string, operation: string) =>
    Option.filter(
      Option.fromUndefinedOr(tx.machines.get(machine)?.operations.get(operation)),
      Operation.$is("Read"),
    );

  const timesOf = (entry: Entry) =>
    Option.match(readOf(entry.read.machine, entry.read.operation), {
      onNone: () => ({ staleTime: 0, gcTime: 0 }),
      onSome: (op) => ({ staleTime: op.staleTime, gcTime: op.gcTime }),
    });

  const phaseOf = (entry: Entry) =>
    Request.$match(entry.request, {
      Idle: () => PHASE.idle,
      Running: ({ asked }) => (asked > entry.staleAt ? PHASE.current : PHASE.behind),
    });

  const fresh = (entry: Entry) =>
    Option.exists(
      entry.data,
      (d) =>
        Option.exists(d.asked, (asked) => asked >= entry.staleAt) &&
        now() - d.at >= 0 &&
        now() - d.at < timesOf(entry).staleTime,
    );

  const holdersOf = (key: EntryKey) => tx.world().holders.get(key) ?? new Map<string, Holder>();

  const put = (key: EntryKey, entry: Entry) => tx.put("entries", key, entry);

  const slotOf = (h: Holder) =>
    Option.fromUndefinedOr(tx.world().slots.get(h.life)?.get(h.operation));

  const setSlot = (h: Holder, slot: Option.Option<ReadSlot>) => {
    const slots = new Map(tx.world().slots.get(h.life) ?? []);

    Option.match(slot, {
      onNone: () => slots.delete(h.operation),
      onSome: (s) => slots.set(h.operation, s),
    });

    if (slots.size === 0) tx.drop("slots", h.life);
    else tx.put("slots", h.life, slots);
  };

  const hold = (key: EntryKey, h: Holder, held: boolean) => {
    const holders = new Map(holdersOf(key));

    if (held) holders.set(holderText(h), h);
    else {
      holders.delete(holderText(h));
      touched.add(key);
    }

    if (holders.size === 0) tx.drop("holders", key);
    else tx.put("holders", key, holders);
  };

  // One row to a slot's life, with the entry's key as the row's input.
  const owe = (h: Holder, slot: ReadSlot, entry: Entry, ending: ReadEnding) =>
    ledger.owe({
      actor: slot.actor,
      life: Option.some(h.life),
      operation: h.operation,
      input: Option.some(entry.key),
      attempt: Option.none(),
      lane: Option.none(),
      ...ending,
      route: Route.From({ owner: slot.owner }),
    });

  // Start: a call asked at a new position, the entry's one request, run in the Runtime's work.
  // RETURN_TYPE: the entry's own type, whichever request a start writes.
  const start = (key: EntryKey, entry: Entry, _by: Holder, _actor: ActorId): Entry => {
    const call = tx.mint("call");
    tx.put("callHome", call, key);
    tx.command(
      Command.Lookup({
        call,
        machine: entry.read.machine,
        operation: entry.read.operation,
        input: entry.key,
      }),
    );

    return { ...entry, request: Request.Running({ call, asked: tx.mintPosition() }) };
  };

  // The first holder of an entry with its slot, which a start the entry makes by itself runs for.
  const firstHolder = (key: EntryKey) =>
    Option.flatMap(Option.fromUndefinedOr([...holdersOf(key).values()][0]), (h) =>
      Option.map(slotOf(h), (slot) => ({ h, slot })),
    );

  // Release: the running call is told to stop and leaves the entry, which is Idle at once.
  const release = (key: EntryKey, entry: Entry) =>
    Request.$match(entry.request, {
      Idle: () => entry,
      Running: ({ call }) => {
        tx.drop("callHome", call);
        tx.put("releasing", call, key);
        tx.command(Command.Interrupt({ call }));

        return { ...entry, request: Request.Idle() };
      },
    });

  const remove = (key: EntryKey) => {
    tx.drop("entries", key);
    tx.clearAlarm(Alarm.Collect({ entry: key }));
  };

  // Every waiting slot of an entry is owed the ending once, and waits no more.
  const oweWaiters = (key: EntryKey, entry: Entry, ending: ReadEnding) => {
    for (const h of holdersOf(key).values()) {
      for (const slot of Option.toArray(slotOf(h)))
        if (slot.waiting) {
          setSlot(h, Option.some({ ...slot, waiting: false }));
          owe(h, slot, entry, ending);
        }
    }
  };

  // Ask Lookup (refetch false) and Ask Refetch (true): a fresh Idle entry serves a lookup; an Idle
  // one otherwise starts a request; a Running one keeps the slot waiting, and a request behind
  // wants one trailing request.
  const ask = (key: EntryKey, entry: Entry, h: Holder, slot: ReadSlot, refetch: boolean) => {
    const waits = (next: Entry) => {
      setSlot(h, Option.some({ ...slot, waiting: true }));
      put(key, next);
    };

    ({
      Idle: () => {
        if (!refetch && fresh(entry))
          for (const data of Option.toArray(entry.data))
            owe(h, slot, entry, {
              channel: "success",
              reason: "success",
              value: viewOf(entry, data.value),
            });
        else waits(start(key, entry, h, slot.actor));
      },
      Current: () => waits(entry),
      Behind: () => waits({ ...entry, again: true }),
    })[phaseOf(entry)]();
  };

  // The input a lookup's Schema refuses: one Defect row and its evidence, nothing asked.
  const refused = (incarnation: Incarnation, operation: string, input: Values, owner: OwnedBy) => {
    tx.act(Act.InvalidInput({ actor: incarnation.actor, operation }));
    ledger.owe({
      actor: incarnation.actor,
      life: Option.some(incarnation.id),
      operation,
      input: Option.some(input),
      attempt: Option.none(),
      lane: Option.none(),
      channel: "failure",
      reason: "Defect",
      value: undefined,
      route: Route.From({ owner }),
    });
  };

  /**
   * A lookup through a life's slot: its input checked by the operation's Schema, its entry made if
   * absent and held by the slot, then asked. A slot on another entry ends its old wait as
   * superseded and leaves it; an ask through a slot that already waits keeps its one wait.
   */
  const lookup = (
    incarnation: Incarnation,
    operation: Operation,
    given: Values,
    owner: OwnedBy,
  ) => {
    const input = tx.env.admit(given);

    const text = Option.flatMap(
      Option.liftPredicate(input, (i) => Result.isSuccess(operation.walk.input.text(i))),
      (i) => operation.walk.keyText(pick(i, operation.keyFields)),
    );

    if (Option.isNone(text)) return refused(incarnation, operation.name, input, owner);

    const key = entryKeyOf(operation.contract, text.value);
    const h = { life: incarnation.id, operation: operation.name };
    const before = slotOf(h);

    for (const slot of Option.toArray(before)) {
      if (slot.waiting) tx.act(Act.ReadReplaced({ operation: operation.name }));

      if (slot.entry !== key) hold(slot.entry, h, false);
    }

    const entry: Entry = tx.world().entries.get(key) ?? {
      contract: operation.contract,
      key: input,
      read: { machine: incarnation.actor.machine, operation: operation.name },
      data: Option.none(),
      staleAt: 0,
      request: Request.Idle(),
      again: false,
      last: Option.none(),
      unheldSince: Option.none(),
      layers: [],
    };

    // First hold arrives: an unheld entry is held again, and its Collect is cleared.
    if (Option.isSome(entry.unheldSince)) tx.clearAlarm(Alarm.Collect({ entry: key }));

    const held = { ...entry, unheldSince: Option.none<number>() };
    const slot = { entry: key, actor: incarnation.actor, owner, waiting: false };

    put(key, held);
    setSlot(h, Option.some(slot));
    hold(key, h, true);
    ask(key, held, h, slot, false);
  };

  /**
   * A read's refetch through its slot: its entry is asked again; with no slot, nothing.
   */
  const refetch = (incarnation: Incarnation, operation: string) => {
    const h = { life: incarnation.id, operation };

    for (const slot of Option.toArray(slotOf(h)))
      for (const entry of Option.toArray(
        Option.fromUndefinedOr(tx.world().entries.get(slot.entry)),
      ))
        ask(slot.entry, entry, h, slot, true);
  };

  /**
   * A read's cancel: its slot is dropped with no row.
   */
  const cancel = (incarnation: Incarnation, operation: string) => {
    const h = { life: incarnation.id, operation };

    for (const slot of Option.toArray(slotOf(h))) {
      setSlot(h, Option.none());
      hold(slot.entry, h, false);
    }
  };

  /**
   * A life ended: each of its slots is dropped with no row.
   */
  const end = (incarnation: Incarnation) => {
    for (const operation of Array.from(tx.world().slots.get(incarnation.id)?.keys() ?? []))
      cancel(incarnation, operation);
  };

  // Settled on a Running entry: a current request lands and is owed to every waiter; a request
  // behind lands nothing, and starts the trailing request when one is wanted.
  const landed = (key: EntryKey, entry: Entry, asked: number, result: CallResult) => {
    if (phaseOf(entry) === "Behind") {
      tx.act(Act.ReadReplaced({ operation: entry.read.operation }));
      const idle = { ...entry, request: Request.Idle(), again: false };

      put(
        key,
        Option.match(
          Option.filter(firstHolder(key), () => entry.again),
          {
            onNone: () => idle,
            onSome: ({ h, slot }) => start(key, idle, h, slot.actor),
          },
        ),
      );

      return;
    }

    if (CallResult.$is("Defect")(result)) tx.act(Act.Defect());

    const ending = endingOf(result);

    // A success asked after a commit's success confirms that commit's update, which goes.
    const next: Entry =
      ending.channel === "success"
        ? {
            ...entry,
            request: Request.Idle(),
            data: Option.some({ value: ending.value, at: now(), asked: Option.some(asked) }),
            last: Option.none(),
            layers: entry.layers.filter((l) => !Option.exists(l.settled, (at) => asked > at)),
          }
        : { ...entry, request: Request.Idle(), last: Option.some(ending) };

    put(key, next);
    oweWaiters(
      key,
      next,
      ending.channel === "success" ? { ...ending, value: viewOf(next, ending.value) } : ending,
    );
  };

  /**
   * A commit that minted its Attempt applies its optimistic values: each names a read of the
   * committing machine with `{ key, data }`, `data` an update of the current value. An update of an
   * entry that does not exist, or a value of another shape, applies nothing.
   */
  const layer = (incarnation: Incarnation, attempt: AttemptId, values: Values) => {
    for (const [name, value] of Object.entries(values))
      for (const op of Option.toArray(readOf(incarnation.actor.machine, name)))
        for (const { key, update } of Option.toArray(targetOf(value))) {
          const text = op.walk.keyText(pick(key, op.keyFields));
          const at = Option.map(text, (t) => entryKeyOf(op.contract, t));

          for (const entryKey of Option.toArray(at))
            for (const entry of Option.toArray(
              Option.fromUndefinedOr(tx.world().entries.get(entryKey)),
            ))
              put(entryKey, {
                ...entry,
                layers: [...entry.layers, { attempt, update, settled: Option.none() }],
              });
        }
  };

  // How each Attempt ending moves the entry's updates of that Attempt.
  const ENDED = {
    success: (key: EntryKey, entry: Entry, mine: (l: Layer) => boolean) => {
      const at = tx.mintPosition();
      put(key, {
        ...entry,
        layers: entry.layers.map((l) => (mine(l) ? { ...l, settled: Option.some(at) } : l)),
      });
    },
    unknown: (key: EntryKey, entry: Entry) => {
      for (const { h, slot } of Option.toArray(
        Option.filter(firstHolder(key), () => phaseOf(entry) === PHASE.idle),
      ))
        put(key, start(key, entry, h, slot.actor));
    },
    removed: (key: EntryKey, entry: Entry, mine: (l: Layer) => boolean) =>
      put(key, { ...entry, layers: entry.layers.filter((l) => !mine(l)) }),
  } as const;

  /**
   * A commit's Attempt ended: a success marks its updates settled, kept until a read asked after it
   * lands; a failure or a NotSent removes them with no refetch; an unknown keeps them and asks each
   * Idle entry again once.
   */
  const attemptEnded = (attempt: AttemptId, channel: Channel) => {
    const mine = (l: Layer) => l.attempt === attempt;
    const move = ENDED[BY_CHANNEL[channel]];

    for (const [key, entry] of tx.world().entries)
      if (entry.layers.some(mine)) move(key, entry, mine);
  };

  /**
   * A call settled: one an entry released is dropped; an entry's own request lands its Settled
   * cell. Returns whether the call was a read's.
   */
  const settled = (call: CallId, result: CallResult) => {
    if (tx.world().releasing.has(call)) {
      tx.drop("releasing", call);

      return true;
    }

    const key = tx.world().callHome.get(call);

    if (key === undefined) return false;
    tx.drop("callHome", call);

    const entry = tx.world().entries.get(key);

    if (entry !== undefined && Request.$is("Running")(entry.request))
      landed(key, entry, entry.request.asked, result);

    return true;
  };

  /**
   * A Collect alarm came due: an entry Idle and unheld for its `gcTime` is removed.
   */
  const collectDue = (key: EntryKey) => {
    const entry = tx.world().entries.get(key);

    if (entry === undefined || phaseOf(entry) !== "Idle" || holdersOf(key).size > 0) return;

    if (Option.exists(entry.unheldSince, (since) => now() - since >= timesOf(entry).gcTime))
      remove(key);
  };

  /**
   * The step's end: an entry that lost its last hold in the step is released when Running, then
   * removed at once with no `gcTime`, or given its Collect alarm. A hold that left and came back in
   * the step changes nothing.
   */
  const stepEnds = () => {
    for (const key of touched) {
      const entry = tx.world().entries.get(key);

      if (entry === undefined || holdersOf(key).size > 0 || Option.isSome(entry.unheldSince))
        continue;

      const unheld = { ...release(key, entry), again: false, unheldSince: Option.some(now()) };
      const { gcTime } = timesOf(unheld);

      if (gcTime <= 0) remove(key);
      else {
        put(key, unheld);
        tx.setAlarm(Alarm.Collect({ entry: key }), now() + gcTime);
      }
    }

    touched.clear();
  };

  /**
   * The Runtime ended: every entry is removed, its running request released, and nothing is owed.
   */
  const runtimeEnds = () => {
    for (const [key, entry] of tx.world().entries) {
      release(key, entry);
      remove(key);
    }

    tx.replace("slots", new Map());
    tx.replace("holders", new Map());
  };

  return {
    lookup,
    refetch,
    cancel,
    end,
    settled,
    collectDue,
    stepEnds,
    runtimeEnds,
    layer,
    attemptEnded,
  };
};

// How each ending channel of an Attempt moves its updates: a failure and a NotSent remove them.
const BY_CHANNEL = {
  success: "success",
  unknown: "unknown",
  failure: "removed",
  notSent: "removed",
} as const satisfies Record<Channel, "success" | "unknown" | "removed">;

// An optimistic or written target as a commit wrote it, `{ key, data }`, `data` an update of the
// current value; none for any other shape.
// FLOW_STATE_ALLOW_UNKNOWN: a target is the commit callback's own value, read here once.
const targetOf = (value: unknown) =>
  Predicate.hasProperty(value, "key") &&
  Predicate.isReadonlyObject(value.key) &&
  Predicate.hasProperty(value, "data") &&
  isUpdate(value.data)
    ? Option.some({ key: value.key, update: value.data })
    : Option.none();

// RETURN_TYPE: a type guard states the type it narrows to.
const isUpdate = (u: Values[string]): u is Layer["update"] => Predicate.isFunction(u);

// What readers see of an entry: its confirmed value with each live update applied in start order;
// an update that throws or returns nothing leaves the value as it was.
// FLOW_STATE_ALLOW_UNKNOWN: a read's value is the lookup's own.
const viewOf = (entry: Entry, confirmed: unknown) =>
  entry.layers.reduce(
    (value, l) =>
      Result.getOrElse(
        Result.try(() => l.update(value)),
        () => value,
      ) ?? value,
    confirmed,
  );

// A settled read's ending as its row carries it.
const endingOf = (result: CallResult) =>
  CallResult.$match(result, {
    Success: ({ value }) => ({ channel: "success", reason: "success", value }) satisfies ReadEnding,
    Failure: ({ reason, error }) =>
      ({ channel: "failure", reason, value: error }) satisfies ReadEnding,
    Unknown: ({ reason, error }) =>
      ({ channel: "failure", reason, value: error }) satisfies ReadEnding,
    Defect: () => ({ channel: "failure", reason: "Defect", value: undefined }) satisfies ReadEnding,
    Interrupted: () =>
      ({ channel: "failure", reason: "Interrupted", value: undefined }) satisfies ReadEnding,
  });

/**
 * The entries' functions on one step.
 */
export type EntrySteps = ReturnType<typeof makeEntries>;
