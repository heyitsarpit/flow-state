import { Schema, Effect } from "effect"
import { domain, read, write, listen, definition, resource, eq, oneOf, and, serverMatches, asc, desc } from "../lib.js"
import * as A from "../app.js"
const ok = () => Effect.succeed(0 as any)
export const m = definition({ id: "m", memory: Schema.Struct({ f: Schema.String }), operations: { Notes: A.NotesDomain }, setup: (O) => [O.Notes.inFolder.setData(({ memory }: any) => memory)] })
