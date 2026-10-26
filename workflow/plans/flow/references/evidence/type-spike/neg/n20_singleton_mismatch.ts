import { Schema, Effect } from "effect"
import { domain, read, write, listen, definition, resource, eq, oneOf, and, serverMatches, asc, desc } from "../lib.js"
import * as A from "../app.js"
const ok = () => Effect.succeed(0 as any)
const r = resource({ id: "r", key: () => ({}), lookup: ok, result: Schema.Struct({ id: Schema.String, itemCount: Schema.Number }) })
export const d = domain("d", { cart: read(r).one(A.Cart) })
