// The activity list, the connection badge and the "may be missing" notice. Pending merge 6 (M6 2.6):
// the badge reads the activity operation's row, `connection` and `drop`, which exist on every phase.
import { useActorByRef, useView } from "flow-state/react"; // existing
import { DeskFeed } from "./feed.definition.js";
import { feedRef } from "./feed.ref.js";

const { E } = DeskFeed;

export function ActivityLog({ workspaceId }: { workspaceId: string }) {
  const feed = useActorByRef(feedRef(workspaceId), { input: { workspaceId } });
  const entries = useView(feed, (s) => s.memory.activity);
  const notice = useView(feed, (s) => s.memory.notice);
  const row = useView(feed, (s) => s.operations.activity); // pending merge 6: the stream row; undefined while the feed is not placed

  // pending merge 6: `connection` type-checks on an undefined, connecting or ended row; `drop` tells a
  // first "Connecting..." from a "Reconnecting" after the socket went away.
  const badge =
    row === undefined
      ? "Retrying soon"
      : row.connection === "Live"
        ? "Live"
        : row.connection === "Connecting"
          ? row.drop
            ? `Reconnecting (${row.drop.why})`
            : "Connecting"
          : "Offline";

  return (
    <section aria-label="Activity">
      <h2>
        Activity <small role="status">{badge}</small>
      </h2>
      {notice && (
        <p role="alert">
          {notice} <button onClick={() => feed.send(E.DismissNotice())}>Dismiss</button>
        </p>
      )}
      <ol>
        {[...entries].reverse().map((entry) => (
          <li key={entry.id}>
            {entry.text} <time>{new Date(entry.at).toLocaleTimeString()}</time>
          </li>
        ))}
      </ol>
    </section>
  );
}
