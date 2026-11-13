// The activity list, the connection badge and the "may be missing" notice. 6):
// the badge reads the activity operation's row, `connection` and `drop`, which exist on every phase.
import { useActorByRef, useView } from "flow-state/react"; // existing
import { DeskFeed } from "./feed.definition.js";
import { feedRef } from "./feed.ref.js";

const { E } = DeskFeed;

export function ActivityLog({ workspaceId }: { workspaceId: string }) {
  const feed = useActorByRef(feedRef(workspaceId), { input: { workspaceId } });
  const entries = useView(feed, (s) => s.memory.activity);
  const notice = useView(feed, (s) => s.memory.notice);
  const row = useView(feed, (s) => s.operations.activity); // the stream row; undefined while the feed is not placed

  // `connection` is Live or Connecting on a placed row; `drop` tells a
  // first "Connecting..." from a "Reconnecting" after the socket went away.
  const signedOut = useView(feed, (s) => DeskFeed.S.SIGNED_OUT.is(s));

  const badge = signedOut
    ? "Signed out"
    : row === undefined
      ? "Retrying soon" // RETRY_WAIT: the feed is not placed
      : row.connection === "Live"
        ? "Live"
        : row.drop
          ? `Reconnecting (${row.drop.why})`
          : "Connecting";

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
