// From review 5's probes (scratch m5-r3b), kept as a spike fixture.
import { and, domain, entity, eq, gt, or, read, write, contradicts, canonical } from "../flow.ts";
import type { Condition } from "../flow.ts";
import type { CardRow } from "./kanban.ts";
import { cardsIn, moveCard } from "./kanban.ts";
import { extW, holder, mk } from "./r3lib.ts";
const Card = entity<CardRow>()({ id: "r3/Card", primaryKey: ["id"], version: "revision" });
const bound = ((c: any) => eq(c.record.boardId, "z")).bind(null);
declare const BUILD: "prod";
enum Comp { A = Date.now() % 2, B = 5 }
enum Lit { A = "a", B = "b" }
const NOW = Date.now() as unknown as 1;
const G = { get v(): 1 { return Math.random() as 1; } };
let reass = ({ record }: any): Condition => eq(record.boardId, "a");
reass = ({ record, input }: any) => (Date.now() % 2 ? eq(record.boardId, "a") : eq(record.boardId, "b"));
const hdef = (a: Condition, n: number = Date.now()) => and(a, eq(null as any, n));
const hdef2 = (a: Condition, n: number = Date.now()) => a;
const named = ({ record }: any): Condition => eq(record.boardId, "ok");
const t = (s: TemplateStringsArray) => s[0]!;
const L = () => read(cardsIn).list(Card, ({ result }) => result.cards);
export const R = (tenant: number, w: any) => ({
  a1: () => L().where(extW),
  a2: () => L().where(holder.w),
  a3: () => L().where(bound),
  a4: () => L().where(mk()),
  a5: () => L().where(({ record }) => (Reflect.apply(eq, null, [record.boardId, "x"]) as Condition)),
  a6: () => L().where(({ record }) => eq?.(record.boardId, "x")),
  a7: () => L().where(({ record }) => eq(record.position, G.v)),
  a8: () => L().where(({ record }) => eq(record.position, Comp.A)),
  a8b: () => L().where(({ record }) => eq(record.boardId, Lit.A)),
  a9: () => L().where(({ record }) => eq(record.boardId, BUILD)),
  a10: () => L().where(({ record }) => eq(record.position, NOW)),
  a11: () => L().where(({ record }, now: number = Date.now()) => eq(record.position, now)),
  // @ts-expect-error the probe is ill-typed here too
  a11b: () => L().where(({ record }, now: Date = new Date()) => gt(record.updatedAt as any, now as any)),
  a12: () => L().where(({ record, input: { boardId = Date.now() as any } }) => eq(record.boardId, boardId)),
  a13: () => L().where(({ record }) => eq(record.boardId, t`x`)),
  a14: () => L().where(({ record }) => eq(record.boardId, ("x" satisfies string))),
  // @ts-expect-error the probe is ill-typed here too
  a15: () => L().where(({ record }) => (0, eq(record.boardId, "x"))),
  // @ts-expect-error the probe is ill-typed here too
  a16: () => L().where(({ record }) => void 0 ?? eq(record.boardId, "x")),
  a17: () => L().where(({ record }) => eq(record.boardId, new String("x") as any)),
  a18: () => L().where(({ record }) => eq(record.boardId, JSON.parse("1"))),
  b1: () => L().where(reass),
  b2: () => L().where(({ record }) => hdef2(eq(record.boardId, "x"))),
  b3: () => L().where(({ record }) => hdef(eq(record.boardId, "x"))),
  b4: () => L().where(({ record }) => eq(record.position, tenant)),
  b5: () => L().where(({ record }) => eq(record.archived, contradicts(null as any, {}, record))),
  b6: () => L().where(({ record }) => w(record)),
  b7: () => L().where(({ record }) => eq(record.position, (tenant as any) )),
  b9: () => L().where(({ record }) => (record.position ? eq(record.boardId, "a") : eq(record.boardId, "b"))),
  b8: () => L().where(({ record, input }) => eq(record.boardId, canonical(input.boardId))),
});
export const S = (named: (c: any) => Condition) => domain("r3s", {
  // @ts-expect-error the probe is ill-typed here too
  s1: () => L().where(named),
});
