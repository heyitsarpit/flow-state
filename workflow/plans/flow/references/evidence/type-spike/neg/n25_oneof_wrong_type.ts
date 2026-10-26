import { Schema, Effect } from "effect"
import { domain, read, write, listen, definition, resource, eq, oneOf, and, serverMatches, asc, desc } from "../lib.js"
import * as A from "../app.js"
const ok = () => Effect.succeed(0 as any)
export const d = domain("d", { u: read(A.usersTable).list(A.AdminUser, ({ result }) => result.users).where(({ input, record }) => and(oneOf(record.name, [1, 2]), eq(record.roleId, input.roleId), oneOf(record.status, input.statuses))).orderBy(({ record }) => [asc(record.userId)]).pagedBy(({ input }) => input.page, ({ result }) => result.nextPage) })
