// Correct declarations the type-aware lint must not flag: a namespace import, a module const, an enum member,
// casts and `!`, element access, a single-parameter callback, nested destructuring, a helper that builds a
// condition, and a domain factory with a computed id (both allowed: the lint follows types, not syntax).
import * as F from "../flow.ts";
import { and, domain, eq, read, write } from "../flow.ts";
import type { Fields } from "../flow.ts";
import { issuesInProject, saveTitle, ticketList } from "./ops.ts";
import type { IssueRow, TicketRow } from "./ops.ts";
import { Issue } from "./issues.ts";
import { Ticket } from "./tickets.ts";

export enum Since {
  Epoch = 0,
  Launch = 1700000000,
}
const ASSIGNED = "assigned";
export const Defaults = { status: "open" } as const;
const inWorkspace = (record: Fields<TicketRow>, workspaceId: Fields<{ w: string }>["w"]) => eq(record.workspaceId, workspaceId);

export const Variants = domain("variants", {
  constants: read(ticketList)
    .list(Ticket, ({ result }) => result.tickets)
    .where(({ input, record }) =>
      and(inWorkspace(record, input.workspaceId), F.or(eq(record.status, Defaults.status), eq(record.status, ASSIGNED)), F.gt(record.updatedAt, Since.Launch)),
    ),
  singleParameter: read(ticketList)
    .list(Ticket, (c) => c.result.tickets)
    .where((c) => eq(c.record.workspaceId, c.input["workspaceId"])),
  nested: read(ticketList)
    .list(Ticket, ({ result: { tickets } }) => tickets)
    .where(({ input: { workspaceId }, record }) => eq(record.workspaceId, workspaceId!)),
  casts: write(saveTitle)
    .one(Ticket)
    .predicts(({ input }) =>
      Ticket.patch({ workspaceId: input.workspaceId, ticketId: input.ticketId }, { title: input.title as F.Expr<string>, status: Defaults.status }),
    ),
});

export const issuesFor = (id: string) =>
  domain(`issues-${id}`, {
    list: read(issuesInProject)
      .list(Issue, ({ result }) => result.issues)
      .where(({ input, record }) => eq(record.projectId, input.projectId)),
    // A runtime function may use any JavaScript: it is not a recorded position.
    title: write(saveTitle).predicts(({ input }) => Ticket.patch({ workspaceId: input.workspaceId, ticketId: input.ticketId }, { title: (t, input) => (input.title.trim() === "" ? t.title : input.title) })),
  });
export type { IssueRow };
