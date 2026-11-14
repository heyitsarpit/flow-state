import assert from "node:assert/strict";
import { Context, Predicate } from "effect";
import { describe, it } from "vite-plus/test";
import { Host } from "../host.ts";
import { browserPlatform } from "./browser.ts";

// The random bits a seed can carry: a number holds at most 32 here (a Uint32), a hex text four
// per digit.
const bitsOf = (seed: unknown) => {
  if (Predicate.isString(seed)) return /^[0-9a-f]+$/u.test(seed) ? seed.length * 4 : 0;

  return Predicate.isNumber(seed) ? 32 : 0;
};

const seedOf = () => Context.get(browserPlatform(), Host).sessionSeed;

describe("the boot seed (WriteLanes I28, R5; WriteLanes T22; T54 A-18)", () => {
  // Owed to A1: today's seed is one Uint32 (`browser.ts` entropy), so it is red until A1 widens
  // it. It passes while its body fails an assertion.
  it("each boot's seed reaching Env.seed has at least 128 random bits, and two boots get their own [owed to A1]", () => {
    assert.throws(
      () => {
        const [one, two] = [seedOf(), seedOf()];
        assert.ok(bitsOf(one) >= 128, `a seed of ${bitsOf(one)} bits`);
        assert.notStrictEqual(one, two);
      },
      (e) => {
        if (e instanceof assert.AssertionError && e.message.includes("a seed of 32 bits"))
          return true;
        // oxlint-disable-next-line lint-bomb/no-throw-in-core -- a test rethrows the failure that is not its owed reason, so it shows as itself
        throw e;
      },
      "the owed case is green: make it an it (A1)",
    );
  });
});
