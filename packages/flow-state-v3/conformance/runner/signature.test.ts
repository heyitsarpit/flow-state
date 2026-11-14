import assert from "node:assert/strict";
import { Option } from "effect";
import { describe, it } from "vite-plus/test";
import { regressionFiles } from "../generated.ts";
import { signatureLine } from "./signature.ts";

describe("a kept regression's saved signature (T61; survey item 3, Conformance I49)", () => {
  it("a regression saved as a pass fails the check, since it can never fail", () => {
    assert.match(signatureLine("GEN-x", Option.some("pass"), "pass"), /^BAD /u);
  });

  it("a saved red that still fails the same way passes; any change fails", () => {
    assert.match(
      signatureLine("GEN-x", Option.some("disposal Actors I38"), "disposal Actors I38"),
      /^ok /u,
    );
    assert.match(signatureLine("GEN-x", Option.some("disposal Actors I38"), "pass"), /^BAD /u);
    assert.match(signatureLine("GEN-x", Option.none(), "disposal Actors I38"), /^BAD /u);
  });

  it("no kept regression file is saved as a pass", () => {
    assert.deepEqual(
      regressionFiles
        .filter(({ by }) => Option.contains(by, "pass"))
        .map(({ script }) => script.id),
      [],
    );
  });
});
