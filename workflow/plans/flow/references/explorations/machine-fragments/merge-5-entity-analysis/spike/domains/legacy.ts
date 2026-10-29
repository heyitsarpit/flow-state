// @ts-nocheck: declarations as authors write them today, or get wrong. The source reader lints them;
// main.ts records them to show what recording alone would do. Each builder is a function so that a
// construction error can be caught.
import { and, domain, entity, eq, opaque, or, read, write } from "../flow.ts";
import { issuesInProject, myQueue, react, setLike, ticketList } from "./ops.ts";
import { addReaction, Message } from "./extras.ts";
import { Issue } from "./issues.ts";
import { Ticket } from "./tickets.ts";

// merge-4-entities/proposal.md:125-128 as written.
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
});

export const legacyChat = () => domain("legacy-chat", {
  // The opaque function closes over the recording proxy `input` instead of declaring it.
  react: write(react).one(Message).predicts(({ input }) => Message.patch(input.key, {
    reactions: (m) => opaque([m.reactions], (rs) => addReaction(rs, input.emoji)),
  })),
});

// `?:` in a predicted value (no arithmetic, so this is the `?:` finding alone).
export const legacyFlags = () => domain("legacy-flags", {
  setLike: write(setLike).one(Issue).predicts(({ input }) => Issue.patch(input.key, { liked: input.liked ? true : false })),
});

// A factory: correct at runtime, but not a literal declaration, so the reader reports it unreadable.
export const makeIssues = (id) => domain(id, {
  list: read(issuesInProject).list(Issue, ({ result }) => result.issues).where(({ input, record }) => eq(record.projectId, input.projectId)),
});
