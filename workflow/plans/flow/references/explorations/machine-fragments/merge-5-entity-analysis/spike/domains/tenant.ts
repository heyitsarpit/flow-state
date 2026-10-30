// From review 3's probes (scratch m5-adv), kept as spike fixtures.
import { and, asc, domain, entity, eq, read, write, op } from "../flow.ts";
import type { CardRow } from "./kanban.ts";
import { cardsIn, moveCard } from "./kanban.ts";
export const tenantDomain = (tenant: string, opts: { strict: boolean; archivedToo?: boolean }) => {
  const Card = entity<CardRow>()({ id: `${tenant}/Card`, primaryKey: ["id"], version: "revision" });
  return domain(`${tenant}-kanban`, {
    column: read(cardsIn).list(Card, ({ result }) => result.cards)
      .where(({ input, record }) => and(eq(record.boardId, input.boardId), opts.strict ? eq(record.columnId, input.columnId) : eq(record.boardId, tenant), eq(record.archived, opts.archivedToo ?? false)))
      .orderBy(({ record }) => [asc(record.position)]),
    move: write(moveCard).one(Card).predicts(({ input }) => Card.patch(input.key, { columnId: input.toColumn })),
  });
};
export const A = tenantDomain("a", { strict: true });
export const B = tenantDomain("b", { strict: false });
export const A2 = tenantDomain("a", { strict: true });
