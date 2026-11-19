// Planted violations for no-event-name-filter, run through oxlint. `fires` lines are the 1-based lines the
// rule must report; every other line must stay quiet.
// Run: node --experimental-strip-types tools/flow-state-lint/rules/no-event-name-filter.test.ts
import assert from "node:assert/strict";
import { join } from "node:path";

import { inWorkdir } from "./test-support.ts";

const files: Record<string, { text: ReadonlyArray<string>; fires: ReadonlyArray<number> }> = {
  "tests/planted.ts": {
    text: [
      'const a = run.evidence.filter((e) => e._tag === "Turn" && e.event === "Unsure");', // fires
      "const b = (event: string) => run.evidence.filter((e) => e.event === event);", // fires
      'const c = run.evidence.filter((e) => "Seen" !== e.event);', // fires
      "const d = run.evidence.filter((e) => names.has(e.event));", // fires
      "const f = run.evidence.filter((e) => known.has(`${e.actor.machine} ${e.event}`));", // fires
      'const g = run.evidence.filter((e) => ["A", "B"].includes(e.event));', // fires
      "const h = turnsOf(run, Transfers.E.Unsure);",
      "const i = run.evidence.flatMap((e) => (e._tag === \"Turn\" ? [e.event] : []));",
      'const j = (e: { _tag: string }) => e._tag === "Turn";',
      "const k = token.ending.event;",
      "// oxlint-disable-next-line flow-state/no-event-name-filter -- a rule over every app's machines",
      "const l = run.evidence.filter((e) => known.has(e.event));",
    ],
    fires: [1, 2, 3, 4, 5, 6],
  },
  "fixtures/shop/stories/planted.ts": {
    text: ['const a = records.filter((e) => e.event === "Add");'],
    fires: [1],
  },
  "src/host/testing/planted.ts": {
    text: ['const a = records.filter((e) => e.event === "Add");'],
    fires: [],
  },
};

inWorkdir(({ pkg, write, lint, lines }) => {
  const placed = (path: string) => join(pkg, path.replace(/planted/u, "no-event-name-filter-planted"));

  for (const [path, { text }] of Object.entries(files)) write(placed(path), `${text.join("\n")}\n`);

  const found = lint();

  for (const [path, { fires }] of Object.entries(files))
    assert.deepEqual(
      lines(found, placed(path), "no-event-name-filter"),
      fires,
      `no-event-name-filter in ${path}`,
    );
});

console.log("flow-state no-event-name-filter tests passed");
