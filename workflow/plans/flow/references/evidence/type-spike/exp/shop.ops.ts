/* App: cart and checkout.
 * - The signed-in user has one cart (no input; the response carries its cartId).
 * - The cart's lines: each line's price is the price when it was added, which must not overwrite the
 *   product's live price. Sorted by lineId.
 * - A quote (the cart total) is computed by the server from the cart's lines' quantities and the live
 *   prices of the products in the cart; the client cannot tell which products a cart holds.
 * - Users change a line's quantity; it must show instantly.
 * - Checkout creates an order (returned) and empties the cart on the server.
 * - The order history lists the user's orders, newest first (placedAt, then orderId), paged by
 *   `page` with each response's `nextPage`.
 * - A price stream pushes product price changes.
 */
import { Schema } from "effect"
import { entity, resource, transaction, stream } from "../lib.js"
import { ok, commit } from "./common.js"
const S = Schema.String, N = Schema.Number
export const Cart = entity({ id: "shop/Cart", fields: { cartId: S, itemCount: N }, primaryKey: ["cartId"] })
export const CartLine = entity({ id: "shop/CartLine", fields: { lineId: S, cartId: S, productId: S, quantity: N, price: N }, primaryKey: ["lineId"] })
export const Product = entity({ id: "shop/Product", fields: { productId: S, name: S, price: N }, primaryKey: ["productId"] })
export const Order = entity({ id: "shop/Order", fields: { orderId: S, customerId: S, placedAt: N, total: N }, primaryKey: ["orderId"] })
const LineRow = Schema.Struct({ lineId: S, cartId: S, productId: S, quantity: N, price: N })
const OrderRow = Schema.Struct({ orderId: S, customerId: S, placedAt: N, total: N })
export const myCart = resource({ id: "shop/cart", key: () => ({}), lookup: ok, result: Schema.Struct({ cartId: S, itemCount: N }) })
export const cartLines = resource({ id: "shop/lines", key: (i: { cartId: string }) => i, lookup: ok, result: Schema.Struct({ lines: Schema.Array(LineRow) }) })
export const cartQuote = resource({ id: "shop/quote", key: (i: { cartId: string }) => i, lookup: ok, result: N })
export const setQuantity = transaction({ id: "shop/qty", input: Schema.Struct({ key: Schema.Struct({ lineId: S }), quantity: N }), result: LineRow, commit })
export const placeOrder = transaction({ id: "shop/checkout", input: Schema.Struct({ cartId: S }), result: OrderRow, commit })
export const orderHistory = resource({ id: "shop/orders", key: (i: { page?: number }) => i, lookup: ok,
  result: Schema.Struct({ orders: Schema.Array(OrderRow), nextPage: Schema.optional(N) }) })
export const priceEvents = stream({ id: "shop/prices", key: () => ({}), event: Schema.Struct({ product: Schema.Struct({ productId: S, name: S, price: N }) }) })
