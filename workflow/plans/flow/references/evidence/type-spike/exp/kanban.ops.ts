/* App: Kanban board.
 * - A board shows its columns ordered by position (then columnId).
 * - The board's cards are read once for the whole board; the view groups them by columnId and sorts
 *   them by position itself. Dragging a card to another column must move it instantly.
 * - Each column shows a card count; one request returns the counts of every column of a board.
 * - Moving a card sets its column and position (the machine computes the position). The server
 *   renumbers the positions of the destination column's other cards; the response returns only the
 *   moved card.
 */
import { Schema } from "effect"
import { entity, resource, transaction } from "../lib.js"
import { ok, commit } from "./common.js"
const S = Schema.String, N = Schema.Number
export const Column = entity({ id: "kb/Column", fields: { columnId: S, boardId: S, name: S, position: N }, primaryKey: ["columnId"] })
export const Card = entity({ id: "kb/Card", fields: { cardId: S, boardId: S, columnId: S, position: N, title: S }, primaryKey: ["cardId"] })
const ColumnRow = Schema.Struct({ columnId: S, boardId: S, name: S, position: N })
const CardRow = Schema.Struct({ cardId: S, boardId: S, columnId: S, position: N, title: S })
export const columnsOfBoard = resource({ id: "kb/columns", key: (i: { boardId: string }) => i, lookup: ok, result: Schema.Struct({ columns: Schema.Array(ColumnRow) }) })
export const cardsOfBoard = resource({ id: "kb/cards", key: (i: { boardId: string }) => i, lookup: ok, result: Schema.Struct({ cards: Schema.Array(CardRow) }) })
export const cardCounts = resource({ id: "kb/counts", key: (i: { boardId: string }) => i, lookup: ok,
  result: Schema.Struct({ counts: Schema.Array(Schema.Struct({ columnId: S, count: N })) }) })
export const moveCard = transaction({ id: "kb/move", input: Schema.Struct({ key: Schema.Struct({ cardId: S }), boardId: S, toColumn: S, position: N }), result: CardRow, commit })
