// The list body is the one place where every lane state renders differently, so it matches
// all of them with Effect's Match.valueTags; the rest reads memory and states. A row's fields come from
// the record (coherent with the editor), its "Assigning…" or "?" from its own assign lane, and the
// preview drawer is the Comments panel on the queue's `preview` placement.
import { Match, Schema } from "effect";
import { check } from "flow-state";
import { useActorByRef, useView } from "flow-state/react";
import { CommentsPanel } from "../../Comments/CommentsPanel.js";
import { Viewers } from "../../Presence/Viewers.js";
import { Ticket } from "../ticket.domain.js";
import { TicketStatus, type TicketKey } from "../types.js";
import { Queue } from "./queue.definition.js";
import { queueRef } from "./queue.ref.js";

const { S, E, O } = Queue;

type QueueActor = ReturnType<typeof useQueue>;

function useQueue(workspaceId: string) {
  return useActorByRef(queueRef(workspaceId), { input: { workspaceId } });
}

export function QueueList({
  workspaceId,
  onOpen,
}: {
  workspaceId: string;
  onOpen: (ticket: TicketKey) => void;
}) {
  const queue = useQueue(workspaceId);
  const reconnecting = useView(queue, (s) => S.DEGRADED.is(s));
  const notice = useView(queue, (s) => s.memory.notice);

  return (
    <section aria-label="Ticket queue">
      <Toolbar queue={queue} />
      <Tabs queue={queue} />
      <Drafts queue={queue} />
      {reconnecting && <p role="status">Reconnecting to the queue…</p>}
      {notice && <p role="alert">{notice}</p>}
      <QueueBody queue={queue} onOpen={onOpen} />
      <PreviewDrawer queue={queue} />
    </section>
  );
}

function Toolbar({ queue }: { queue: QueueActor }) {
  const search = useView(queue, (s) => s.memory.search);
  const status = useView(queue, (s) => s.memory.status);
  const mineOnly = useView(queue, (s) => s.memory.mineOnly);
  const open = useView(queue, (s) => s.operations.open?.data);

  return (
    <div className="toolbar">
      <input
        type="search"
        value={search}
        placeholder="Search tickets"
        onChange={(event) => queue.send(E.SearchChanged({ search: event.target.value }))}
      />
      <select
        value={status ?? ""}
        onChange={(event) => {
          const value = event.target.value;
          queue.send(E.StatusChanged({ status: Schema.is(TicketStatus)(value) ? value : null }));
        }}
      >
        <option value="">All</option>
        <option value="open">Open</option>
        <option value="assigned">Assigned</option>
        <option value="closed">Closed</option>
      </select>
      <label>
        <input
          type="checkbox"
          checked={mineOnly}
          onChange={() => queue.send(E.MineOnlyToggled())}
        />
        Assigned to me
      </label>
      {open !== undefined && <span className="badge">{open} open</span>}
    </div>
  );
}

// The three lists. "Unassigned" and "Triage" are separate domain reads, placed only while chosen; an assignment
// moves a row out of "Unassigned" the moment it is predicted (E4).
function Tabs({ queue }: { queue: QueueActor }) {
  const tab = useView(queue, (s) => s.memory.tab);
  const mentions = useView(queue, (s) => s.operations.mentions?.data?.length ?? 0);

  return (
    <nav className="tabs">
      {(["all", "unassigned", "triage"] as const).map((name) => (
        <button
          key={name}
          aria-pressed={tab === name}
          onClick={() => queue.send(E.TabChosen({ tab: name }))}
        >
          {name}
        </button>
      ))}
      {mentions > 0 && <span className="badge">@ you: {mentions}</span>}
    </nav>
  );
}

