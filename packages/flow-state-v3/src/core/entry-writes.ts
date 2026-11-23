import { Option, Result } from "effect";
import { isReadWrites, Operation, type ReadWrite } from "./compiled.ts";
import {
  applied,
  Cue,
  type Entry,
  type EntryKey,
  entryKeyOf,
  type Layer,
  movedBy,
} from "./entry-view.ts";
import { Act } from "./evidence-of.ts";
import type { Tx } from "./tx.ts";
import type { Channel } from "./vocabulary.ts";
import type { ActorId, AttemptId, Head } from "./world.ts";

/**
 * What commits do to read entries: a commit's optimistic changes, applied at its start and moved by
 * its Attempt's ending, and a write's success writes. Each change of an entry's data goes through
 * the entry table's `apply`.
 */
export const makeEntryWrites = (
  tx: Tx,
  {
    apply,
    put,
  }: {
    readonly apply: (key: EntryKey, cue: Cue) => void;
    readonly put: (key: EntryKey, entry: Entry) => void;
  },
) => {
  // The entry a change names, when its key is valid and the entry exists.
  const entryOf = (w: ReadWrite) =>
    Option.flatMap(w.keyText, (text) => {
      const key = entryKeyOf(w.contract, text);

      return Option.map(Option.fromUndefinedOr(tx.world().entries.get(key)), (entry) => ({
        key,
        entry,
      }));
    });

  /**
   * A commit that minted its Attempt applies its optimistic changes, each on the entry its read's
   * contract and key name. A change of an entry that does not exist applies nothing.
   */
  const layer = (attempt: AttemptId, writes: ReadonlyArray<ReadWrite>) => {
    for (const w of writes)
      for (const { key, entry } of Option.toArray(entryOf(w)))
        put(key, {
          ...entry,
          layers: [...entry.layers, { attempt, update: w.update, settled: Option.none() }],
        });
  };

  // An Attempt's updates marked settled now: each is kept until a read asked after it lands.
  const settle = (key: EntryKey, entry: Entry, mine: (l: Layer) => boolean) => {
    const at = tx.mintPosition();
    put(key, {
      ...entry,
      layers: entry.layers.map((l) => (mine(l) ? { ...l, settled: Option.some(at) } : l)),
    });
  };

  // How each Attempt ending moves the entry's updates of that Attempt.
  const ENDED = {
    success: settle,
    unknown: (key: EntryKey, entry: Entry, mine: (l: Layer) => boolean) => {
      settle(key, entry, mine);
      apply(key, Cue.Ask({ asker: Option.none(), refetch: true }));
    },
    removed: (key: EntryKey, entry: Entry, mine: (l: Layer) => boolean) =>
      put(key, { ...entry, layers: entry.layers.filter((l) => !mine(l)) }),
  } as const;

  /**
   * A commit's Attempt ended: a success marks its updates settled, kept until a read asked after it
   * lands; a failure, a NotSent, or a cancelled, superseded or disposed ending removes them with no
   * refetch; an unknown keeps them, settled the same way, and asks each Idle entry again once, so
   * the read that lands confirms or drops the look.
   */
  const attemptEnded = (attempt: AttemptId, channel: Channel, reason: string) => {
    const mine = (l: Layer) => l.attempt === attempt;
    const move = ENDED[movedBy(channel, reason)];

    for (const [key, entry] of tx.world().entries)
      if (entry.layers.some(mine)) move(key, entry, mine);
  };

  // One entry's success writes, judged once against the entry as the batch found it: Written with
  // the updates applied in order to the confirmed data, or Invalidate when data landed after the
  // commit started or there is none to update; a first write that gives the data itself lands on
  // an entry with no data at all.
  const written = (
    { key, entry }: { readonly key: EntryKey; readonly entry: Entry },
    ws: ReadonlyArray<ReadWrite>,
    started: Option.Option<number>,
  ) => {
    const confirmed = Option.filter(entry.data, (d) =>
      Option.exists(d.asked, (asked) => Option.exists(started, (s) => asked <= s)),
    );

    const empty = ws[0]?.replaces === true && Option.isNone(entry.data);

    // FLOW_STATE_ALLOW_UNKNOWN: a read's value is the lookup's own.
    const updated = (base: unknown) =>
      Cue.Written({ value: ws.reduce((value, w) => applied(w.update, value), base) });

    apply(
      key,
      Option.match(confirmed, {
        onNone: () => (empty ? updated(undefined) : Cue.Invalidate()),
        onSome: (d) => updated(d.value),
      }),
    );
  };

  // A batch's writes by the entry each names, in order; a write of an entry that does not exist
  // applies nothing.
  const byEntry = (writes: ReadonlyArray<ReadWrite>) => {
    const named = new Map<EntryKey, { at: { key: EntryKey; entry: Entry }; ws: ReadWrite[] }>();

    for (const w of writes)
      for (const at of Option.toArray(entryOf(w)))
        named.set(at.key, { at, ws: [...(named.get(at.key)?.ws ?? []), w] });

    return [...named.values()];
  };

  /**
   * A write's Attempt succeeded: its operation's success writes, from the answer and the input, are
   * applied before its ending is heard, as one batch: every target is checked before any applies,
   * and each entry is judged once. A batch with a target whose key has no valid form, or a `writes`
   * that throws or returns something else, applies nothing and is reported once; the commit still
   * succeeds.
   */
  // FLOW_STATE_ALLOW_UNKNOWN: a success's value is the contract's own, typed at `writes`.
  const succeeded = (actor: ActorId, operation: Operation, head: Head, value: unknown) => {
    if (!Operation.$is("Write")(operation)) return;

    for (const slot of Option.toArray(operation.writes)) {
      const writes = Result.getOrElse(
        Result.try(() => slot.run({ value, input: head.input })),
        () => undefined,
      );

      if (!isReadWrites(writes) || writes.some((w) => Option.isNone(w.keyText)))
        tx.act(Act.InvalidUpdate({ actor, operation: operation.name }));
      else for (const { at, ws } of byEntry(writes)) written(at, ws, head.started);
    }
  };

  return { layer, attemptEnded, succeeded };
};
