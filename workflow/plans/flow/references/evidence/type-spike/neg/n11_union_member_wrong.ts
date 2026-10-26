import { Schema, Effect } from "effect"
import { domain, read, write, listen, definition, resource, eq, oneOf, and, serverMatches, asc, desc } from "../lib.js"
import * as A from "../app.js"
const ok = () => Effect.succeed(0 as any)
export const d = domain("d", { c: read(A.folderContents).list(A.File, ({ result }) => result.items, { kind: "dir" }).where(({ input, record }) => eq(record.parentId, input.folderId)).unordered() })
