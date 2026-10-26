import { Schema, Effect } from "effect"
import { domain, read, write, listen, definition, resource, eq, oneOf, and, serverMatches, asc, desc } from "../lib.js"
import * as A from "../app.js"
const ok = () => Effect.succeed(0 as any)
const r = resource({ id: "r", key: (i: { folderId: string; cursor?: string }) => i, lookup: ok, result: Schema.Struct({ notes: Schema.Array(Schema.Struct({ noteId: Schema.String, folderId: Schema.String })), nextPage: Schema.Number }) })
export const d = domain("d", { a: read(r).list(A.Note, ({ result }) => result.notes).where(({ input, record }) => eq(record.folderId, input.folderId)).orderBy(({ record }) => [asc(record.noteId)]).pagedBy(({ input }) => input.cursor, ({ result }) => result.nextPage) })
