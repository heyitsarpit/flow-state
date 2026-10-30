// The thread and the drafts waiting to join it. Host-agnostic: the editor and the queue's preview drawer
// both render it, so it takes the host's handle and the instance the trait is placed under (`"comments"` in
// the editor, `"preview"` in the queue). The panel names no host. It reads the thread from the fragment's
// read row, drafts from its memory, and each draft's progress from the write lane with
// `Comments.O.post.get(s, draft)` (rule 50: `Fragment.O` reads a lane at any depth, so it needs no instance).
// design gap: `s.memory[instance]` and `s.operations[instance]` index by a prop. The design shows the path
// written out (`s.operations.<instance>.<name>`); a host-agnostic panel needs it as data.
// design gap: the host passes its own `E[instance]` (`Editor.E.comments`, `Queue.E.preview`) as `events`,
// since sending to a fragment goes through the host's namespace (rule 2) and the panel must not import a host.
import { useActorByRef, useView } from "flow-state/react";
import type { Draft } from "./comments.trait.js";
import { Comments } from "./comments.trait.js";

type Host = ReturnType<typeof useActorByRef>;

export type CommentsPanelProps = {
  host: Host;
  instance: "comments" | "preview";
  events: typeof Comments.E;
};

export function CommentsPanel({ host, instance, events }: CommentsPanelProps) {
  const thread = useView(host, (s) => s.operations[instance]?.thread);
  const drafts = useView(host, (s) => s.memory[instance]?.drafts ?? []);
  const comments = thread?.data ?? [];

  return (
    <section aria-label="Comments">
      {thread?._tag === "Failure" && (
        <p role="alert">
          Comments could not be loaded.{" "}
          <button onClick={() => host.send(events.Refresh())}>Try again</button>
        </p>
      )}
      <ul>
        {comments.map((comment) => (
          <li key={comment.id}>
            <b>{comment.author}</b> {comment.text}
          </li>
        ))}
        {drafts.map((draft) => (
          <DraftRow key={draft.clientId} host={host} events={events} draft={draft} />
        ))}
      </ul>
      <Composer host={host} events={events} />
    </section>
  );
}

// A draft says where its post is: on the wire, unconfirmed, sent and waiting for the thread, or stuck.
function DraftRow({
  host,
  events,
  draft,
}: {
  host: Host;
  events: typeof Comments.E;
  draft: Draft;
}) {
  const lane = useView(host, (s) => Comments.O.post.get(s, draft)); // { pending, uncertain, waiting, retryCount }

  return (
    <li aria-busy={lane.pending}>
      {draft.text} {draft.problem === null && lane.pending && <em>Sending…</em>}
      {draft.problem === null && lane.uncertain && (
        <em>
          Not sure it arrived. Trying again
          {lane.retryCount > 0 ? ` (${String(lane.retryCount)})` : ""}…
        </em>
      )}
      {draft.sent && <em>Sent</em>}
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
      {draft.problem !== null && (
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
