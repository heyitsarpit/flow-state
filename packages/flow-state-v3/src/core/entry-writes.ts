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
export const makeEntryWrites = (tx: Tx, apply: (key: EntryKey, cue: Cue) => void) => {
  const put = (key: EntryKey, entry: Entry) => tx.put("entries", key, entry);

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

  // How each Attempt ending moves the entry's updates of that Attempt.
  const ENDED = {
    success: (key: EntryKey, entry: Entry, mine: (l: Layer) => boolean) => {
      const at = tx.mintPosition();
      put(key, {
        ...entry,
        layers: entry.layers.map((l) => (mine(l) ? { ...l, settled: Option.some(at) } : l)),
      });
    },
    unknown: (key: EntryKey) => apply(key, Cue.Ask({ asker: Option.none(), refetch: true })),
    removed: (key: EntryKey, entry: Entry, mine: (l: Layer) => boolean) =>
      put(key, { ...entry, layers: entry.layers.filter((l) => !mine(l)) }),
  } as const;

  /**
   * A commit's Attempt ended: a success marks its updates settled, kept until a read asked after it
   * lands; a failure, a NotSent, or a cancelled, superseded or disposed ending removes them with no
   * refetch; an unknown keeps them and asks each Idle entry again once.
   */
  const attemptEnded = (attempt: AttemptId, channel: Channel, reason: string) => {
    const mine = (l: Layer) => l.attempt === attempt;
    const move = ENDED[movedBy(channel, reason)];

    for (const [key, entry] of tx.world().entries)
      if (entry.layers.some(mine)) move(key, entry, mine);
  };

  // One success write on its entry: Written with the update applied to the confirmed data, or
  // Invalidate when data landed after the commit started or there is none to update; a write that
  // gives the data itself lands on an entry with no data at all.
  const written = (w: ReadWrite, started: Option.Option<number>) => {
    for (const { key, entry } of Option.toArray(entryOf(w))) {
      const confirmed = Option.filter(entry.data, (d) =>
        Option.exists(d.asked, (asked) => Option.exists(started, (s) => asked <= s)),
      );

      const empty = w.replaces && Option.isNone(entry.data);

      apply(
        key,
        Option.match(confirmed, {
          onNone: () =>
            empty ? Cue.Written({ value: applied(w.update, undefined) }) : Cue.Invalidate(),
          onSome: (d) => Cue.Written({ value: applied(w.update, d.value) }),
        }),
      );
    }
  };

  /**
   * A write's Attempt succeeded: its operation's success writes, from the answer and the input, are
   * applied before its ending is heard. A write whose key has no valid form, or a `writes` that
   * throws or returns something else, applies nothing and is reported; the commit still succeeds.
   */
  // FLOW_STATE_ALLOW_UNKNOWN: a success's value is the contract's own, typed at `writes`.
  const succeeded = (actor: ActorId, operation: Operation, head: Head, value: unknown) => {
    if (!Operation.$is("Write")(operation)) return;

    for (const slot of Option.toArray(operation.writes)) {
      const writes = Result.getOrElse(
        Result.try(() => slot.run({ value, input: head.input })),
        () => undefined,
      );

      const invalid = () => tx.act(Act.InvalidUpdate({ actor, operation: operation.name }));

      if (!isReadWrites(writes)) invalid();
      else
        for (const w of writes)
          if (Option.isNone(w.keyText)) invalid();
          else written(w, head.started);
    }
  };

  return { layer, attemptEnded, succeeded };
};
