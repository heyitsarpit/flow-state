// From review 3's probes (scratch m5-adv), kept as spike fixtures.
import { and, asc, domain, entity, eq, isNull, not, oneOf, or, read, write, op } from "../flow.ts";
export type CardRow = { id: string; boardId: string; columnId: string; assigneeId: string | null; position: number; title: string; labels: string[]; archived: boolean; meta: { owner: string }; revision: number };
export type ColumnId = "todo" | "doing" | "done";
export const cardsIn = op<{ boardId: string; columnId: ColumnId; me: string; mineOnly?: boolean; includeArchived?: boolean }, { cards: readonly CardRow[] }>()("kb/cards", undefined, { mineOnly: false, includeArchived: false }); // the input Schema's defaults
export const moveCard = op<{ key: { id: string }; toColumn: ColumnId; position: number }, CardRow>()("kb/move");
export const reorder = op<{ key: { id: string }; afterPosition: number; beforePosition: number }, CardRow>()("kb/reorder");
export const Card = entity<CardRow>()({ id: "kb/Card", primaryKey: ["id"], version: "revision" });
export const Kanban = domain("kanban", {
  column: read(cardsIn).list(Card, ({ result }) => result.cards)
    .where(({ input, record }) => and(
      eq(record.boardId, input.boardId),
      eq(record.columnId, input.columnId),
      or(eq(input.mineOnly, false), isNull(record.assigneeId), eq(record.assigneeId, input.me)), // gate by an input-only leaf
      eq(record.archived, input.includeArchived), // absent => every record
    ))
    .orderBy(({ record }) => [asc(record.position), asc(record.id)]),
  mineByOwner: read(cardsIn).list(Card, ({ result }) => result.cards)
    .where(({ input, record }) => and(eq(record.boardId, input.boardId), eq(record.meta.owner, input.me))),
  move: write(moveCard).one(Card).predicts(({ input }) => Card.patch(input.key, { columnId: input.toColumn, position: input.position })),
  reorder: write(reorder).one(Card).predicts(({ input }) => Card.patch(input.key, {
    position: (_c, input) => (input.afterPosition + input.beforePosition) / 2,
  })),
  setOwner: write(moveCard).predicts(({ input }) => Card.patch(input.key, { meta: { owner: "x" } as any })),
});
