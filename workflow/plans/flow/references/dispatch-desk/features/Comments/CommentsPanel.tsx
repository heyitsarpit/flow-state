// The thread and the drafts waiting to join it. Host-agnostic: the editor and the queue's preview drawer both
// render it, so it takes the host's handle and the instance the trait is placed under (`"comments"` in the editor,
// `"preview"` in the queue). The panel names no host.
//
// What each piece reads (E9: three marks, shown three ways):
//   - the comment itself is the `Comment` record, `Comment.get(s, key)`: `predicted` ("edited, confirming"),
//     `uncertain` ("may not have saved"), `unconfirmed` ("checking"); the row is the store's, never memory;
//   - a draft is memory; whether it is on the wire, waiting in the FIFO or held is the post lane, read by the ticket
//     key (`Comments.O.post.get(s, ticket)`: one lane per ticket, its `outstanding` the posts behind the head);
//   - reaction counts are the plain resource's row, optimistic while a tap is on its way.
// design gap: `s.memory[instance]` and `s.operations[instance]` index by a prop. The design shows the path written
// out (`s.operations.<instance>.<name>`); a host-agnostic panel needs it as data (REVIEW gap 6).
// design gap: the host passes its own `E[instance]` (`Editor.E.comments`, `Queue.E.preview`) as `events`, since
// sending to a fragment goes through the host's namespace (rule 2) and the panel must not import a host (gap 7).
import { useActorByRef, useNow, useView } from "flow-state/react";
import type { CommentRow } from "./comments-api.js";
import { Comment } from "./comments.domain.js";
import type { Draft } from "./comments.trait.js";
import { Comments } from "./comments.trait.js";

type Host = ReturnType<typeof useActorByRef>;

type Ticket = { workspaceId: string; ticketId: string };

export type CommentsPanelProps = {
  host: Host;
  instance: "comments" | "preview";
  events: typeof Comments.E;
  ticket: Ticket;
};

export function CommentsPanel({ host, instance, events, ticket }: CommentsPanelProps) {
  const thread = useView(host, (s) => s.operations[instance]?.thread);
  const pinned = useView(
    host,
    (s) => s.operations[instance]?.pinned?.data?.flatMap((p) => p.comments) ?? [],
  );
  const drafts = useView(host, (s) => s.memory[instance]?.drafts ?? []);
  const notice = useView(host, (s) => s.memory[instance]?.notice ?? "");
  const lane = useView(host, (s) => Comments.O.post.get(s, ticket)); // { pending, uncertain, waiting, outstanding }
  const now = useNow("1 minute");
  const comments = thread?.data?.flatMap((page) => page.comments) ?? [];

  return (
    <section aria-label="Comments">
      {thread?._tag === "Failure" && (
        <p role="alert">
          Comments could not be loaded.{" "}
          <button onClick={() => host.send(events.Refresh())}>Try again</button>
        </p>
      )}
      {notice !== "" && <p role="status">{notice}</p>}
      {pinned.length > 0 && (
        <aside aria-label="Pinned">
          {pinned.map((row) => (
            <CommentLine
              key={row.commentId}
              host={host}
              instance={instance}
              events={events}
              row={row}
            />
          ))}
        </aside>
      )}
      {thread?.hasMore === true && ( // PROPOSED: `hasMore` on a paged read (gap 23)
        <button onClick={() => host.send(events.LoadOlder())}>Older comments</button>
      )}
      <ul>
        {comments.map((row) => (
          <CommentLine
            key={row.commentId}
            host={host}
            instance={instance}
            events={events}
            row={row}
          />
        ))}
        {drafts.map((draft) => (
          <DraftRow key={draft.clientId} host={host} events={events} draft={draft} />
        ))}
      </ul>
      {lane.outstanding > 0 && <p role="status">{lane.outstanding} more waiting to send</p>}
      <button onClick={() => host.send(events.MarkRead({ at: now }))}>Mark all read</button>
      <Composer host={host} events={events} />
    </section>
  );
}

// One comment, as the store has it. The reaction counts come from the plain resource, a separate row.
function CommentLine({
  host,
  instance,
  events,
  row,
}: {
  host: Host;
  instance: CommentsPanelProps["instance"];
  events: typeof Comments.E;
  row: CommentRow;
}) {
  const comment = useView(host, (s) =>
    Comment.get(s, row, Comment.pick("author", "text", "pinned", "editedAt")),
  );
  const reactions = useView(
    host,
    (s) => s.operations[instance]?.reactions?.data?.[row.commentId] ?? {},
  );

  if (comment.data === undefined) return null; // deleted, as a view sees it

  return (
    <li aria-busy={comment.predicted}>
      <b>{comment.data.author}</b> {comment.data.text}
      {comment.predicted && <em> edited, confirming</em>}
      {comment.uncertain && <em> may not have saved</em>}
      {comment.unconfirmed.length > 0 && <em> checking</em>}
      <button
        onClick={() =>
          host.send(events.Pin({ commentId: row.commentId, pinned: !comment.data.pinned }))
        }
      >
        {comment.data.pinned ? "Unpin" : "Pin"}
      </button>
      <button onClick={() => host.send(events.Delete({ commentId: row.commentId }))}>Delete</button>
      <button
        onClick={() => host.send(events.React({ commentId: row.commentId, emoji: "👍", on: true }))}
      >
        👍 {reactions["👍"] ?? 0}
      </button>
    </li>
  );
}

// A draft says where its post is: queued behind another, on the wire, held as "may not have saved", sent and
// waiting for the thread, or stuck. Only a held head offers Resend and Give up: nothing re-sends it by itself.
function DraftRow({
  host,
  events,
  draft,
}: {
  host: Host;
  events: typeof Comments.E;
  draft: Draft;
}) {
  return (
    <li>
      {draft.text} {draft.problem === null && !draft.sent && <em>Sending…</em>}
      {draft.sent && <em>Sent</em>}
      {draft.problem === "unsure" && (
        <>
          <em>May not have saved. Later comments wait for this one.</em>{" "}
          <button onClick={() => host.send(events.Resend({ clientId: draft.clientId }))}>
            Resend
          </button>
          <button onClick={() => host.send(events.GiveUp({ clientId: draft.clientId }))}>
            Give up
          </button>
        </>
      )}
      {draft.problem === "rejected" && <strong role="alert">{draft.reason}</strong>}
      {draft.problem === "notSent" && (
        <>
          <strong role="alert">Not sent.</strong>{" "}
          <button onClick={() => host.send(events.Resend({ clientId: draft.clientId }))}>
            Send again
          </button>
        </>
      )}
      {draft.problem === "gaveUp" && (
        <strong role="alert">Couldn't confirm it. It may still appear.</strong>
      )}
      {draft.problem === "ticketGone" && (
        <strong role="alert">This ticket no longer exists.</strong>
      )}
      {draft.problem !== null && draft.problem !== "unsure" && (
        <button onClick={() => host.send(events.Discard({ clientId: draft.clientId }))}>
          Discard
        </button>
      )}
    </li>
  );
}

function Composer({ host, events }: { host: Host; events: typeof Comments.E }) {
  return (
    <form
      onSubmit={(submit) => {
        submit.preventDefault();

        const field = submit.currentTarget.elements.namedItem("text") as HTMLInputElement;

        // The view mints the id: a key must exist before the commit (rule 39) and a turn has no source of
        // randomness (section 7 item 12). The trait's guard declines an empty text.
        host.send(events.Post({ clientId: crypto.randomUUID(), text: field.value }));
        field.value = "";
      }}
    >
      <input name="text" aria-label="Add a comment" />
      <button type="submit">Post</button>
    </form>
  );
}
