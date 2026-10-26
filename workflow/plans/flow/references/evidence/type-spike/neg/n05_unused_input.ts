import { Schema, Effect } from "effect"
import { domain, read, write, listen, definition, resource, eq, oneOf, and, serverMatches, asc, desc } from "../lib.js"
import * as A from "../app.js"
const ok = () => Effect.succeed(0 as any)
export const d = domain("d", { search: read(A.searchNotes).list(A.Note, ({ result }) => result.hits.note).where(({ input, record }) => eq(record.workspaceId, input.workspaceId)) })
