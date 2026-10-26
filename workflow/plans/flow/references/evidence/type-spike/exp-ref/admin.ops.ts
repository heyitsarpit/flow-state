/* App: admin back-office.
 * - A users table filters by status (statuses is optional: absent means every status) and by role,
 *   sorted by name then userId, paged by page number (`page`; each response's `nextPage`).
 * - A badge shows the number of active users.
 * - A bulk archive sets the chosen users' status to "archived" and returns the users it archived;
 *   the change must show instantly. The server also writes audit entries.
 */
import { Schema } from "effect"
import { entity, resource, transaction } from "../lib.js"
import { ok, commit } from "./common.js"
const S = Schema.String, N = Schema.Number
export const User = entity({ id: "admin/User", fields: { userId: S, name: S, email: S, status: S, roleId: S }, primaryKey: ["userId"] })
export const AuditEntry = entity({ id: "admin/Audit", fields: { auditId: S, userId: S }, primaryKey: ["auditId"] })
const UserRow = Schema.Struct({ userId: S, name: S, email: S, status: S, roleId: S })
export const usersTable = resource({ id: "admin/users", key: (i: { statuses?: readonly string[]; roleId: string; page?: number }) => i, lookup: ok,
  result: Schema.Struct({ users: Schema.Array(UserRow), nextPage: Schema.optional(N) }) })
export const activeUserCount = resource({ id: "admin/active-count", key: () => ({}), lookup: ok, result: N })
export const archiveUsers = transaction({ id: "admin/archive", input: Schema.Struct({ keys: Schema.Array(Schema.Struct({ userId: S })) }),
  result: Schema.Struct({ archived: Schema.Array(UserRow) }), commit })
