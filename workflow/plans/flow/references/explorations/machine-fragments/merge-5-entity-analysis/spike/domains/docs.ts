// From review 3's probes (scratch m5-adv), kept as spike fixtures.
import { and, asc, domain, entity, eq, not, or, read, serverMatches, write, op, isNull } from "../flow.ts";
export type DocRow = { id: string; orgId: string; title: string; ownerId: string; visibility: "private" | "org" | "public"; sharedWith: string[]; acl: string; revision: number };
export const docs = op<{ orgId: string; viewer: string; q?: string }, { items: readonly DocRow[] }>()("docs/list");
export const makePrivate = op<{ key: { id: string } }, DocRow>()("docs/private");
export const rename = op<{ key: { id: string }; title: string }, DocRow>()("docs/rename");
export const Doc = entity<DocRow>()({ id: "docs/Doc", primaryKey: ["id"], version: "revision" });
export const Docs = domain("docs", {
  visible: read(docs).list(Doc, ({ result }) => result.items)
    .where(({ input, record }) => and(eq(record.orgId, input.orgId), or(eq(record.ownerId, input.viewer), serverMatches(input.viewer, record.acl)))),
  visibleNoFields: read(docs).list(Doc, ({ result }) => result.items)
    .where(({ input, record }) => and(eq(record.orgId, input.orgId), or(eq(record.ownerId, input.viewer), serverMatches(input.viewer)))),
  negated: read(docs).list(Doc, ({ result }) => result.items)
    .where(({ input, record }) => and(eq(record.orgId, input.orgId), not(serverMatches(input.viewer, record.acl)))),
  makePrivate: write(makePrivate).one(Doc).predicts(({ input }) => Doc.patch(input.key, { visibility: "private" })),
  rename: write(rename).one(Doc).predicts(({ input }) => Doc.patch(input.key, { title: input.title })),
});
