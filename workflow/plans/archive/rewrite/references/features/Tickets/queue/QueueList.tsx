// Queue UI. The list body is the one place where every resource lane renders differently,
// so it matches all of them; the rest of the page reads machine states and memory.
import { Match, Schema } from "effect";
import type { ActorRef } from "flow-state";
import { useActorByRef, useView } from "flow-state/react";
import { TicketStatus, type Ticket, type TicketPage } from "../types.js";
import { Queue } from "./queue.definition.js";
import { listInput, type QueueMachine } from "./queue.machine.js";

const { E } = Queue;

export function QueueList({
  queueRef,
  onOpen,
}: {
  queueRef: ActorRef<typeof QueueMachine>;
  onOpen: (ticket: Ticket) => void;
}) {
  const queue = useActorByRef(queueRef);

  const view = useView(queue, (snapshot) => ({
    search: snapshot.memory.search,
    status: snapshot.memory.status,
    mineOnly: snapshot.memory.mineOnly,
    page: snapshot.memory.page,
    reconnecting: Queue.S.DEGRADED.is(snapshot),
    // The same function the machine subscribes with, so the view reads exactly that entry.
    list: snapshot.O.ticketList.getState(listInput(snapshot)),
  }));

  return (
    <section aria-label="Ticket queue">
      <Toolbar>
        <input
          type="search"
          placeholder="Search tickets"
          value={view.search}
          onChange={(event) => queue.send(E.SearchChanged({ search: event.target.value }))}
        />
        <StatusFilter
          value={view.status}
          onChange={(status) => queue.send(E.StatusChanged({ status }))}
        />
        <label>
          <input
            type="checkbox"
            checked={view.mineOnly}
            onChange={() => queue.send(E.MineOnlyToggled())}
          />
          Assigned to me
        </label>
      </Toolbar>

      {view.reconnecting && <p role="status">Reconnecting to the queue…</p>}

      {Match.valueTags(view.list, {
        Missing: () => <RowsSkeleton />,
        Pending: () => <RowsSkeleton />,
        Ready: ({ data }) => <TicketRows page={data} onOpen={onOpen} />,
        Refreshing: ({ data }) => <TicketRows page={data} onOpen={onOpen} refreshing />,
        Failure: ({ data, error }) =>
          data ? (
            <TicketRows page={data} onOpen={onOpen} stale />
          ) : (
            <p role="alert">The queue is unavailable. Retrying in {error.retryAfter}s.</p>
          ),
        Defect: () => <p role="alert">Something went wrong loading the queue.</p>,
        Interrupted: ({ data }) =>
          data ? <TicketRows page={data} onOpen={onOpen} /> : <RowsSkeleton />,
      })}

      <Pager page={view.page} onChange={(page) => queue.send(E.PageChanged({ page }))} />
    </section>
  );
}

function TicketRows({
  page,
  onOpen,
  refreshing = false,
  stale = false,
}: {
  page: TicketPage;
  onOpen: (ticket: Ticket) => void;
  refreshing?: boolean;
  stale?: boolean;
}) {
  if (page.tickets.length === 0) return <p>No tickets match these filters.</p>;

  return (
    <>
      {(refreshing || stale) && (
        <p className="muted">{refreshing ? "Updating…" : "Showing cached results"}</p>
      )}
      <ul>
        {page.tickets.map((ticket) => (
          <li key={ticket.ticketId}>
            <button onClick={() => onOpen(ticket)}>{ticket.title}</button>
            <span className="badge">{ticket.status}</span>
          </li>
        ))}
      </ul>
      <p className="muted">{page.total} tickets</p>
    </>
  );
}

function StatusFilter({
  value,
  onChange,
}: {
  value: TicketStatus | null;
  onChange: (status: TicketStatus | null) => void;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(event) => {
        const status = event.target.value;

        onChange(Schema.is(TicketStatus)(status) ? status : null);
      }}
    >
      <option value="">All</option>
      <option value="open">Open</option>
      <option value="assigned">Assigned</option>
      <option value="closed">Closed</option>
    </select>
  );
}

function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="toolbar">{children}</div>;
}

function RowsSkeleton() {
  return <ul aria-busy="true" className="skeleton" />;
}

function Pager({ page, onChange }: { page: number; onChange: (page: number) => void }) {
  return (
    <nav aria-label="Pages">
      <button disabled={page === 0} onClick={() => onChange(page - 1)}>
        Previous
      </button>
      <button onClick={() => onChange(page + 1)}>Next</button>
    </nav>
  );
}
