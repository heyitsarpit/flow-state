// Correct declarations written the ways authors write them, which the source reader must read and agree
// on: a barrel import, a namespace import, a module const, an `as const` member, a numeric enum member,
// casts and `!`, element access, a single-parameter callback and nested destructuring.
import * as F from "../flow.ts";
import { and, domain, eq, read, write } from "./lib.ts";
import { saveTitle, ticketList } from "./ops.ts";
import { Ticket } from "./tickets.ts";

export enum Since {
  Epoch = 0,
  Launch = 1700000000,
}
const ASSIGNED = "assigned";
export const Defaults = { status: "open" } as const;

export const Variants = domain("variants", {
  constants: read(ticketList)
    .list(Ticket, ({ result }) => result.tickets)
    .where(({ input, record }) =>
      and(eq(record.workspaceId, input.workspaceId), F.or(eq(record.status, Defaults.status), eq(record.status, ASSIGNED)), F.gt(record.updatedAt, Since.Launch)),
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
