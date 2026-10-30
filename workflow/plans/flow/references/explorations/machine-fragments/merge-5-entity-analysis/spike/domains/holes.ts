// From review 3's probes (scratch m5-adv), kept as spike fixtures.
import { and, domain, entity, eq, or, read, write, op } from "../flow.ts";
import type { Condition } from "../flow.ts";
import type { CardRow } from "./kanban.ts";
import { cardsIn, moveCard } from "./kanban.ts";
import { Now, imported } from "./helperlib.ts";
const Card = entity<CardRow>()({ id: "h/Card", primaryKey: ["id"], version: "revision" });
const anyHelper = (flag: any, a: Condition, b: Condition) => (flag ? a : b);                  // H1 any param
const genHelper = <T,>(flag: T, a: Condition, b: Condition) => (flag ? a : b);                // H2 generic
const typedHelper = (flag: boolean, a: Condition, b: Condition) => (flag ? a : b);            // (type error to call)
const andish = (a: any, b: any) => a && b;                                                    // H3
const getterObj = { get cond() { return 1; } };
const nowAlias = Date;
const LOADED = Date.now();
// A function: some entries throw at construction (the enumeration traps), which main.ts checks one by one.
export const H = () => domain("holes", {
  e1: read(cardsIn).list(Card, ({ result }) => result.cards).where(({ input, record }) => anyHelper(input.mineOnly, eq(record.boardId, "a"), eq(record.boardId, "b"))),
  e2: read(cardsIn).list(Card, ({ result }) => result.cards).where(({ input, record }) => genHelper(input.mineOnly, eq(record.boardId, "a"), eq(record.boardId, "b"))),
  e3: read(cardsIn).list(Card, ({ result }) => result.cards).where(({ input, record }) => andish(eq(record.boardId, "a"), eq(record.boardId, "b"))),
  e4: read(cardsIn).list(Card, ({ result }) => result.cards).where(({ input, record }) => {
    if (input.mineOnly) return eq(record.boardId, "a");   // H4 if
    return eq(record.boardId, "b");
  }),
  e5: read(cardsIn).list(Card, ({ result }) => result.cards).where(({ input, record }) => {
    // @ts-expect-error the types already reject this spread form
    switch (input.columnId) { case "todo": return eq(record.boardId, "a"); default: return eq(record.boardId, "b"); } // H5 switch
  }),
  e6: read(cardsIn).list(Card, ({ result }) => result.cards).where(({ input, record }) => ((input.mineOnly as any) ? eq(record.boardId, "a") : eq(record.boardId, "b"))), // H6 cast to any
  e7: read(cardsIn).list(Card, ({ result }) => result.cards).where(({ input, record }) => (typeof input.mineOnly === "boolean" ? eq(record.boardId, "a") : eq(record.boardId, "b"))), // H7 typeof
  e8: read(cardsIn).list(Card, ({ result }) => result.cards).where(({ input, record }) => ("mineOnly" in input ? eq(record.boardId, "a") : eq(record.boardId, "b"))), // H8 in
  e9: read(cardsIn).list(Card, ({ result }) => result.cards).where(({ input, record }) => eq(record.boardId, JSON.stringify(input) as any)), // H9 JSON
  e11: read(cardsIn).list(Card, ({ result }) => result.cards).where(({ input, record }) => and(eq(record.boardId, "x"), ...(input.mineOnly ? [eq(record.columnId, "todo")] : []))), // H11 spread+?:
  e12: read(cardsIn).list(Card, ({ result }) => result.cards).where(({ input, record }) => eq(record.boardId, Now())), // H12 imported impure
  e13: read(cardsIn).list(Card, ({ result }) => result.cards).where(({ input, record }) => eq(record.boardId, String((globalThis as any).Date.now()))), // H13
  e14: read(cardsIn).list(Card, ({ result }) => result.cards).where(({ input, record }) => eq(record.boardId, String((Date as any)["now"]()))), // H14
  e15: read(cardsIn).list(Card, ({ result }) => result.cards).where(({ input, record }) => eq(record.boardId, String(nowAlias.now()))), // H15 alias
  e16: read(cardsIn).list(Card, ({ result }) => result.cards).where(({ input, record }) => or(...[1, 2].map(() => eq(record.position, Math.random())))), // H16 nested arrow
  e17: read(cardsIn).list(Card, ({ result }) => result.cards).where(({ input, record }) => eq(record.boardId, String(imported))), // H17 imported const
  e18: read(cardsIn).list(Card, ({ result }) => result.cards).where(({ input, record }) => eq(record.boardId, input.boardId ?? "x")), // ?? direct
  e19: read(cardsIn).list(Card, ({ result }) => result.cards).where(({ input, record }) => eq(record.boardId, (input as any).boardId || "x")), // || with any
  e20: write(moveCard).one(Card).predicts(({ input }) => Card.patch(input.key, { title: (c: any, i: any) => (input as any).toColumn })), // closure via any
  e21: write(moveCard).one(Card).predicts(({ input }) => Card.patch(input.key, { title: (c) => String(input.toColumn) })),  // closure through String()
  e22: write(moveCard).one(Card).predicts(({ input }) => Card.patch(input.key, { title: (c, input) => String(Date.now()) })),   // impure in predicted fn
  e24: read(cardsIn).list(Card, ({ result }) => result.cards).where(({ input, record }) => eq(record.position, LOADED)), // a const computed at load, bare
  e25: read(cardsIn).list(Card, ({ result }) => result.cards).where(({ input, record }) => eq(record.position, imported)), // an imported computed value, bare
  e23: write(moveCard).one(Card).predicts(({ input }) => Card.patch(input.key, { ...input } as any)),   // spread of input
});
