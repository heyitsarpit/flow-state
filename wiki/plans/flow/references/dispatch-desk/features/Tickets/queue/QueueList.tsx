// The list body is the one place where every lane state renders differently, so it matches
// all of them with Effect's Match.valueTags; the rest reads memory and states. A row's fields come from
// the record (coherent with the editor), its "Assigning…" or "?" from its own assign lane, and the
// preview drawer is the Comments panel on the queue's `preview` placement.
import { Match, Schema } from "effect";
import { check } from "flow-state";
import { useActorByRef, useNow, useView } from "flow-state/react";
import { CommentsPanel } from "../../Comments/CommentsPanel.js";
import { Technician } from "../../Roster/roster.domain.js";
import { SessionRef } from "../../Session/session.ref.js";
import { Editor } from "../editor/editor.definition.js";
import { editorRef } from "../editor/editor.ref.js";
import { Ticket } from "../ticket.domain.js";
import { TicketStatus, type TicketKey } from "../types.js";
import { Queue } from "./queue.definition.js";
import { queueRef } from "./queue.ref.js";
import { AssignToggle } from "./assign-toggle.trait.js";

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
      <BulkBar queue={queue} />
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

// One row. Every piece reads its own store (E9): the record (`predicted` italic, `uncertain` "?", `unconfirmed`
// "checking"), the row copy's own lane (`AssignToggle.O.set.get`: on the wire, waiting behind an unsure one), the
// assignee's own record for the name (E1), the SDK's viewers for this ticket (`Queue.O.viewers.get`), the SLA from
// the record's `dueAt` and `useNow` ("breaches in 12 min", S4), and a flash copy while another dispatcher's change
// is fresh (F5).
function TicketRowItem({
  queue,
  row,
  onOpen,
}: {
  queue: QueueActor;
  row: TicketKey;
  onOpen: (ticket: TicketKey) => void;
}) {
  const ticket = useView(queue, (s) =>
    Ticket.get(s, row, Ticket.pick("title", "status", "assignee", "priority", "dueAt")),
  );
  const assign = useView(queue, (s) => AssignToggle.O.set.get(s, row));
  const assignee = useView(queue, (s) => {
    const id = Ticket.get(s, row, Ticket.pick("assignee")).data?.assignee;

    return id?.startsWith("tech-")
      ? Technician.get(
          s,
          { workspaceId: row.workspaceId, technicianId: id },
          Technician.pick("name"),
        ).data?.name
      : id;
  });
  const viewers = useView(queue, (s) => Object.keys(O.viewers.get(s, row)?.value ?? {}).length);
  const flashing = useView(queue, (s) =>
    s.memory.flashes.some((copy) => copy.key === row.ticketId),
  );
  const selected = useView(queue, (s) => s.memory.selected.includes(row.ticketId));
  const me = useView(useActorByRef(SessionRef, {}), (s) => s.memory.userId);
  const now = useNow("1 minute");

  if (ticket.data === undefined) return null;

  const dueIn = ticket.data.dueAt === null ? null : Math.round((ticket.data.dueAt - now) / 60_000);
  const mine = ticket.data.assignee === me;

  return (
    <li aria-busy={assign.pending} className={flashing ? "flash" : undefined}>
      <input
        type="checkbox"
        aria-label="Select"
        checked={selected}
        onChange={() => queue.send(E.Select({ ticketId: row.ticketId, selected: !selected }))}
      />
      <button
        onClick={() => onOpen(row)}
        style={{ fontStyle: ticket.predicted ? "italic" : undefined }}
      >
        {ticket.data.title}
      </button>
      <span className="badge">{ticket.data.status}</span>
      {ticket.uncertain && (
        <span title="We are checking whether a change to this ticket went through">?</span>
      )}
      {ticket.unconfirmed.length > 0 && <em>checking</em>}
      {assignee !== undefined && assignee !== null && <span>{assignee}</span>}
      {dueIn !== null && dueIn > 0 && <span className="muted">breaches in {dueIn} min</span>}
      {dueIn !== null && dueIn <= 0 && <strong>overdue</strong>}
      {/* The toggle is the row's own copy: a burst of taps is its business (`latest`), never refused. */}
      <button
        onClick={() =>
          queue.send(E.toggles.key(row.ticketId).Toggle({ assignee: mine ? null : me }))
        }
      >
        {mine ? "Release" : "Assign to me"}
      </button>
      {assign.waiting && <span role="status">Waiting for the last change…</span>}
      {viewers > 0 && <span className="badge">{viewers} viewing</span>}
      <button onClick={() => queue.send(E.PreviewOpened({ ticketId: row.ticketId }))}>
        Preview
      </button>
      <ReplyButton ticket={row} />
    </li>
  );
}

// "Reply": send a comment into the ticket's EDITOR actor, through its placed Comments trait (F23). The queue's own
// preview is a different placement; replying from the row writes to the thread the editor shows.
// design gap: sending into another actor's fragment (REVIEW gap 3): the editor's ref and its `E.comments` path.
function ReplyButton({ ticket }: { ticket: TicketKey }) {
  const editor = useActorByRef(editorRef(ticket), { input: ticket });

  return (
    <button
      onClick={() =>
        editor.send(Editor.E.comments.Post({ clientId: crypto.randomUUID(), text: "On it" }))
      }
    >
      Reply "On it"
    </button>
  );
}

// Bulk close: one write on the workspace's FIFO; "2 more waiting" while earlier ones are on their way.
function BulkBar({ queue }: { queue: QueueActor }) {
  const selected = useView(queue, (s) => s.memory.selected.length);
  const lane = useView(queue, (s) => O.bulkClose.get(s, { workspaceId: s.memory.workspaceId }));

  return (
    <div className="bulk">
      <button disabled={selected === 0} onClick={() => queue.send(E.CloseSelected())}>
        Close {selected} selected
      </button>
      {lane.pending && <span role="status">Closing…</span>}
      {lane.outstanding > 0 && <span role="status">{lane.outstanding} more waiting</span>}
      {lane.uncertain && <span role="status">Checking whether that went through…</span>}
    </div>
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
