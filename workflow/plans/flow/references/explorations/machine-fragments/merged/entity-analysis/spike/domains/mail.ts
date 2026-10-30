// From review 3's probes (scratch m5-adv), kept as spike fixtures.
import { and, asc, contains, desc, domain, entity, eq, not, or, read, write, op, gt } from "../flow.ts";
export type MsgRow = { id: string; accountId: string; folder: "inbox" | "archive" | "trash"; labels: string[]; read: boolean; receivedAt: Date; subject: string; revision: number };
export const list = op<{ accountId: string; folder: string; label?: string; unreadOnly?: boolean }, { items: readonly MsgRow[] }>()("mail/list");
export const listTyped = op<{ accountId: string; folder: MsgRow["folder"]; label?: string; unreadOnly?: boolean }, { items: readonly MsgRow[] }>()("mail/list2");
export const unread = op<{ accountId: string }, { count: number }>()("mail/unread");
export const archive = op<{ key: { id: string } }, MsgRow>()("mail/archive");
export const addLabel = op<{ key: { id: string }; label: string }, MsgRow>()("mail/addLabel");
export const Msg = entity<MsgRow>()({ id: "mail/Msg", primaryKey: ["id"], version: "revision" });
export const Mail = domain("mail", {
  // @ts-expect-error eq names both types: left "archive" | "inbox" | "trash", right string
  badFolder: read(list).list(Msg, ({ result }) => result.items).where(({ input, record }) => and(eq(record.accountId, input.accountId), eq(record.folder, input.folder))),
  inbox: read(listTyped).list(Msg, ({ result }) => result.items)
    .where(({ input, record }) => and(eq(record.accountId, input.accountId), eq(record.folder, input.folder), contains(record.labels, input.label), eq(record.read, input.unreadOnly)))
    .orderBy(({ record }) => [desc(record.receivedAt), asc(record.id)]),
  unreadCount: read(unread).derivedFrom(Msg, ({ record }) => [record.read])   // where reads folder too; fields list says read only
    .where(({ input, record }) => and(eq(record.accountId, input.accountId), eq(record.folder, "inbox"), eq(record.read, false))),
  archive: write(archive).one(Msg).predicts(({ input }) => Msg.patch(input.key, { folder: "archive" })),
  addLabel: write(addLabel).one(Msg).predicts(({ input }) => Msg.patch(input.key, { labels: (m, input) => [...m.labels, input.label] })),
  // @ts-expect-error DeepReadonly: the record beneath cannot be mutated (push does not exist on readonly string[])
  addLabelMut: write(addLabel).one(Msg).predicts(({ input }) => Msg.patch(input.key, { labels: (m, input) => { m.labels.push(input.label); return m.labels; } })),
  touch: write(archive).one(Msg).predicts(({ input }) => Msg.patch(input.key, { read: true, receivedAt: () => new Date() })),
  touch2: write(archive).one(Msg).predicts(({ input }) => Msg.patch(input.key, { subject: () => String(Math.random()) })),
});
// A function: spreading the recording input throws at construction (the ownKeys trap).
export const mailSpread = () => domain("mail-spread", {
  labelFromDto: write(addLabel).one(Msg).predicts(({ input }) => Msg.patch(input.key, { ...input } as any)),
});
