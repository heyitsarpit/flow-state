import { assert, describe, it } from "@effect/vitest";
import { Result } from "effect";

import { definition } from "../../definition/definition.js";
import { Failure } from "../../diagnostic/diagnostic.js";
import { resource } from "../../operation/resource.js";
import { copyStructural, copyStructuralFrozen, copyStructuralMutable } from "../structural-copy.js";

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

const OpaqueDefinition = Result.getOrThrow(
  definition({
    id: "runtime-next/structural-copy-opaque",
    states: ["ready"],
    events: {},
  }),
);

const opaqueOperation = resource({
  id: "runtime-next/structural-copy-opaque-operation",
  key: (value: number) => [value] as const,
  lookup: (value: number) => value,
});

const opaqueSelector = OpaqueDefinition.select(({ state }) => state);

const opaqueIssue = Failure({
  code: "SemanticValidation",
  path: [],
  details: {},
  summary: "Preserve the diagnostic identity.",
  help: "Keep this diagnostic opaque to structural copying.",
});

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

  it("gives mutable callback owners a detached structural graph", () => {
    const opaque = { stable: true };
    const input = { nested: { value: 1 }, list: [2], opaque };
    const output = Result.getOrThrow(copyStructuralMutable(input, "actor", [opaque]));

    assert.notStrictEqual(output, input);
    assert.notStrictEqual(output.nested, input.nested);
    assert.notStrictEqual(output.list, input.list);
    assert.strictEqual(output.opaque, opaque);
    assert.ok(!Object.isFrozen(output));
    assert.ok(!Object.isFrozen(output.nested));
    assert.ok(!Object.isFrozen(output.list));
    assert.strictEqual(Reflect.set(output.nested, "value", 9), true);
    assert.strictEqual(Reflect.set(output.list, 0, 8), true);
    assert.strictEqual(output.nested.value, 9);
    assert.deepStrictEqual(output.list, [8]);
    assert.strictEqual(input.nested.value, 1);
    assert.deepStrictEqual(input.list, [2]);
  });

  it("freezes copied structural data and retains typed opaque identities", () => {
    const token = OpaqueDefinition.S.ready;

    const input = {
      token,
      operation: opaqueOperation,
      selector: opaqueSelector,
      issue: opaqueIssue,
      nested: { value: 1, list: [2] },
    };

    const opaque: (
      | typeof token
      | typeof opaqueOperation
      | typeof opaqueSelector
      | typeof opaqueIssue
    )[] = [token, opaqueOperation, opaqueSelector, opaqueIssue];

    const output = Result.getOrThrow(copyStructuralFrozen(input, opaque));

    const readonlyTypeProof = () => {
      // @ts-expect-error Frozen actor copies expose readonly nested structural data.
      output.nested.value = 3;
    };

    void readonlyTypeProof;

    assert.notStrictEqual(output, input);
    assert.ok(Object.isFrozen(output));
    assert.ok(Object.isFrozen(output.nested));
    assert.ok(Object.isFrozen(output.nested.list));
    assert.ok(!Object.isFrozen(input.nested));
    assert.strictEqual(output.token, token);
    assert.strictEqual(output.operation, opaqueOperation);
    assert.strictEqual(output.selector, opaqueSelector);
    assert.strictEqual(output.issue, opaqueIssue);
    assert.ok(!Object.isFrozen(output.token));

    const mutable = Result.getOrThrow(
      copyStructuralMutable<typeof input, (typeof opaque)[number]>(output, "actor", opaque),
    );

    const mutableTypeProof = () => {
      mutable.nested.value = 3;
      mutable.nested.list.push(4);
    };

    void mutableTypeProof;

    assert.notStrictEqual(mutable, output);
    assert.notStrictEqual(mutable.nested, output.nested);
    assert.ok(!Object.isFrozen(mutable.nested));
    assert.ok(!Object.isFrozen(mutable.nested.list));
    assert.strictEqual(mutable.token, token);
    assert.strictEqual(mutable.operation, opaqueOperation);
    assert.strictEqual(mutable.selector, opaqueSelector);
    assert.strictEqual(mutable.issue, opaqueIssue);
    assert.strictEqual(mutable.nested.value, 1);
    assert.deepStrictEqual(mutable.nested.list, [2]);
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
