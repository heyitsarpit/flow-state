/* App: calendar. Recurring events are expanded into occurrences.
 * - A week view shows one calendar's occurrences overlapping a time range [from, to). The view places
 *   each occurrence by its start and end times; it does not use the list's order.
 * - Users drag an occurrence to new times; the drag must show instantly.
 * - Editing a series changes, adds or removes its occurrences on the server; the response is empty.
 */
import { Schema } from "effect"
import { entity, resource, transaction } from "../lib.js"
import { ok, commit } from "./common.js"
const S = Schema.String, N = Schema.Number
export const Occurrence = entity({ id: "cal/Occurrence", fields: { occurrenceId: S, calendarId: S, seriesId: S, title: S, startsAt: N, endsAt: N }, primaryKey: ["occurrenceId"] })
const OccRow = Schema.Struct({ occurrenceId: S, calendarId: S, seriesId: S, title: S, startsAt: N, endsAt: N })
export const week = resource({ id: "cal/week", key: (i: { calendarId: string; from: number; to: number }) => i, lookup: ok, result: Schema.Struct({ occurrences: Schema.Array(OccRow) }) })
export const moveOccurrence = transaction({ id: "cal/move", input: Schema.Struct({ key: Schema.Struct({ occurrenceId: S }), startsAt: N, endsAt: N }), result: OccRow, commit })
export const editSeries = transaction({ id: "cal/edit-series", input: Schema.Struct({ calendarId: S, seriesId: S, title: S }), result: Schema.Struct({}), commit })
