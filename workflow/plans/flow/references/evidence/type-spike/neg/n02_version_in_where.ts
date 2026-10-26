import { Schema, Effect } from "effect"
import { domain, read, write, listen, definition, resource, eq, oneOf, and, serverMatches, asc, desc } from "../lib.js"
import * as A from "../app.js"
const ok = () => Effect.succeed(0 as any)
export const d = domain("d", { a: read(A.notesInFolder).list(A.Note, ({ result }) => result.notes).where(({ input, record }) => and(eq(record.folderId, input.folderId), eq(record.revision, 3))).ignoring(({ input }) => [input.cursor]) })
