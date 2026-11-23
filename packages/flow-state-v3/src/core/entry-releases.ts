import { Duration, Option } from "effect";
import { Alarm } from "./alarms.ts";
import { RuntimeDefaults } from "./defaults.ts";
import { type Entry, type EntryKey, type Holder, Request } from "./entry-view.ts";
import type { Tx } from "./tx.ts";
import { type ActorId, type CallId, Command } from "./world.ts";

/**
 * The releasing calls of the entry table, the only writer of `releasing` and of the Release
 * alarms: a call told to stop is held until it ends, and its alarm comes due one disposal bound
 * after the release.
 */
export const makeEntryReleases = (
  tx: Tx,
  holdersOf: (key: EntryKey) => ReadonlyMap<string, Holder>,
  holderActor: (h: Holder) => Option.Option<ActorId>,
) => {
  /**
   * Release: the running call is told to stop and leaves the entry, which is Idle at once.
   */
  // RETURN_TYPE: the entry's own type, Idle after.
  const release = (key: EntryKey, entry: Entry): Entry =>
    Request.$match(entry.request, {
      Idle: () => entry,
      Running: ({ call }) => {
        tx.drop("callHome", call);
        tx.put("releasing", call, { entry: key, since: tx.env.now });
        tx.setAlarm(
          Alarm.Release({ call }),
          tx.env.now + Duration.toMillis(RuntimeDefaults.disposalBound),
        );
        tx.command(Command.Interrupt({ call }));

        return { ...entry, request: Request.Idle() };
      },
    });

  /**
   * A call ended: one that was released is dropped with its alarm. Returns whether it was.
   */
  const ended = (call: CallId) => {
    if (!tx.world().releasing.has(call)) return false;

    tx.drop("releasing", call);
    tx.clearAlarm(Alarm.Release({ call }));

    return true;
  };

  /**
   * A Release alarm came due: the call still runs past the disposal bound. Nothing is written;
   * returns the identities that hold its entry's key, whose snapshots now show it overdue.
   */
  const releaseDue = (call: CallId) =>
    Option.match(Option.fromUndefinedOr(tx.world().releasing.get(call)), {
      onNone: () => [],
      onSome: ({ entry }) =>
        [...holdersOf(entry).values()].flatMap((h) => Option.toArray(holderActor(h))),
    });

  return { release, ended, releaseDue };
};
