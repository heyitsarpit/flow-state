import { Exit, Schema } from "effect";
import { Fake } from "../../../src/host/testing/index.ts";
import { Line } from "../services.ts";

const Stored = Schema.Struct({ variantId: Schema.String, quantity: Schema.Number });

const CartsTruth = Schema.Struct({
  carts: Schema.Record(Schema.String, Schema.Record(Schema.String, Stored)),
  soldOut: Schema.Array(Schema.String),
  stock: Schema.Record(Schema.String, Schema.Number),
});

type Truth = typeof CartsTruth.Type;

const key = { key: Schema.String };

const linesOf = (truth: Truth, cartId: string) => truth.carts[cartId] ?? {};

const withLines = (
  truth: Truth,
  cartId: string,
  lines: Readonly<Record<string, typeof Stored.Type>>,
) => ({ ...truth, carts: { ...truth.carts, [cartId]: lines } });

const setLine = (truth: Truth, cartId: string, lineId: string, quantity: number) => {
  const lines = linesOf(truth, cartId);
  const stored = lines[lineId];

  if (stored === undefined)
    return { truth, exit: Exit.succeed({ lineId, variantId: "", quantity: 0 }) };

  const stock = truth.stock[stored.variantId] ?? Number.POSITIVE_INFINITY;

  if (quantity > stock)
    return {
      truth,
      exit: Exit.fail({ _tag: "NotEnough" as const, lineId, quantity: stored.quantity }),
    };

  const { [lineId]: _removed, ...rest } = lines;
  const next = quantity === 0 ? rest : { ...lines, [lineId]: { ...stored, quantity } };

  return {
    truth: withLines(truth, cartId, next),
    exit: Exit.succeed({ lineId, variantId: stored.variantId, quantity }),
  };
};

/**
 * The cart service's truth: each cart's lines by line id. An add of a line the cart already holds
 * answers that line again; a sold-out variant refuses its add; a quantity above the variant's
 * stock is refused with the quantity the line still holds; 0 removes the line. Controls sell a
 * variant out or set its stock.
 */
export const Carts = Fake.server("Carts", {
  truth: CartsTruth,
  initial: { carts: {}, soldOut: [], stock: {} },
  endpoints: {
    addLine: Fake.call({
      request: { cartId: Schema.String, lineId: Schema.String, variantId: Schema.String, ...key },
      success: Line,
      failure: Schema.TaggedStruct("SoldOut", { lineId: Schema.String }),
      handle: (truth: Truth, { cartId, lineId, variantId }) => {
        const lines = linesOf(truth, cartId);
        const held = lines[lineId];

        if (held !== undefined) return { truth, exit: Exit.succeed({ lineId, ...held }) };

        if (truth.soldOut.includes(variantId))
          return { truth, exit: Exit.fail({ _tag: "SoldOut" as const, lineId }) };

        return {
          truth: withLines(truth, cartId, { ...lines, [lineId]: { variantId, quantity: 1 } }),
          exit: Exit.succeed({ lineId, variantId, quantity: 1 }),
        };
      },
    }),
    setQuantity: Fake.call({
      request: { cartId: Schema.String, lineId: Schema.String, quantity: Schema.Number, ...key },
      success: Line,
      failure: Schema.TaggedStruct("NotEnough", { lineId: Schema.String, quantity: Schema.Number }),
      handle: (truth: Truth, { cartId, lineId, quantity }) =>
        setLine(truth, cartId, lineId, quantity),
    }),
  },
  controls: {
    soldOut: Fake.control({ variantId: Schema.String }, (truth: Truth, { variantId }) => ({
      ...truth,
      soldOut: [...truth.soldOut, variantId],
    })),
    stock: Fake.control(
      { variantId: Schema.String, left: Schema.Number },
      (truth: Truth, { variantId, left }) => ({
        ...truth,
        stock: { ...truth.stock, [variantId]: left },
      }),
    ),
  },
});
