/* App: chat. Channels of messages, pushed live.
 * - A channel shows its messages newest first, sorted by sentAt then messageId, loaded a page at a
 *   time backwards: `before` is the cursor, and each response's `older` is the next page's cursor.
 * - Each channel shows an unread count: the number of its messages the user has not read (readByMe).
 * - Users edit a message's body and add reactions (use addReaction); both must show instantly and
 *   must not refetch the channel.
 * - Users delete messages; a deleted message should disappear instantly.
 * - The event stream reports posted, edited and removed messages (removed carries the revision).
 */
import { Schema } from "effect"
import { entity, resource, transaction, stream } from "../lib.js"
import { ok, commit } from "./common.js"
const S = Schema.String, N = Schema.Number, B = Schema.Boolean
export const addReaction = (reactions: readonly string[], emoji: string): readonly string[] => [...reactions, emoji]
export const Message = entity({ id: "chat/Message", fields: { messageId: S, channelId: S, body: S, sentAt: N, readByMe: B, reactions: Schema.Array(S), revision: N }, primaryKey: ["messageId"], version: "revision" })
const MessageRow = Schema.Struct({ messageId: S, channelId: S, body: S, sentAt: N, readByMe: B, reactions: Schema.Array(S), revision: N })
const Key = Schema.Struct({ messageId: S })
export const channelMessages = resource({ id: "chat/channel-messages", key: (input: { channelId: string; before?: string }) => input, lookup: ok,
  result: Schema.Struct({ messages: Schema.Array(MessageRow), older: Schema.optional(S) }) })
export const unreadCount = resource({ id: "chat/unread", key: (input: { channelId: string }) => input, lookup: ok, result: N })
export const editMessage = transaction({ id: "chat/edit", input: Schema.Struct({ key: Key, body: S }), result: MessageRow, commit })
export const react = transaction({ id: "chat/react", input: Schema.Struct({ key: Key, emoji: S }), result: MessageRow, commit })
export const deleteMessage = transaction({ id: "chat/delete", input: Schema.Struct({ key: Key }), result: Schema.Struct({}), commit })
export const messageEvents = stream({ id: "chat/events", key: (i: { channelId: string }) => i, event: Schema.Union([
  Schema.Struct({ type: Schema.Literal("posted"), message: MessageRow }),
  Schema.Struct({ type: Schema.Literal("edited"), message: MessageRow }),
  Schema.Struct({ type: Schema.Literal("removed"), messageId: S, revision: N })]) })
