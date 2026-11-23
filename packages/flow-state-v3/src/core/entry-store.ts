import { Option, Schema } from "effect";
import { Alarm } from "./alarms.ts";
import { Operation, type SavedCodec } from "./compiled.ts";
import { type Entry, entryKeyOf, Request } from "./entry-view.ts";
import type { Persistence } from "./persist.ts";
import { entryRecordKey, parseEntryKey } from "./record-key.ts";
import { entryOfText, entryText } from "./record-shape.ts";
import { pick, type Tx } from "./tx.ts";

/**
 * The entry store: a persisted read's saved entry mirrors its entry's data, written when data
 * lands or is written, deleted when it is cleared or collected, kept when the Runtime ends, and
 * installed at boot.
 *
 * **Details**
 *
 * The saved entry is one record kind, `entry/<contract>|<key text>`, whose Shape (`EntryRecord`)
 * the writer encodes and the boot decodes. A read not saved on the device writes nothing.
 */
// A read's saved codec, called through its slots.
const codecOf = (saved: Option.Option.Value<Extract<Operation, { _tag: "Read" }>["saved"]>) =>
  ({
    encode: (data) => saved.encode.run(data),
    decode: (json) => saved.decode.run(json),
  }) satisfies SavedCodec;

export const makeEntryStore = (tx: Tx, persistence: Persistence) => {
  // The read an entry is the request of, when it is saved on the device.
  const savedReadOf = (entry: Entry) =>
    Option.flatMap(
      Option.filter(
        Option.fromUndefinedOr(
          tx.machines.get(entry.read.machine)?.operations.get(entry.read.operation),
        ),
        Operation.$is("Read"),
      ),
      (read) => Option.map(read.saved, (codec) => ({ read, codec: codecOf(codec) })),
    );

  const recordKeyOf = (entry: Entry, read: Operation) =>
    Option.map(read.walk.keyText(pick(entry.key, read.keyFields)), (text) =>
      entryRecordKey(entry.contract, text),
    );

  /**
   * An entry changed: when its data did, its saved entry is written again, or deleted with none.
   */
  const changed = (before: Option.Option<Entry>, after: Entry) => {
    if (Option.exists(before, (b) => b.data === after.data)) return;

    for (const { read, codec } of Option.toArray(savedReadOf(after)))
      for (const key of Option.toArray(recordKeyOf(after, read)))
        persistence.saveEntry(
          key,
          Option.flatMap(after.data, (d) => entryText(codec, d.value, d.at)),
        );
  };

  /**
   * An entry was removed by its last hold's collection: its saved entry goes with it.
   */
  const removed = (entry: Entry) => {
    for (const { read } of Option.toArray(savedReadOf(entry)))
      for (const key of Option.toArray(recordKeyOf(entry, read)))
        persistence.saveEntry(key, Option.none());
  };

  // A saved entry's read: the one Read of its contract the build saves on the device.
  const readOfContract = (contract: string) =>
    Option.fromUndefinedOr(
      [...tx.machines.values()]
        .flatMap((compiled) =>
          [...compiled.operations.values()].map((op) => ({ machine: compiled.id, op })),
        )
        .find(
          ({ op }) =>
            Operation.$is("Read")(op) && op.contract === contract && Option.isSome(op.saved),
        ),
    );

  // One saved entry installed: an unheld Idle entry whose data is never fresh, collected after
  // its `gcTime`; one too old, undecodable, or of no saved read is deleted, with no issue.
  const installOne = (stored: string, text: string) => {
    const installed = Option.flatMap(parseEntryKey(stored), ({ contract, text: keyText }) =>
      Option.flatMap(readOfContract(contract), ({ machine, op }) => {
        if (!Operation.$is("Read")(op)) return Option.none();

        return Option.flatMap(Option.map(op.saved, codecOf), (codec) =>
          Option.flatMap(
            Option.filter(entryOfText(codec, text), ({ at }) => tx.env.now - at < op.gcTime),
            ({ data, at }) =>
              Option.map(Schema.decodeUnknownOption(op.key)(keyText), (key) => ({
                machine,
                op,
                key,
                data,
                at,
                entry: entryKeyOf(contract, keyText),
              })),
          ),
        );
      }),
    );

    Option.match(installed, {
      onNone: () => persistence.saveEntry(stored, Option.none()),
      onSome: ({ machine, op, key, data, at, entry }) => {
        tx.put("entries", entry, {
          contract: op.contract,
          key,
          read: { machine, operation: op.name },
          data: Option.some({ value: data, at, asked: Option.none() }),
          staleAt: 0,
          request: Request.Idle(),
          last: Option.none(),
          unheldSince: Option.some(tx.env.now),
          layers: [],
        } satisfies Entry);
        tx.setAlarm(Alarm.Collect({ entry }), tx.env.now + op.gcTime);
      },
    });
  };

  /**
   * The boot's saved entries: each installed, or deleted when it cannot be.
   */
  const install = (stored: ReadonlyMap<string, string>) => {
    for (const [key, text] of stored) if (Option.isSome(parseEntryKey(key))) installOne(key, text);
  };

  return { changed, removed, install };
};

/**
 * The entry store's functions on one step.
 */
export type EntryStore = ReturnType<typeof makeEntryStore>;

/**
 * Whether a stored key is a saved entry's, which the boot installs apart from identities' records.
 */
export const isEntryKey = (key: string) => Option.isSome(parseEntryKey(key));
