// Operation stand-ins: ids and types only. Ids and shapes follow dispatch-desk's ticket.operations.ts and
// types.ts, and merge 4's issues.operations.ts (merged/entities.md:109-117). IssueRow is not shown
// in merge 4; its fields are read off the Issues domain and the view there.
import { op } from "../flow.ts";

export type TicketStatus = "open" | "assigned" | "closed";
export type TicketRow = {
  workspaceId: string; ticketId: string; title: string; status: TicketStatus;
  assignee: string | null; updatedAt: number; revision: number;
};
export type TicketKey = { workspaceId: string; ticketId: string };
export type TicketListInput = { workspaceId: string; status?: TicketStatus; assignee?: string; search?: string; page?: number };
export type TicketPage = { tickets: readonly TicketRow[]; nextPage?: number };
export type TicketEvent =
  | { _tag: "TicketSaved"; ticket: TicketRow }
  | { _tag: "TicketRemoved"; workspaceId: string; ticketId: string; revision: number };

export const ticketById = op<TicketKey, TicketRow>()("DispatchDesk/ticket-by-id");
export const ticketList = op<TicketListInput, TicketPage>()("DispatchDesk/ticket-list");
export const openCount = op<{ workspaceId: string }, { count: number }>()("DispatchDesk/open-count");
export const saveTitle = op<TicketKey & { title: string }, TicketRow>()("DispatchDesk/save-title");
export const assignTicket = op<TicketKey & { assignee: string }, TicketRow>()("DispatchDesk/assign-ticket");
export const ticketEvents = op<{ workspaceId: string }, TicketEvent>()("DispatchDesk/ticket-events");

export type IssueRow = { id: string; projectId: string; number: number; title: string; liked: boolean; likes: number };
export type IssueKey = { id: string };
export const issuesInProject = op<{ projectId: string }, { issues: readonly IssueRow[] }>()("issues/in-project");
export const setLike = op<{ key: IssueKey; liked: boolean }, IssueRow>()("issues/set-like");
export const renameIssue = op<{ key: IssueKey; title: string }, IssueRow>()("issues/rename");
export const removeIssue = op<{ key: IssueKey }, {}>()("issues/remove");
export const createIssue = op<{ draftId: string; projectId: string; title: string }, IssueRow>()("issues/create");

// Spike-only extras (entity-domain-examples.md:95-101 and :50-55, and two condition shapes no reference uses).
export type AccountRow = { accountId: string; balance: number; revision: number };
export type Reaction = { emoji: string; count: number };
export type MessageRow = { messageId: string; body: string; reactions: readonly Reaction[] };
export const transfer = op<{ from: { accountId: string }; to: { accountId: string }; amount: number }, {}>()("bank/transfer");
export const react = op<{ key: { messageId: string }; emoji: string }, MessageRow>()("chat/react");
export const myQueue = op<{ workspaceId: string; me: string; before: number }, TicketPage>()("DispatchDesk/my-queue");

// Dates and bulk writes (entity-domain-examples.md's calendar and admin shapes, reduced).
export type OccurrenceRow = { occurrenceId: string; calendarId: string; title: string; startsAt: Date; endsAt: Date | null };
export const occurrencesIn = op<{ calendarId: string; from?: Date; to?: Date }, { items: readonly OccurrenceRow[] }>()("cal/occurrences");
export const startingBetween = op<{ calendarId: string; from?: Date; to?: Date }, { items: readonly OccurrenceRow[] }>()("cal/starting-between");
export const moveOccurrence = op<{ key: { occurrenceId: string }; startsAt: Date }, OccurrenceRow>()("cal/move");
export type UserRow = { userId: string; status: "active" | "archived"; revision: number };
export const archiveUsers = op<{ keys: readonly { userId: string }[] }, {}>()("admin/archive", ["keys"]); // the input Schema says keys is an array
export const bump = op<{ key: IssueKey }, {}>()("issues/bump-twice");
