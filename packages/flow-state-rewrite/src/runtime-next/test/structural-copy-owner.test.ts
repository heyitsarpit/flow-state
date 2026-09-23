import { assert, describe, it } from "@effect/vitest";
import { Result } from "effect";

import { copyStructural } from "../structural-copy.js";

type DeepNode = { kind: "branch"; next: DeepNode } | { kind: "leaf" };

const deepValue = () => {
  const root: DeepNode = { kind: "branch", next: { kind: "leaf" } };
  let cursor = root;

  for (let index = 0; index < 20_000; index += 1) {
    const next: DeepNode = { kind: "branch", next: { kind: "leaf" } };
    cursor.next = next;
    cursor = next;
  }

  return root;
};

describe("runtime-next structural copy owner", () => {
  it("P055-COPY: copies 20k levels with one iterative traversal and leaves caller data mutable", () => {
    const input = deepValue();

    for (const policy of ["actor", "context", "evidence"] as const) {
      const copied = Result.getOrThrow(copyStructural(input, policy));
      let cursor: DeepNode = copied;

      for (let index = 0; index < 20_000; index += 1) {
        if (cursor.kind !== "branch") throw Error("Deep branch ended early");
        cursor = cursor.next;
      }

      assert.ok(Object.isFrozen(copied));
      assert.strictEqual(Reflect.set(copied, "next", {}), false);
      assert.strictEqual(Reflect.set(cursor, "kind", "branch"), false);
    }

    assert.ok(!Object.isFrozen(input));
    input.next = { kind: "leaf" };
  });

  it("rejects actor cycles and preserves context/evidence cycles and aliases", () => {
    const shared = { value: 1 };

    const input = {
      first: shared,
      second: shared,
      self: {},
    };

    input.self = input;

    assert.ok(Result.isFailure(copyStructural(input, "actor")));

    for (const policy of ["context", "evidence"] as const) {
      const output = Result.getOrThrow(copyStructural(input, policy));
      assert.notStrictEqual(output, input);
      assert.strictEqual(output.self, output);
      assert.strictEqual(output.first, output.second);
      assert.notStrictEqual(output.first, shared);
      assert.strictEqual(Reflect.set(output.first, "value", 9), false);
      assert.strictEqual(output.first.value, 1);
    }
  });

  it("preserves requested opaque identities and present undefined", () => {
    const opaque = { stable: true };
    const date = new Date(0);
    const input = { opaque, nested: { date }, optional: undefined };
    const output = Result.getOrThrow(copyStructural(input, "evidence", [opaque]));

    assert.strictEqual(output.opaque, opaque);
    assert.strictEqual(output.nested.date, date);
    assert.ok(Object.hasOwn(output, "optional"));
    assert.strictEqual(output.optional, undefined);
  });

  it("applies sparse and accessor rules without calling a getter", () => {
    const sparse: number[] = [];
    sparse.length = 2;
    sparse[1] = 4;
    const context = Result.getOrThrow(copyStructural(sparse, "context"));

    assert.strictEqual(context.length, 2);
    assert.ok(!Object.hasOwn(context, 0));
    assert.ok(Result.isFailure(copyStructural(sparse, "actor")));
    assert.ok(Result.isFailure(copyStructural(sparse, "evidence")));

    let reads = 0;

    const accessor = Object.defineProperty({}, "value", {
      enumerable: true,
      get: () => {
        reads += 1;

        return 1;
      },
    });

    for (const policy of ["actor", "context", "evidence"] as const)
      assert.ok(Result.isFailure(copyStructural(accessor, policy)));

    assert.strictEqual(reads, 0);
    assert.ok(
      Result.isFailure(
        copyStructural(
          new Proxy(
            {},
            {
              ownKeys: () => {
                throw Error("hostile");
              },
            },
          ),
          "evidence",
        ),
      ),
    );
  });
});
