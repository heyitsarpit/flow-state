import { Option, Result } from "effect";
import { Alarm } from "./alarms.ts";
import type { Operation, Values } from "./compiled.ts";
import { makeEntryPlacements } from "./entry-placements.ts";
import { makeEntryReleases } from "./entry-releases.ts";
import { makeEntrySlots } from "./entry-slots.ts";
import { makeEntryStore } from "./entry-store.ts";
import type { Persistence } from "./persist.ts";
import {
  againOf,
  type Cell,
  Cue,
  type Entry,
  type EntryKey,
  endingOf,
  type Holder,
  holderText,
  matches,
  phaseOf,
  Placement,
  ReadEnding,
  Request,
  rowEnding,
  type Row,
  freshAt,
  timesIn,
  viewOf,
  withAgain,
} from "./entry-view.ts";
import { makeEntryWrites } from "./entry-writes.ts";
import { Act } from "./evidence-of.ts";
import { CallResult } from "./input.ts";
import { type LedgerSteps, Origin, Route } from "./ledger.ts";
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
export const makeEntries = (tx: Tx, ledger: LedgerSteps, persistence: Persistence) => {
  const store = makeEntryStore(tx, persistence);

  // The entries a step took a hold from: judged at the step's end.
  const touched = new Set<EntryKey>();

  const now = () => tx.env.now;

  const timesOf = (entry: Entry) => timesIn(tx.machines, entry);

  const fresh = (entry: Entry) => freshAt(entry, timesOf(entry).staleTime, now());

  const holdersOf = (key: EntryKey) => tx.world().holders.get(key) ?? new Map<string, Holder>();

  // An entry written; its saved entry follows its data. A live optimistic layer holds its entry: the
  // first to arrive on an unheld entry is its first hold, and one leaving is judged at the step's end.
  const put = (key: EntryKey, entry: Entry) => {
    const before = Option.fromUndefinedOr(tx.world().entries.get(key));
    const arrived = entry.layers.length > 0 && Option.isSome(entry.unheldSince);

    if (arrived) tx.clearAlarm(Alarm.Collect({ entry: key }));

    if (Option.exists(before, (b) => b.layers.length > entry.layers.length)) touched.add(key);

    const next = arrived ? { ...entry, unheldSince: Option.none() } : entry;

    store.changed(before, next);
    tx.put("entries", key, next);
  };

  // Whether nothing holds an entry: no slot or placement points at it and no layer is live.
  const unheldNow = (key: EntryKey, entry: Entry) =>
    holdersOf(key).size === 0 && entry.layers.length === 0;

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

  // One row to a slot's or a placement's life, with the entry's key as the row's input.
  const owe = (
    h: Holder,
    to: Recipient,
    entry: Entry,
    ending: ReadEnding,
    origin: Origin = Origin.Decided(),
  ) =>
    ledger.owe(
      {
        actor: to.actor,
        life: Option.some(h.life),
        operation: h.operation,
        input: Option.some(entry.key),
        attempt: Option.none(),
        lane: Option.none(),
        ...rowEnding(ending),
        route: Route.From({ owner: to.owner }),
      },
      origin,
    );

  // The placements, which call back into the table's moves only once a step runs.
  const { place, unplace, placementsOf, placementOf, placedOn, show } = makeEntryPlacements(tx, {
    hold,
    held: (key, incarnation, operation, input) => held(key, incarnation, operation, input),
    apply: (key, cue) => apply(key, cue),
    owe,
    holdersOf,
    keyOf: (operation, input) => keyOf(operation, input),
  });

  // The slots, likewise.
  const slots = makeEntrySlots(tx, ledger, {
    holdersOf,
    hold,
    held: (key, incarnation, operation, input) => held(key, incarnation, operation, input),
    apply: (key, cue) => apply(key, cue),
    owe,
    keyOf: (operation, input) => keyOf(operation, input),
  });

  const { slotOf, serve, wait, oweWaiters } = slots;

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

  // A collection: the entry is removed, and its saved entry with it.
  const collected = (key: EntryKey, entry: Entry) => {
    store.removed(entry);
    remove(key);
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
  const wanted = (key: EntryKey) => slots.waited(key) || placedOn(key).length > 0;

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
    oweWaiters(key, next, ReadEnding.Landed({ value: viewOf(next, value) }));
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

      // A placement sees landed data once it changes, and every landed ending that is not data.
      if (ReadEnding.$is("Landed")(ending)) {
        const next = confirmed(idle, ending.value, asked);

        put(key, next);
        oweWaiters(key, next, ReadEnding.Landed({ value: viewOf(next, ending.value) }));
        show(key, next);
      } else {
        const next = { ...idle, last: Option.some(ending) };

        put(key, next);
        oweWaiters(key, next, ending);

        for (const { h, placed } of placedOn(key)) owe(h, placed, next, ending);
      }
    },
    Behind: (key, entry) => {
      tx.act(Act.ReadReplaced({ operation: entry.read.operation }));
      const idle = { ...entry, request: Request.Idle() };

      put(key, againOf(entry) ? start(key, idle) : idle);
    },
  };

  const unheld = (key: EntryKey, entry: Entry) => {
    const { gcTime } = timesOf(entry);

    if (gcTime <= 0) return collected(key, entry);

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
        unheldNow(key, entry) &&
        Option.exists(entry.unheldSince, (since) => now() - since >= timesOf(entry).gcTime)
      )
        collected(key, entry);
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

  // ── the holds' and reads' cells.

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
   * A life ended: each of its slots is dropped with no row, and each placement left.
   */
  const end = (incarnation: Incarnation) => {
    slots.end(incarnation);

    for (const operation of placementsOf(incarnation)) unplace(incarnation, operation);

    tx.drop("placements", incarnation.id);
  };

  const { layer, attemptEnded, succeeded } = makeEntryWrites(tx, { apply, put });

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

      if (entry !== undefined && unheldNow(key, entry) && Option.isNone(entry.unheldSince))
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
    lookup: slots.lookup,
    place,
    unplace,
    placementsOf,
    refetch,
    invalidate: onNamed(Cue.Invalidate()),
    clear: onNamed(Cue.Clear()),
    cancel: slots.cancel,
    end,
    settled: settledCall,
    collectDue: collect,
    releaseDue,
    install: store.install,
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