// New tickets on their way: shown apart from the rows until a list holds the server's id (rule 33).
function Drafts({ queue }: { queue: QueueActor }) {
  const drafts = useView(queue, (s) => {
    const ids = new Set(
      s.operations.list?.data?.flatMap((page) => page.tickets.map((t) => t.ticketId)) ?? [],
    );

    return s.memory.creating.filter((d) => d.id === null || !ids.has(d.id));
  });

  return (
    <ul aria-label="New tickets">
      {drafts.map((d) => (
        <li key={d.draftId} aria-busy={d.status === "sending"}>
          {d.title} {d.status === "sending" && <em>Creating…</em>}
          {d.status === "unsure" && <em>May have been created</em>}
          {d.status === "failed" && (
            <>
              <strong role="alert">{d.failure}</strong>
              <button onClick={() => queue.send(E.RetryCreate({ draftId: d.draftId }))}>
                Try again
              </button>
              <button onClick={() => queue.send(E.DiscardDraft({ draftId: d.draftId }))}>
                Discard
              </button>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

function QueueBody({ queue, onOpen }: { queue: QueueActor; onOpen: (ticket: TicketKey) => void }) {
  const lane = useView(queue, (s) => s.operations.list);

  if (lane === undefined) return <RowsSkeleton />;

  // A paged lane's data is its loaded pages, in order (the lane's hasMore says whether a next
  // page exists; LoadMore's guard reads it, so the button asks check rather than the lane).
  return Match.valueTags(lane, {
    Pending: ({ data, placeholder }) =>
      data && placeholder ? (
        <Rows queue={queue} pages={data} onOpen={onOpen} dimmed />
      ) : (
        <RowsSkeleton />
      ),
    Ready: ({ data, stale }) => (
      <Rows queue={queue} pages={data} onOpen={onOpen} dimmed={stale !== false} />
    ),
    Refreshing: ({ data }) => <Rows queue={queue} pages={data} onOpen={onOpen} />,
    Failure: ({ data, error }) =>
      data ? (
        <Rows queue={queue} pages={data} onOpen={onOpen} dimmed />
      ) : (
        <p role="alert">The queue is unavailable. Retrying in {error.retryAfter}s.</p>
      ),
    Defect: () => <p role="alert">Something went wrong loading the queue.</p>,
    Interrupted: ({ data }) =>
      data ? <Rows queue={queue} pages={data} onOpen={onOpen} /> : <RowsSkeleton />,
  });
}

function Rows({
  queue,
  pages,
  dimmed = false,
  onOpen,
}: {
  queue: QueueActor;
  pages: ReadonlyArray<{ tickets: ReadonlyArray<TicketKey> }>;
  dimmed?: boolean;
  onOpen: (ticket: TicketKey) => void;
}) {
  const rows = pages.flatMap((page) => page.tickets);
  const loadMore = useView(queue, (s) => check(s, E.LoadMore())._tag === "Allowed");

  if (rows.length === 0) return <p>No tickets match these filters.</p>;

  return (
    <>
      <ul className={dimmed ? "muted" : undefined}>
        {rows.map((row) => (
          <TicketRowItem key={row.ticketId} queue={queue} row={row} onOpen={onOpen} />
        ))}
      </ul>
      <p className="muted">{rows.length} shown</p>
      {loadMore && <button onClick={() => queue.send(E.LoadMore())}>Load more</button>}
    </>
  );
}

function TicketRowItem({
  queue,
  row,
  onOpen,
}: {
  queue: QueueActor;
  row: TicketKey;
  onOpen: (ticket: TicketKey) => void;
}) {
  // The record store's copy, coherent with the editor's: a rename in the editor shows here at
  // once. `predicted` is true while an assignment or rename is unconfirmed.
  const ticket = useView(queue, (s) =>
    Ticket.get(s, row, Ticket.pick("title", "status", "assignee")),
  );

  // This ticket's own lane: the row passes itself, a value carrying the key's fields (OD4).
  const assign = useView(queue, (s) => O.assign.get(s, row));

  // Not open, already predicted as assigned, or this ticket's lane busy: the guards decline, so the
  // button disables. Another row's assignment does not affect it.
  const assignable = useView(
    queue,
    (s) => check(s, E.AssignToMe({ ticketId: row.ticketId }))._tag === "Allowed",
  );

  if (ticket.data === undefined) return null;

  return (
    <li aria-busy={ticket.predicted || assign.pending}>
      <button onClick={() => onOpen(row)}>{ticket.data.title}</button>
      <span className="badge">{ticket.data.status}</span>
      {assign.pending && <span role="status">Assigning…</span>}
      {assign.uncertain && (
        <span role="status" title="We are checking whether this assignment went through">
          ?
        </span>
      )}
      {ticket.data.assignee === null && !assign.pending && !assign.uncertain && (
        <button
          disabled={!assignable}
          onClick={() => queue.send(E.AssignToMe({ ticketId: row.ticketId }))}
        >
          Assign to me
        </button>
      )}
      <button onClick={() => queue.send(E.PreviewOpened({ ticketId: row.ticketId }))}>
        Preview
      </button>
      <Viewers ticket={row} /> {/* pending merge 6 */}
    </li>
  );
}

// The comments of the previewed ticket. While `previewId` is null the drawer is hidden; the trait still
// lives, and its thread read is off.
function PreviewDrawer({ queue }: { queue: QueueActor }) {
  const previewId = useView(queue, (s) => s.memory.previewId);
  const title = useView(queue, (s) =>
    s.memory.previewId === null
      ? undefined
      : Ticket.get(
          s,
          { workspaceId: s.memory.workspaceId, ticketId: s.memory.previewId },
          Ticket.pick("title"),
        ).data?.title,
  );

  if (previewId === null) return null;

  return (
    <aside aria-label="Ticket preview">
      <h3>{title ?? previewId}</h3>
      <button onClick={() => queue.send(E.PreviewClosed())}>Close</button>
      <CommentsPanel
        host={queue}
        instance="preview"
        events={E.preview}
        ticket={{ workspaceId: queue.getSnapshot().memory.workspaceId, ticketId: previewId }}
      />
    </aside>
  );
}

function RowsSkeleton() {
  return <ul aria-busy="true" className="skeleton" />;
}
