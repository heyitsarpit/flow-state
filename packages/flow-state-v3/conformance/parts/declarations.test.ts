import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { parts } from "../../fixtures/index.ts";
import { implemented as production } from "../adapters/production.ts";
import { implemented as roundFourteen } from "../adapters/prototype.ts";
import { CODES, MODEL_CODES, unknownCodes } from "./codes.ts";

/**
 * The catalogue's closed list: section 2's 35 codes and the Plan check's 18.
 */
const CATALOGUE = [
  ..."rj lt se ca ky cm cA rt un du ms rs ks gd cs fr ea lk sb op en st wa rl up sr dp ma cx".split(
    " ",
  ),
  ..."gr lr of ad mt lz in ci pv lc ck hs rn sd sn dm fz sw ph kb os pg fg is".split(" "),
];

/**
 * Today's 15: the replan's codes built in production, with write-ahead, refusal and restore in part.
 */
const TODAY = "rj ky cm rt un lr du gd dp ma gr lk wa sr rl".split(" ");

const sorted = (codes: ReadonlyArray<string>) => codes.toSorted();

describe("declarations (Q6: Conformance R16, I51, T34)", () => {
  it("the closed list is the catalogue's 53 codes", () => {
    assert.deepEqual(sorted(CODES), sorted(CATALOGUE));
  });

  it("refuses a code outside the list", () => {
    assert.deepEqual(unknownCodes(["rj", "zz"]), ["zz"]);
  });

  it("production declares today's 15", () => {
    assert.deepEqual(sorted(production), sorted(TODAY));
  });

  it("round-14 and the model declare codes, all in the list", () => {
    assert.ok(roundFourteen.length > TODAY.length);
    assert.ok(MODEL_CODES.length > 0);
    assert.deepEqual(unknownCodes([...roundFourteen, ...MODEL_CODES]), []);
  });

  it("the three pilots are built, and every action of every part claims listed codes", () => {
    assert.deepEqual(sorted(parts.map((p) => p.sketch)), ["S10", "S16", "S21"]);

    for (const part of parts)
      for (const action of Object.values(part.user).flat()) {
        assert.ok(action.codes.length > 0, `${part.name}.${action.name} claims no code`);
        assert.deepEqual(unknownCodes(action.codes), [], `${part.name}.${action.name}`);
      }
  });
});
