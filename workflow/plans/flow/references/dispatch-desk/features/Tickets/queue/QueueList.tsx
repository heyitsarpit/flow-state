// The list body is the one place where every lane state renders differently, so it matches
// all of them with Effect's Match.valueTags; the rest reads memory and states.
import { Match, Schema } from "effect";
import { check } from "flow-state";
import { useActorByRef, useView } from "flow-state/react";
import { Ticket } from "../ticket.domain.js";
import { TicketStatus, type TicketKey } from "../types.js";
import { Queue } from "./queue.definition.js";
import { queueRef } from "./queue.ref.js";

const { S, E } = Queue;

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
      {reconnecting && <p role="status">Reconnecting to the queue…</p>}
      {notice && <p role="alert">{notice}</p>}
      <QueueBody queue={queue} onOpen={onOpen} />
    </section>
  );
}

function Toolbar({ queue }: { queue: QueueActor }) {
  const search = useView(queue, (s) => s.memory.search);
  const status = useView(queue, (s) => s.memory.status);
  const mineOnly = useView(queue, (s) => s.memory.mineOnly);
  const open = useView(queue, (s) => s.activities.open?.data);

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

function QueueBody({ queue, onOpen }: { queue: QueueActor; onOpen: (ticket: TicketKey) => void }) {
  const lane = useView(queue, (s) => s.activities.list);

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
  // once. pending is true while a predicted assignment or rename is unconfirmed.
  const ticket = useView(queue, (s) => Ticket.get(s, row, ["title", "status", "assignee"]));

  // Not open, or already predicted as assigned: the guard declines, so the button disables.
  const assignable = useView(
    queue,
    (s) => check(s, E.AssignToMe({ ticketId: row.ticketId }))._tag === "Allowed",
  );

  if (!ticket) return null;

  return (
    <li aria-busy={ticket.pending}>
      <button onClick={() => onOpen(row)}>{ticket.data.title}</button>
      <span className="badge">{ticket.data.status}</span>
      {ticket.data.assignee === null && (
        <button
          disabled={!assignable}
          onClick={() => queue.send(E.AssignToMe({ ticketId: row.ticketId }))}
        >
          Assign to me
        </button>
      )}
    </li>
  );
}

function RowsSkeleton() {
  return <ul aria-busy="true" className="skeleton" />;
}
