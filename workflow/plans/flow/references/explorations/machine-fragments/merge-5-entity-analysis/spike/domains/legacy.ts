// @ts-nocheck: declarations as authors write them today, or get wrong. The lint flags them from types (the
// checker still computes types under @ts-nocheck); main.ts records them to show what recording alone does.
// Each builder is a function so that a construction error can be caught.
import { and, domain, eq, or, read, write } from "../flow.ts";
import type { Fields } from "../flow.ts";
import { myQueue, setLike, ticketList } from "./ops.ts";
import type { TicketRow } from "./ops.ts";
import { Issue } from "./issues.ts";
import { Ticket } from "./tickets.ts";

// merge-4-entities/proposal.md:125-128 as written: the function closes over the recording `input`.
export const legacyIssues = () => domain("legacy-issues", {
  setLike: write(setLike).one(Issue).predicts(({ input }) => Issue.patch(input.key, {
    liked: input.liked,
    likes: (i) => i.likes + (input.liked === i.liked ? 0 : input.liked ? 1 : -1),
  })),
});

export const legacyTickets = () => domain("legacy-tickets", {
  // `||` records its first operand: the list silently misses tickets assigned to input.assignee.
  either: read(ticketList)
    .list(Ticket, ({ result }) => result.tickets)
    .where(({ input, record }) => eq(record.status, "open") || eq(record.assignee, input.assignee)),
  // `?:` records one branch: the proxy is always truthy.
  status: read(ticketList)
    .list(Ticket, ({ result }) => result.tickets)
    .where(({ input, record }) => (input.status ? eq(record.status, input.status) : eq(record.status, "open"))),
  // `&&` records its second operand: the workspace constraint disappears.
  both: read(ticketList)
    .list(Ticket, ({ result }) => result.tickets)
    .where(({ input, record }) => eq(record.workspaceId, input.workspaceId) && eq(record.status, "open")),
  // Date.now() runs once, at construction, and is recorded as a constant.
  recent: read(myQueue)
    .list(Ticket, ({ result }) => result.tickets)
    .where(({ input, record }) => and(eq(record.workspaceId, input.workspaceId), or(eq(record.assignee, input.me)), eq(record.updatedAt, Date.now()))),
  // A helper with `?:`: the lint follows the recorded type into it.
  helped: read(ticketList)
    .list(Ticket, ({ result }) => result.tickets)
    .where(({ input, record }) => mineOrOpen(record, input.assignee)),
});
const mineOrOpen = (record: Fields<TicketRow>, me: Fields<{ assignee?: string }>["assignee"]) => (me ? eq(record.assignee, me) : eq(record.status, "open"));

// `?:` in a recorded field value.
export const legacyFlags = () => domain("legacy-flags", {
  setLike: write(setLike).one(Issue).predicts(({ input }) => Issue.patch(input.key, { liked: input.liked ? true : false })),
});
