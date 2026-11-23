import { Exit, Schema } from "effect";
import { Fake } from "../../../src/host/testing/index.ts";
import { NoResponse } from "../services.ts";

const CatalogTruth = Schema.Struct({
  products: Schema.Array(Schema.String),
  saved: Schema.Record(Schema.String, Schema.Array(Schema.String)),
  pageSize: Schema.Number,
});

type Truth = typeof CatalogTruth.Type;

const matching = (truth: Truth, q: string) =>
  truth.products.filter((p) => p.toLowerCase().includes(q.toLowerCase()));

/**
 * The search service's truth: the products, the searches each shopper saved, and the page size.
 * A product is added by a control, as a merchant adds one.
 */
export const Catalog = Fake.server("Catalog", {
  truth: CatalogTruth,
  initial: {
    products: ["shoe rack", "shoes, running", "shoes, trail", "shorts", "socks"],
    saved: {},
    pageSize: 2,
  },
  endpoints: {
    suggest: Fake.call({
      request: { q: Schema.String },
      success: Schema.Struct({ suggestions: Schema.Array(Schema.String) }),
      failure: Schema.Never,
      handle: (truth: Truth, { q }) => ({
        truth,
        exit: Exit.succeed({ suggestions: matching(truth, q).slice(0, 3) }),
      }),
    }),
    results: Fake.call({
      request: { q: Schema.String, page: Schema.Number },
      success: Schema.Struct({ rows: Schema.Array(Schema.String), total: Schema.Number }),
      failure: Schema.Never,
      handle: (truth: Truth, { q, page }) => {
        const all = matching(truth, q);
        const from = page * truth.pageSize;

        return {
          truth,
          exit: Exit.succeed({ rows: all.slice(from, from + truth.pageSize), total: all.length }),
        };
      },
    }),
    saved: Fake.call({
      request: { shopper: Schema.String },
      success: Schema.Struct({ searches: Schema.Array(Schema.String) }),
      failure: Schema.Never,
      handle: (truth: Truth, { shopper }) => ({
        truth,
        exit: Exit.succeed({ searches: truth.saved[shopper] ?? [] }),
      }),
    }),
    save: Fake.call({
      request: { shopper: Schema.String, q: Schema.String, key: Schema.String },
      success: Schema.Struct({ searches: Schema.Array(Schema.String) }),
      failure: Schema.Never,
      handle: (truth: Truth, { shopper, q }) => {
        const searches = [...(truth.saved[shopper] ?? []).filter((s) => s !== q), q];

        return {
          truth: { ...truth, saved: { ...truth.saved, [shopper]: searches } },
          exit: Exit.succeed({ searches }),
        };
      },
    }),
  },
  controls: {
    addProduct: Fake.control({ name: Schema.String }, (truth: Truth, { name }) => ({
      ...truth,
      products: [...truth.products, name],
    })),
  },
  lost: () => new NoResponse(),
});
