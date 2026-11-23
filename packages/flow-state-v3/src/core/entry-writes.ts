import { Option } from "effect";
import { Operation, type Values } from "./compiled.ts";
import {
  Cue,
  type Entry,
  type EntryKey,
  entryKeyOf,
  type Layer,
  movedBy,
  targetOf,
} from "./entry-view.ts";
import { pick, type Tx } from "./tx.ts";
import type { Channel } from "./vocabulary.ts";
import type { AttemptId, Incarnation } from "./world.ts";

/**
 * What commits do to read entries: a commit's optimistic updates, applied at its start and moved by
 * its Attempt's ending. Each change of an entry's data goes through the entry table's `apply`.
 */
export const makeEntryWrites = (tx: Tx, apply: (key: EntryKey, cue: Cue) => void) => {
  const put = (key: EntryKey, entry: Entry) => tx.put("entries", key, entry);

  const readOf = (machine: string, operation: string) =>
    Option.filter(
      Option.fromUndefinedOr(tx.machines.get(machine)?.operations.get(operation)),
      Operation.$is("Read"),
    );

  /**
   * A commit that minted its Attempt applies its optimistic values: each names a read of the
   * committing machine with `{ key, data }`, `data` an update of the current value or the value
   * itself. An update of an entry that does not exist, or a value of another shape, applies nothing.
   */
  const layer = (incarnation: Incarnation, attempt: AttemptId, values: Values) => {
    for (const [name, value] of Object.entries(values))
      for (const op of Option.toArray(readOf(incarnation.actor.machine, name)))
        for (const { key, update } of Option.toArray(targetOf(value)))
          for (const text of Option.toArray(op.walk.keyText(pick(key, op.keyFields)))) {
            const at = entryKeyOf(op.contract, text);
            const entry = tx.world().entries.get(at);

            if (entry !== undefined)
              put(at, {
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

  return { layer, attemptEnded };
};
