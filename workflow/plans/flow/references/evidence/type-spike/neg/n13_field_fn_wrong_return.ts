import { Schema, Effect } from "effect"
import { domain, read, write, listen, definition, resource, eq, oneOf, and, serverMatches, asc, desc } from "../lib.js"
import * as A from "../app.js"
const ok = () => Effect.succeed(0 as any)
export const d = domain("d", { t: write(A.transfer).one(A.Account, ({ result }) => result.from).predicts(({ input }) => A.Account.patch(input.from, { balance: (a) => "x" + a.name })) })
