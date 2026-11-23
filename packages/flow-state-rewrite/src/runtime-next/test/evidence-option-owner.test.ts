import { assert, describe, it } from "@effect/vitest";
import { Option } from "effect";

import { publishEvidenceOption } from "../evidence/evidence-option.js";

describe("evidence Option publication", () => {
  it("P055-OPTION: owns valid Some and None shells without freezing shared or caller state", () => {
    const payload = { count: 1 };
    const sourceSome = Option.some(payload);
    const sharedNone = Option.none<typeof payload>();
    const publishedSome = publishEvidenceOption(payload);
    const publishedNone = publishEvidenceOption<typeof payload>(undefined);

    assert.ok(Option.isSome(publishedSome));
    assert.ok(Option.isNone(publishedNone));
    assert.notStrictEqual(publishedSome, sourceSome);
    assert.notStrictEqual(publishedNone, sharedNone);
    assert.ok(Object.isFrozen(publishedSome));
    assert.ok(Object.isFrozen(publishedNone));
    assert.strictEqual(Object.isFrozen(sourceSome), false);
    assert.strictEqual(Object.isFrozen(sharedNone), false);
    assert.strictEqual(Object.isFrozen(payload), false);

    payload.count = 2;
    assert.strictEqual(Option.getOrThrow(publishedSome), payload);
    assert.strictEqual(payload.count, 2);
  });
});
