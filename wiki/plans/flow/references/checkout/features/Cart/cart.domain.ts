// What the cart contracts mean for shared records. Three entities with a relation: a `CartLine` names a `Product`
// (its `productId`), and the line's price is its own field, which the server re-prices when the product's changes.
//
// How this differs from the desk's domains (COVERAGE.md 5.3): a line total predicted with a field function over the
// record beneath (E14), which replays when the price under it changes (E11); one record on two screens, the cart
// page and the header's mini-cart (E7); and a domain write beside a plain one on the same screen (E16: the coupon).
import { asc, domain, entity, eq, read, write } from "flow-state";
import { CartLine as CartLineRow, Product as ProductRow } from "../../adapters/types.js";
import { cartOf, productById, productsOf, removeLine, setQuantity } from "./cart.contracts.js";
import { Schema } from "effect";

export const Product = entity({
  id: "Checkout/Product",
  fields: ProductRow.fields,
  primaryKey: ["productId"],
  version: "revision",
});

export const CartLine = entity({
  id: "Checkout/CartLine",
  fields: CartLineRow.fields,
  primaryKey: ["cartId", "lineId"],
  version: "revision",
});

// The cart's own fields (its lines are their own records).
export const Cart = entity({
  id: "Checkout/Cart",
  fields: {
    cartId: Schema.String,
    subtotalCents: Schema.Int,
    couponCode: Schema.NullOr(Schema.String),
    discountCents: Schema.Int,
    totalCents: Schema.Int,
    intentId: Schema.String,
    revision: Schema.Number,
  },
  primaryKey: ["cartId"],
  version: "revision",
});

const totals = (cartId: string) =>
  Cart.fields({ cartId }, ({ record }) => [record.subtotalCents, record.totalCents]);

export const CartDomain = domain("cart", {
  products: read(productsOf)
    .list(Product, ({ output }) => output)
    .orderBy(({ record }) => [asc(record.productId)]),

  productById: read(productById)
    .one(Product)
    .byKey(({ input }) => ({ productId: input.productId })),

  // One answer, two places: the cart's own record and its lines (entity-domain 4.2 allows several places on a write;
  // design gap: on a READ, `.one` beside `.list` is assumed to be allowed the same way).
  cart: read(cartOf)
    .one(Cart)
    .list(CartLine, ({ output }) => output.lines)
    .where(({ input, record }) => eq(record.cartId, input.cartId))
    .orderBy(({ record }) => [asc(record.cartId), asc(record.lineId)]),

  // The quantity and the line's total at once; the cart's totals are the server's, declared and then confirmed. The
  // total is a field function over the record beneath (merge 5), so a re-price under a pending change replays it.
  setQuantity: write(setQuantity)
    .one(Cart)
    .list(CartLine, ({ output }) => output.lines)
    .alsoChanges(({ input }) => totals(input.cartId))
    .predicts(({ input }) =>
      CartLine.patch(
        { cartId: input.cartId, lineId: input.lineId },
        {
          quantity: input.quantity,
          lineTotalCents: (beneath, input) => beneath.unitPriceCents * input.quantity,
        },
      ),
    ),

  // The answer is the whole cart, so it also brings every other line's current price: a new base under any
  // prediction still pending on those lines (E11).
  removeLine: write(removeLine)
    .one(Cart)
    .list(CartLine, ({ output }) => output.lines)
    .alsoChanges(({ input }) => totals(input.cartId))
    .predicts(({ input }) => CartLine.delete({ cartId: input.cartId, lineId: input.lineId })),
});
