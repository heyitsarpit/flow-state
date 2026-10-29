// Spike-only: two shapes from entity-domain-examples.md (a transfer over two records, a list edit kept
// opaque) and one read using the new condition operators. Not reference domains.
import { add, and, asc, desc, domain, entity, eq, isNull, lt, opaque, or, read, sub, write } from "../flow.ts";
import { myQueue, react, transfer } from "./ops.ts";
import type { AccountRow, MessageRow, Reaction } from "./ops.ts";
import { Ticket } from "./tickets.ts";

export const Account = entity<AccountRow>()({ id: "bank/Account", primaryKey: ["accountId"], version: "revision" });
export const Message = entity<MessageRow>()({ id: "chat/Message", primaryKey: ["messageId"] });

export const addReaction = (rs: readonly Reaction[], emoji: string): readonly Reaction[] =>
  rs.some((r) => r.emoji === emoji)
    ? rs.map((r) => (r.emoji === emoji ? { emoji, count: r.count + 1 } : r))
    : [...rs, { emoji, count: 1 }];

export const Extras = domain("extras", {
  transfer: write(transfer).predicts(({ input }) => [
    Account.patch(input.from, { balance: (a) => sub(a.balance, input.amount) }),
    Account.patch(input.to, { balance: (a) => add(a.balance, input.amount) }),
  ]),
  react: write(react).one(Message).predicts(({ input }) => Message.patch(input.key, {
    reactions: (m) => opaque([m.reactions, input.emoji], (rs, emoji) => addReaction(rs, emoji)),
  })),
  myQueue: read(myQueue)
    .list(Ticket, ({ result }) => result.tickets)
    .where(({ input, record }) =>
      and(
        eq(record.workspaceId, input.workspaceId),
        or(isNull(record.assignee), eq(record.assignee, input.me)),
        lt(record.updatedAt, input.before),
      ),
    )
    .orderBy(({ record }) => [desc(record.updatedAt), asc(record.workspaceId), asc(record.ticketId)]),
});
