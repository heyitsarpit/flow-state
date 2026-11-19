import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { type Fault, faults } from "./faults.ts";

const PACKAGE = new URL("../", import.meta.url);

const text = (file: string) => readFileSync(new URL(file, PACKAGE), "utf8");

// Each file's edits applied in turn, as the faults runner plants them: the edits whose `find` no
// longer occurs exactly once in the text the edits before it left.
const staleEdits = (fault: Fault) =>
  [...new Set(fault.edits.map((edit) => edit.file))].flatMap(
    (file) =>
      fault.edits
        .filter((edit) => edit.file === file)
        .reduce<{ readonly current: string; readonly stale: ReadonlyArray<string> }>(
          ({ current, stale }, edit) =>
            current.split(edit.find).length === 2
              ? { current: current.replace(edit.find, () => edit.replace), stale }
              : { current, stale: [...stale, `${file}: ${edit.find}`] },
          { current: text(file), stale: [] },
        ).stale,
  );

describe("planted faults stay planted", () => {
  it("every fault's find text occurs exactly once in its file, so none goes stale unseen", () => {
    const stale = faults.flatMap((fault) =>
      staleEdits(fault).map((edit) => `${fault.name}: ${edit}`),
    );

    expect(stale).toEqual([]);
  });

  it("every fault names target test files that exist", () => {
    const missing = faults.flatMap((fault) =>
      fault.tests.length === 0
        ? [`${fault.name}: no target`]
        : fault.tests
            .filter((file) => !existsSync(new URL(file, PACKAGE)))
            .map((file) => `${fault.name}: ${file}`),
    );

    expect(missing).toEqual([]);
  });
});
