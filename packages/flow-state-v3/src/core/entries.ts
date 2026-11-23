import { Option, Result } from "effect";
import { Alarm } from "./alarms.ts";
import { Operation, type Values } from "./compiled.ts";
import { makeEntryPlacements } from "./entry-placements.ts";
import { makeEntryReleases } from "./entry-releases.ts";
import {
  againOf,
  type Asker,
  type Cell,
  Cue,
  type Entry,
  type EntryKey,
  endingOf,
  entryKeyOf,
  type Holder,
  holderText,
  matches,
  phaseOf,
  Placement,
  type ReadEnding,
  type ReadSlot,
  Request,
  type Row,
  viewOf,
  withAgain,
  withOne,
} from "./entry-view.ts";
import { makeEntryWrites } from "./entry-writes.ts";
import { Act } from "./evidence-of.ts";
import { CallResult } from "./input.ts";
import { type LedgerSteps, Route } from "./ledger.ts";
import { pick, type Tx } from "./tx.ts";
import { type ActorId, type CallId, Command, type Incarnation, type OwnedBy } from "./world.ts";

// Who a row goes to: the identity and the activation that owns the ask or the placement.
type Recipient = { readonly actor: ActorId; readonly owner: OwnedBy };

// Landed data's value: the lookup's own.
type Landed = Option.Option.Value<Entry["data"]>["value"];

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
    const slots = withOne(tx.world().slots.get(h.life) ?? new Map<string, ReadSlot>(), h, slot);

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

  const waitersOf = (key: EntryKey) =>
    [...holdersOf(key).values()].flatMap((h) =>
      Option.toArray(
        Option.map(
          Option.filter(slotOf(h), (s) => s.waiting),
          (slot) => ({ h, slot }),
        ),
      ),
    );

  // One row to a slot's or a placement's life, with the entry's key as the row's input.
  const owe = (h: Holder, to: Recipient, entry: Entry, ending: ReadEnding) =>
    ledger.owe({
      actor: to.actor,
      life: Option.some(h.life),
      operation: h.operation,
      input: Option.some(entry.key),
      attempt: Option.none(),
      lane: Option.none(),
      ...ending,
      route: Route.From({ owner: to.owner }),
    });

  // The placements, which call back into the table's moves only once a step runs.
  const { place, unplace, placementsOf, placementOf, placedOn, show } = makeEntryPlacements(tx, {
    hold,
    held: (key, incarnation, operation, input) => held(key, incarnation, operation, input),
    apply: (key, cue) => apply(key, cue),
    owe,
    holdersOf,
    keyOf: (operation, input) => keyOf(operation, input),
  });

  // ── the moves.

  // Start: a call asked at a new position, the entry's one request, run in the Runtime's work.
  // RETURN_TYPE: the entry's own type, whichever request a start writes.
  const start = (key: EntryKey, entry: Entry): Entry => {
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

    return { ...entry, request: Request.Running({ call, asked: tx.mintPosition(), again: false }) };
  };

  // Serve: the asking slot is owed the data with each live update applied; no request.
  const serve = (asker: Asker, entry: Entry) => {
    for (const { h, slot } of Option.toArray(asker))
      for (const data of Option.toArray(entry.data))
        owe(h, slot, entry, {
          channel: "success",
          reason: "success",
          value: viewOf(entry, data.value),
        });
  };

  // The asking slot waits for the entry's request.
  const wait = (asker: Asker) => {
    for (const { h, slot } of Option.toArray(asker))
      setSlot(h, Option.some({ ...slot, waiting: true }));
  };

  // Owe: every waiting slot of an entry is owed the ending once, and waits no more.
  const oweWaiters = (key: EntryKey, entry: Entry, ending: ReadEnding) => {
    for (const { h, slot } of waitersOf(key)) {
      setSlot(h, Option.some({ ...slot, waiting: false }));
      owe(h, slot, entry, ending);
    }
  };

  // The releasing calls: a holder's identity is its slot's or its placement's.
  const { release, ended, releaseDue } = makeEntryReleases(tx, holdersOf, (h) =>
    Option.orElse(
      Option.map(slotOf(h), (s) => s.actor),
      () => Option.map(Option.filter(placementOf(h), Placement.$is("Placed")), (p) => p.actor),
    ),
  );

  const remove = (key: EntryKey) => {
    tx.drop("entries", key);
    tx.clearAlarm(Alarm.Collect({ entry: key }));
  };

  // Data a landed success or a write confirms: updates whose commit succeeded before it go.
  // RETURN_TYPE: the entry's own type, so the cleared fields keep their Option types.
  const confirmed = (entry: Entry, value: Landed, asked: number): Entry => ({
    ...entry,
    data: Option.some({ value, at: now(), asked: Option.some(asked) }),
    last: Option.none(),
    layers: entry.layers.filter((l) => !Option.exists(l.settled, (at) => asked > at)),
  });

  // Clear's data changes: no data and no last ending, stale from a new position.
  // RETURN_TYPE: the entry's own type, so the cleared fields keep their Option types.
  const cleared = (entry: Entry): Entry => ({
    ...entry,
    data: Option.none(),
    last: Option.none(),
    staleAt: tx.mintPosition(),
  });

  // ── the cells, by cue and phase.

  const ask: Row<"Ask"> = {
    Idle: (key, entry, { asker, refetch }) => {
      if (!refetch && fresh(entry)) return serve(asker, entry);

      put(key, start(key, entry));
      wait(asker);
    },
    Current: (_key, _entry, { asker }) => wait(asker),
    Behind: (key, entry, { asker }) => {
      if (Option.isNone(asker)) return;

      put(key, withAgain(entry, true));
      wait(asker);
    },
  };

  // Whether anything wants the entry's data now: a waiting slot or a placement.
  const wanted = (key: EntryKey) => waitersOf(key).length > 0 || placedOn(key).length > 0;

  const invalidated = (key: EntryKey, entry: Entry) =>
    put(key, withAgain({ ...entry, staleAt: tx.mintPosition() }, againOf(entry) || wanted(key)));

  // An Idle entry a placement holds starts a request at once; any other only changes.
  const startIfPlaced = (key: EntryKey, entry: Entry) =>
    put(key, placedOn(key).length > 0 ? start(key, entry) : entry);

  const invalidate: Row<"Invalidate"> = {
    Idle: (key, entry) => startIfPlaced(key, { ...entry, staleAt: tx.mintPosition() }),
    Current: invalidated,
    Behind: invalidated,
  };

  const writtenCell: Cell<"Written"> = (key, entry, { value }) => {
    const p = tx.mintPosition();
    const next = withAgain({ ...confirmed(entry, value, p), staleAt: p }, false);

    put(key, next);
    oweWaiters(key, next, { channel: "success", reason: "success", value: viewOf(next, value) });
    show(key, next);
  };

  const clearRunning = (key: EntryKey, entry: Entry) => {
    const restart = againOf(entry) || wanted(key);
    const idle = release(key, cleared(entry));

    put(key, restart ? start(key, idle) : idle);
  };

  const clear: Row<"Clear"> = {
    Idle: (key, entry) => startIfPlaced(key, cleared(entry)),
    Current: clearRunning,
    Behind: clearRunning,
  };

  const settled: Row<"Settled"> = {
    Idle: () => undefined,
    Current: (key, entry, { asked, result }) => {
      if (CallResult.$is("Defect")(result)) tx.act(Act.Defect());

      const ending = endingOf(result);
      const idle = { ...entry, request: Request.Idle() };

      const next =
        ending.channel === "success"
          ? confirmed(idle, ending.value, asked)
          : { ...idle, last: Option.some(ending) };

      put(key, next);
      oweWaiters(
        key,
        next,
        ending.channel === "success" ? { ...ending, value: viewOf(next, ending.value) } : ending,
      );

      // A placement sees landed data once it changes, and every landed ending that is not data.
      if (ending.channel === "success") show(key, next);
      else for (const { h, placed } of placedOn(key)) owe(h, placed, next, ending);
    },
    Behind: (key, entry) => {
      tx.act(Act.ReadReplaced({ operation: entry.read.operation }));
      const idle = { ...entry, request: Request.Idle() };

      put(key, againOf(entry) ? start(key, idle) : idle);
    },
  };

  const unheld = (key: EntryKey, entry: Entry) => {
    const { gcTime } = timesOf(entry);

    if (gcTime <= 0) return remove(key);

    put(key, { ...entry, unheldSince: Option.some(now()) });
    tx.setAlarm(Alarm.Collect({ entry: key }), now() + gcTime);
  };

  const lastHoldLeft: Row<"LastHoldLeft"> = {
    Idle: unheld,
    Current: (key, entry) => unheld(key, release(key, entry)),
    Behind: (key, entry) => unheld(key, release(key, entry)),
  };

  const collectDue: Row<"CollectDue"> = {
    Idle: (key, entry) => {
      if (
        holdersOf(key).size === 0 &&
        Option.exists(entry.unheldSince, (since) => now() - since >= timesOf(entry).gcTime)
      )
        remove(key);
    },
    Current: () => undefined,
    Behind: () => undefined,
  };

  const runtimeEnds: Row<"RuntimeEnds"> = {
    Idle: (key) => remove(key),
    Current: (key, entry) => {
      release(key, entry);
      remove(key);
    },
    Behind: (key, entry) => {
      release(key, entry);
      remove(key);
    },
  };

  const written: Row<"Written"> = { Idle: writtenCell, Current: writtenCell, Behind: writtenCell };

  // One cue on one entry: the cell of its row at the entry's phase.
  const apply = (key: EntryKey, cue: Cue) => {
    const entry = tx.world().entries.get(key);

    if (entry === undefined) return;

    const phase = phaseOf(entry);

    Cue.$match(cue, {
      Ask: (c) => ask[phase](key, entry, c),
      Invalidate: (c) => invalidate[phase](key, entry, c),
      Written: (c) => written[phase](key, entry, c),
      Clear: (c) => clear[phase](key, entry, c),
      Settled: (c) => settled[phase](key, entry, c),
      LastHoldLeft: (c) => lastHoldLeft[phase](key, entry, c),
      CollectDue: (c) => collectDue[phase](key, entry, c),
      RuntimeEnds: (c) => runtimeEnds[phase](key, entry, c),
    });
  };

  // ── the slot cells.

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

    const text = keyOf(operation, input);

    if (Option.isNone(text)) return refused(incarnation, operation.name, input, owner);

    const key = entryKeyOf(operation.contract, text.value);
    const h = { life: incarnation.id, operation: operation.name };

    for (const slot of Option.toArray(slotOf(h))) {
      if (slot.waiting) tx.act(Act.ReadReplaced({ operation: operation.name }));

      if (slot.entry !== key) hold(slot.entry, h, false);
    }

    const slot = { entry: key, actor: incarnation.actor, owner, waiting: false };

    held(key, incarnation, operation, input);
    setSlot(h, Option.some(slot));
    hold(key, h, true);
    apply(key, Cue.Ask({ asker: Option.some({ h, slot }), refetch: false }));
  };

  // An entry a new hold points at: made if absent, its first hold arriving if it was unheld.
  const held = (key: EntryKey, incarnation: Incarnation, operation: Operation, input: Values) => {
    const entry: Entry = tx.world().entries.get(key) ?? {
      contract: operation.contract,
      key: input,
      read: { machine: incarnation.actor.machine, operation: operation.name },
      data: Option.none(),
      staleAt: 0,
      request: Request.Idle(),
      last: Option.none(),
      unheldSince: Option.none(),
      layers: [],
    };

    // First hold arrives: an unheld entry is held again, and its Collect is cleared.
    if (Option.isSome(entry.unheldSince)) tx.clearAlarm(Alarm.Collect({ entry: key }));

    put(key, { ...entry, unheldSince: Option.none() });
  };

  // The key text a read's input names, none when its Schema refuses it.
  const keyOf = (operation: Operation, input: Values) =>
    Option.flatMap(
      Option.liftPredicate(input, (i) => Result.isSuccess(operation.walk.input.text(i))),
      (i) => operation.walk.keyText(pick(i, operation.keyFields)),
    );

  /**
   * A read's refetch through its slot or its placement: its entry is asked again; with neither,
   * nothing.
   */
  const refetch = (incarnation: Incarnation, operation: string) => {
    const h = { life: incarnation.id, operation };

    for (const slot of Option.toArray(slotOf(h)))
      apply(slot.entry, Cue.Ask({ asker: Option.some({ h, slot }), refetch: true }));

    for (const placed of Option.toArray(Option.filter(placementOf(h), Placement.$is("Placed"))))
      apply(placed.entry, Cue.Ask({ asker: Option.none(), refetch: true }));
  };

  // Every entry of a read's contract whose key holds a partial key's fields.
  const named = (operation: Operation, partial: Values) =>
    [...tx.world().entries]
      .filter(([, e]) => e.contract === operation.contract && matches(e.key, partial))
      .map(([key]) => key);

  // A cue on every entry of a read's contract a partial key names: a read's invalidate makes each
  // stale, its clear empties each.
  const onNamed = (cue: Cue) => (operation: Operation, partial: Values) => {
    for (const key of named(operation, tx.env.admit(partial))) apply(key, cue);
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

    for (const operation of placementsOf(incarnation)) unplace(incarnation, operation);

    tx.drop("placements", incarnation.id);
  };

  const { layer, attemptEnded, succeeded } = makeEntryWrites(tx, apply);

  // ── the dispatch and the step's edges.

  /**
   * A call settled: one an entry released is dropped; an entry's own request lands its Settled
   * cell. Returns whether the call was a read's.
   */
  const settledCall = (call: CallId, result: CallResult) => {
    if (ended(call)) return true;

    const key = tx.world().callHome.get(call);

    if (key === undefined) return false;
    tx.drop("callHome", call);

    const entry = tx.world().entries.get(key);

    if (entry !== undefined && Request.$is("Running")(entry.request))
      apply(key, Cue.Settled({ asked: entry.request.asked, result }));

    return true;
  };

  /**
   * A Collect alarm came due: an entry Idle and unheld for its `gcTime` is removed.
   */
  const collect = (key: EntryKey) => apply(key, Cue.CollectDue());

  /**
   * The step's end: an entry that lost its last hold in the step gets its Last hold left cell. A
   * hold that left and came back in the step changes nothing.
   */
  const stepEnds = () => {
    for (const key of touched) {
      const entry = tx.world().entries.get(key);

      if (entry !== undefined && holdersOf(key).size === 0 && Option.isNone(entry.unheldSince))
        apply(key, Cue.LastHoldLeft());
    }

    touched.clear();
  };

  /**
   * The Runtime ended: every entry is removed, its running request released, and nothing is owed.
   */
  const runtimeEnded = () => {
    for (const key of tx.world().entries.keys()) apply(key, Cue.RuntimeEnds());

    tx.replace("slots", new Map());
    tx.replace("placements", new Map());
    tx.replace("holders", new Map());
  };

  return {
    lookup,
    place,
    unplace,
    placementsOf,
    refetch,
    invalidate: onNamed(Cue.Invalidate()),
    clear: onNamed(Cue.Clear()),
    cancel,
    end,
    settled: settledCall,
    collectDue: collect,
    releaseDue,
    stepEnds,
    runtimeEnds: runtimeEnded,
    layer,
    attemptEnded,
    succeeded,
  };
};

/**
 * The entries' functions on one step.
 */
export type EntrySteps = ReturnType<typeof makeEntries>;
