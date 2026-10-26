import { Schema, Effect } from "effect"
import { domain, read, write, listen, definition, resource, eq, oneOf, and, serverMatches, asc, desc } from "../lib.js"
import * as A from "../app.js"
const ok = () => Effect.succeed(0 as any)
export const d = domain("d", { c: read(A.folderContents).list(A.File, ({ result }) => result.items, { kind: "file" }).list(A.Folder, ({ result }) => result.items, { kind: "folder" }).where(({ input, record }) => and(eq(record.parentId, input.folderId), eq(record.size, 0))).unordered() })
