// From review 4's probes (scratch m5-r2a), kept as a spike fixture. A function: some entries may throw at construction.
import { and, domain, entity, eq, read, write } from "../flow.ts";
import { cardsIn, moveCard } from "./kanban.ts";
import type { CardRow } from "./kanban.ts";
const Card = entity<CardRow>()({ id: "p/Card", primaryKey: ["id"], version: "revision" });
const Card2 = entity<CardRow>()({ id: "p/Card2", primaryKey: ["id"], version: "revision" });
const wAny = (c: any) => (c.input.mineOnly ? eq(c.record.boardId, "a") : eq(c.record.boardId, "b"));
export const P = () => domain("p", {
  // P1 receiver branch
  r1: write(moveCard).one(Card).predicts(({ input }) => (input.position ? Card : Card2).patch(input.key, { columnId: input.toColumn })),
  // P5 computed field name
  r5: write(moveCard).one(Card).predicts(({ input }) => Card.patch(input.key, { [input.position ? "columnId" : "title"]: "x" } as any)),
  // P6 zero-param callback
  r6: read(cardsIn).list(Card, ({ result }) => result.cards).where(() => (Date.now() % 2 ? eq((Card as any).fields.boardId, "a") : eq((Card as any).fields.boardId, "b"))),
  // P7 any-typed named callback
  r7: read(cardsIn).list(Card, ({ result }) => result.cards).where(wAny),
});
