/* App: banking.
 * - The accounts screen lists the signed-in user's accounts, sorted by name then accountId.
 *   Balances change on every transfer; that alone must not refetch the list.
 * - A statement lists one account's transactions in a date range (from and to are optional), newest
 *   first (postedAt descending, then txnId).
 * - A transfer moves an amount between two accounts and returns both accounts. Both balances must
 *   change instantly. The server also creates transaction rows that the response does not return.
 * - Two transfers on the same account must not overwrite each other's balance.
 */
import { Schema } from "effect"
import { entity, resource, transaction } from "../lib.js"
import { ok, commit } from "./common.js"
const S = Schema.String, N = Schema.Number
export const Account = entity({ id: "bank/Account", fields: { accountId: S, ownerId: S, name: S, balance: N, version: N }, primaryKey: ["accountId"], version: "version" })
export const Txn = entity({ id: "bank/Txn", fields: { txnId: S, accountId: S, postedAt: N, amount: N }, primaryKey: ["txnId"] })
const AccountRow = Schema.Struct({ accountId: S, ownerId: S, name: S, balance: N, version: N })
const AccountKey = Schema.Struct({ accountId: S })
export const myAccounts = resource({ id: "bank/accounts", key: () => ({}), lookup: ok, result: Schema.Array(AccountRow) })
export const statement = resource({ id: "bank/statement", key: (i: { accountId: string; from?: number; to?: number }) => i, lookup: ok,
  result: Schema.Struct({ txns: Schema.Array(Schema.Struct({ txnId: S, accountId: S, postedAt: N, amount: N })) }) })
export const transfer = transaction({ id: "bank/transfer", input: Schema.Struct({ from: AccountKey, to: AccountKey, amount: N }),
  result: Schema.Struct({ from: AccountRow, to: AccountRow }), commit })
