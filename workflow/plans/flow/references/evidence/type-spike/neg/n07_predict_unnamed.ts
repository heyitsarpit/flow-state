import { Schema, Effect } from "effect"
import { domain, read, write, listen, definition, resource, eq, oneOf, and, serverMatches, asc, desc } from "../lib.js"
import * as A from "../app.js"
const ok = () => Effect.succeed(0 as any)
export const d = domain("d", { rename: write(A.renameNote).one(A.Note).predicts(({ input }) => A.User.patch({ userId: "u" }, { name: input.title })) })
