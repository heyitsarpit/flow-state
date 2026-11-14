import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { describe, it } from "vite-plus/test";
import { writeMatrix } from "./matrix.ts";

const lostAfter = (before: string, after: string) => {
  const dir = mkdtempSync(join(tmpdir(), "matrix-"));

  try {
    const path = join(dir, "catch-matrix.tsv");
    writeFileSync(path, `${before}\n`);

    return Effect.runSync(writeMatrix(path, [after]));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

describe("the catch matrix's lost catches (phase-out V1)", () => {
  it("a catch whose Invariant only took its retired form is not lost", () => {
    assert.deepEqual(
      lostAfter(
        "m\tLANE-03\tcaught lane-queue WriteLanes I9",
        "m\tLANE-03\tcaught lane-queue Retired WriteLanes I9",
      ),
      [],
    );
  });

  it("a catch that becomes a red by another check, or another Invariant, is lost", () => {
    const before = "m\tLANE-03\tcaught lane-queue WriteLanes I9";

    assert.equal(lostAfter(before, "m\tLANE-03\tred delivered-once").length, 1);
    assert.equal(lostAfter(before, "m\tLANE-03\tcaught lane-queue WriteLanes I20").length, 1);
  });

  it("a neighbouring oracle's red row that turns green or changes oracle is lost; a case red is not", () => {
    const neighbour = "m\tACT-01\tred disposal";

    assert.equal(lostAfter(neighbour, "m\tACT-01\tgreen").length, 1);
    assert.equal(lostAfter(neighbour, "m\tACT-01\tred selection").length, 1);
    assert.deepEqual(lostAfter(neighbour, "m\tACT-01\tred disposal"), []);
    assert.deepEqual(lostAfter("m\tACT-01\tred case", "m\tACT-01\tgreen"), []);
  });
});
