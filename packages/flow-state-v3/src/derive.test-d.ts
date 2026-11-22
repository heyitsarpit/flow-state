import { Effect, Schema } from "effect";
import { describe, expectTypeOf, it } from "vite-plus/test";
import type * as Contract from "./contract.ts";
import { transaction, type BoundInput, type BoundKey } from "./contract.ts";
import type { Compiled, Node } from "./core/compiled.ts";
import { definition } from "./definition.ts";
import { Flow } from "./flow.ts";

// The internal rows of the typed machine. Each pin is inverted: it refuses a type that does not
// exist yet and names the row that flips it; the flipped test asserts the row exactly.

const send = transaction({
  id: "derive/send",
  input: { account: Schema.String, cents: Schema.Number },
  key: ["account"],
  concurrency: "reject",
  services: [],
  commit: () => Effect.succeed({ receipt: "r" }),
});

const Wallet = definition({
  id: "derive/Wallet",
  states: ["IDLE", { SENDING: ["WAITING", "UNSURE"] }],
  events: { Send: { cents: Schema.Number } },
  internalEvents: { Sent: { receipt: Schema.String }, Unsure: Flow.uncertain({}) },
  memory: { account: Flow.input(Schema.String), cents: Flow.initial(Schema.Number, 0) },
  operations: ({ E }) => ({
    send: send.outcomes({
      success: E.Sent.from((v) => ({ receipt: v.receipt })),
      failure: {},
      unknown: E.Unsure,
    }),
  }),
});

type Bound = typeof Wallet.operations.send;

describe("the mapper context row (Types R10, MapperTypes)", () => {
  it("Types R10: a bound contract's mapper context is its input and its picked key record", () => {
    expectTypeOf<BoundKey<Bound>>().toEqualTypeOf<{ readonly account: string }>();

    // @ts-expect-error Types R10: inverted until contract.ts's MapperContext lands; the row the mapper's second argument reads
    expectTypeOf<Contract.MapperContext<BoundInput<Bound>, BoundKey<Bound>>>().toEqualTypeOf<{
      readonly input: { readonly account: string; readonly cents: number };
      readonly key: { readonly account: string };
    }>();
  });
});

describe("derived fields of Compiled (Types R14, I10)", () => {
  it("Types R14: a node holds its chain, depth and leaf, built once by indexOf", () => {
    expectTypeOf<Node["children"]>().toEqualTypeOf<ReadonlyArray<string>>();
    // @ts-expect-error Types R14: inverted until Node.chain lands (replaces tree.ts#chainOf)
    expectTypeOf<Node["chain"]>().toEqualTypeOf<ReadonlyArray<string>>();
    // @ts-expect-error Types R14: inverted until Node.depth lands
    expectTypeOf<Node["depth"]>().toEqualTypeOf<number>();
    // @ts-expect-error Types R14: inverted until Node.leaf lands (replaces tree.ts#leafOf)
    expectTypeOf<Node["leaf"]>().toEqualTypeOf<string>();
  });

  it("Types R14: Compiled holds the tags some state or the root handles (replaces machine.ts#handled)", () => {
    expectTypeOf<Compiled["states"]>().toEqualTypeOf<ReadonlyMap<string, Node>>();
    // @ts-expect-error Types R14: inverted until Compiled.handledTags lands
    expectTypeOf<Compiled["handledTags"]>().toEqualTypeOf<ReadonlySet<string>>();
  });
});
