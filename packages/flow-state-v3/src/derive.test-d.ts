import { Effect, Schema } from "effect";
import { describe, expectTypeOf, it } from "vite-plus/test";
import type * as Contract from "./contract.ts";
import { transaction, type BoundInput, type BoundKey } from "./contract.ts";
import type { AnyBody } from "./compile-body.ts";
import type { Compiled, Node } from "./core/compiled.ts";
import type { AnyDefinition } from "./definition.ts";
import type { MachineBody } from "./derive.ts";

// The internal rows of the typed machine. Each holding pin is two-sided; an inverted pin refuses
// a type that does not exist yet and names the row that flips it.

const send = transaction({
  id: "derive/send",
  input: { account: Schema.String, cents: Schema.Number },
  key: ["account"],
  concurrency: "reject",
  services: [],
  commit: () => Effect.succeed({ receipt: "r" }),
});

// Read from the contract, never from a definition's operations: the config echo leaves the face.
type Bound = ReturnType<typeof send.outcomes>;

describe("the mapper context row (Types R10, MapperTypes)", () => {
  it("Types R10: a bound contract's mapper context is its input and its picked key record", () => {
    expectTypeOf<BoundKey<Bound>>().toEqualTypeOf<{ readonly account: string }>();

    expectTypeOf<Contract.MapperContext<BoundInput<Bound>, BoundKey<Bound>>>().toEqualTypeOf<{
      readonly input: { readonly account: string; readonly cents: number };
      readonly key: { readonly account: string };
    }>();
    // @ts-expect-error Types R10: the key is the picked record, not the whole input
    expectTypeOf<Contract.MapperContext<BoundInput<Bound>, BoundKey<Bound>>>().toEqualTypeOf<{
      readonly input: { readonly account: string; readonly cents: number };
      readonly key: { readonly account: string; readonly cents: number };
    }>();
  });
});

describe("derived fields of Compiled (Types R14, I10)", () => {
  it("Types R14: a node holds its chain, depth and leaf, built once by indexOf", () => {
    expectTypeOf<Node["chain"]>().toEqualTypeOf<ReadonlyArray<string>>();
    expectTypeOf<Node["depth"]>().toEqualTypeOf<number>();
    expectTypeOf<Node["leaf"]>().toEqualTypeOf<string>();
    // @ts-expect-error Types R14: the chain is a list of paths, not one path
    expectTypeOf<Node["chain"]>().toEqualTypeOf<string>();
    // @ts-expect-error Types R14: the leaf is a path, not an Option of one
    expectTypeOf<Node["leaf"]>().toEqualTypeOf<Node["default"]>();
  });

  it("Types R14: Compiled holds the tags some state or the root handles", () => {
    expectTypeOf<Compiled["handledTags"]>().toEqualTypeOf<ReadonlySet<string>>();
    // @ts-expect-error Types R14: a set of tags, not the root's handlers
    expectTypeOf<Compiled["handledTags"]>().toEqualTypeOf<Compiled["root"]>();
  });
});

describe("the erased body (Types R13, ErasedCompiled, Q12)", () => {
  it("Types R13: every machine body assigns to AnyBody with no cast, for any definition", () => {
    const erase = <D extends AnyDefinition>(body: MachineBody<D>) => {
      const erased: AnyBody = body;

      return erased;
    };

    expectTypeOf(erase).returns.toEqualTypeOf<AnyBody>();
    // @ts-expect-error Types R13: a handler that is no alternative, token or list is not a body
    expectTypeOf<{ readonly on: { readonly X: 3 } }>().toExtend<AnyBody>();
  });
});
