// Spike-only: shapes from entity-domain-examples.md (a transfer over two records, a list edit, a calendar over
// Dates, a bulk archive with an array key) and reads using the new condition operators. Not reference domains.
import { and, asc, between, desc, domain, entity, eq, isNull, lt, or, overlaps, read, serverMatches, write } from "../flow.ts";
import { archiveUsers, bump, moveOccurrence, myQueue, occurrencesIn, react, startingBetween, transfer } from "./ops.ts";
import type { AccountRow, MessageRow, OccurrenceRow, Reaction, UserRow } from "./ops.ts";
import { Issue } from "./issues.ts";
import { Ticket } from "./tickets.ts";

export const Account = entity<AccountRow>()({ id: "bank/Account", primaryKey: ["accountId"], version: "revision" });
export const Message = entity<MessageRow>()({ id: "chat/Message", primaryKey: ["messageId"] });
export const Occurrence = entity<OccurrenceRow>()({ id: "cal/Occurrence", primaryKey: ["occurrenceId"] });
export const User = entity<UserRow>()({ id: "admin/User", primaryKey: ["userId"], version: "revision" });

export const addReaction = (rs: readonly Reaction[], emoji: string): readonly Reaction[] =>
  rs.some((r) => r.emoji === emoji)
    ? rs.map((r) => (r.emoji === emoji ? { emoji, count: r.count + 1 } : r))
    : [...rs, { emoji, count: 1 }];

export const Extras = domain("extras", {
  transfer: write(transfer).predicts(({ input }) => [
    Account.patch(input.from, { balance: (a, input) => a.balance - input.amount }),
    Account.patch(input.to, { balance: (a, input) => a.balance + input.amount }),
  ]),
  react: write(react).one(Message).predicts(({ input }) => Message.patch(input.key, {
    reactions: (m, input) => addReaction(m.reactions, input.emoji),
  })),
  // Two `.where` calls: combined with `and`, in call order.
  myQueue: read(myQueue)
    .list(Ticket, ({ result }) => result.tickets)
    .where(({ input, record }) => eq(record.workspaceId, input.workspaceId))
    .where(({ input, record }) => and(or(isNull(record.assignee), eq(record.assignee, input.me)), lt(record.updatedAt, input.before)))
    .orderBy(({ record }) => [desc(record.updatedAt), asc(record.workspaceId), asc(record.ticketId)]),
  // serverMatches under `or`: legal, and maybe for every record, so the join stays conservative.
  mineOrMatching: read(myQueue)
    .list(Ticket, ({ result }) => result.tickets)
    .where(({ input, record }) => and(eq(record.workspaceId, input.workspaceId), or(eq(record.assignee, input.me), serverMatches(input.me, record.title)))),
  // Dates: an absent bound is no bound; endsAt may be null (an open-ended occurrence is maybe on its end term).
  occurrences: read(occurrencesIn)
    .list(Occurrence, ({ result }) => result.items)
    .where(({ input, record }) =>
      and(eq(record.calendarId, input.calendarId), overlaps(record.startsAt, record.endsAt, input.from, input.to)),
    ),
  starting: read(startingBetween)
    .list(Occurrence, ({ result }) => result.items)
    .where(({ input, record }) => and(eq(record.calendarId, input.calendarId), between(record.startsAt, input.from, input.to))),
  move: write(moveOccurrence).one(Occurrence).predicts(({ input }) => Occurrence.patch(input.key, { startsAt: input.startsAt })),
  // An array key: one prediction per listed record; never merge 4 rule 34's default lane key.
  archive: write(archiveUsers).predicts(({ input }) => User.patch(input.keys, { status: "archived" })),
  // Two patches to one record: applied in written order, the second over the first.
  bumpTwice: write(bump).predicts(({ input }) => [
    Issue.patch(input.key, { likes: (i) => i.likes + 1 }),
    Issue.patch(input.key, { likes: (i) => i.likes + 1 }),
  ]),
});
