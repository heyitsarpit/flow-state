// From review 3's probes (scratch m5-adv), kept as spike fixtures.
import { and, asc, between, domain, entity, eq, gt, lt, overlaps, isNull, or, read, write, op } from "../flow.ts";
export type EvRow = { id: string; calId: string; title: string; startsAt: Date; endsAt: Date | null; day: string; revision: number };
export const evs = op<{ calId: string; from?: Date; to?: Date; since?: string }, { items: readonly EvRow[] }>()("cal/evs");
export const resize = op<{ key: { id: string }; endsAt: Date | null }, EvRow>()("cal/resize");
export const Ev = entity<EvRow>()({ id: "cal/Ev", primaryKey: ["id"], version: "revision" });
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const NOW = Date.now();
export const Cal = domain("cal", {
  range: read(evs).list(Ev, ({ result }) => result.items)
    .where(({ input, record }) => and(eq(record.calId, input.calId), overlaps(record.startsAt, record.endsAt, input.from, input.to))),
  // @ts-expect-error the types already reject between on a string field
  stringDay: read(evs).list(Ev, ({ result }) => result.items).where(({ input, record }) => and(eq(record.calId, input.calId), between(record.day, input.since, input.since))),
  openOrFuture: read(evs).list(Ev, ({ result }) => result.items)
    .where(({ input, record }) => and(eq(record.calId, input.calId), or(isNull(record.endsAt), gt(record.endsAt, new Date())))),
  openOrFutureConst: read(evs).list(Ev, ({ result }) => result.items)
    .where(({ input, record }) => and(eq(record.calId, input.calId), or(isNull(record.endsAt), gt(record.endsAt, new Date(NOW))))),
  openOrFutureHelper: read(evs).list(Ev, ({ result }) => result.items)
    .where(({ input, record }) => and(eq(record.calId, input.calId), gt(record.startsAt, startOfToday()))),
  pureDate: read(evs).list(Ev, ({ result }) => result.items)
    .where(({ input, record }) => and(eq(record.calId, input.calId), gt(record.startsAt, new Date("2024-01-01T00:00:00Z")))),
  resize: write(resize).one(Ev).predicts(({ input }) => Ev.patch(input.key, { endsAt: input.endsAt })),
});
