// Planted violations for no-raw-event, run through oxlint. The rule decides by path and by call, so each
// place has its own text. `fires` lines are the 1-based lines the rule must report; every other line must
// stay quiet.
// Run: node --experimental-strip-types tools/flow-state-lint/rules/no-raw-event.test.ts
import assert from "node:assert/strict";
import { join } from "node:path";

import { inWorkdir } from "./test-support.ts";

const files: Record<string, { text: ReadonlyArray<string>; fires: ReadonlyArray<number> }> = {
  // A Story file: any `_tag` literal is an event, however it is passed or held.
  "fixtures/shop/stories/planted.ts": {
    text: [
      'story.send(Cart, { _tag: "Add", lineId: "l1" });', // fires
      'const visa = { _tag: "PayRequested", paymentMethodId: "visa" } as const;', // fires
      'const addLine = (n: number) => ({ _tag: "Add", lineId: `l${n}` }) as const;', // fires
      'const events = ["A", "B"].map((tag) => ({ _tag: tag, repo: "r" }));', // fires
      'const values = { quiet: { "_tag": "Quiet", from: 3 } };', // fires
      'story.send(Cart, Cart.E.Add({ lineId: "l1" }));',
      "story.send(Shopper, Shopper.E.SignOut());",
      'const addToken = (n: number) => Cart.E.Add({ lineId: `l${n}` });',
      'const isAdd = (e: { _tag: string }) => e._tag === "Add";',
      'type Tagged = { readonly _tag: "Add" };',
      "const plain = { lineId: 1 };",
      "const computed = { [_tag]: 1 };",
    ],
    fires: [1, 2, 3, 4, 5],
  },
  // A machine file: only a literal inside `send(...)` is an event; domain data may carry a `_tag`.
  "fixtures/sync/machines/planted.ts": {
    text: [
      'const a = send(upstreamOf, { _tag: "Push", sha: "s" });', // fires
      'const b = send(upstreamOf, ({ event }) => ({ _tag: "Push", sha: event.ref }));', // fires
      'const c = machine.send(upstreamOf, () => { return { _tag: "Push", sha: "s" }; });', // fires
      "const d = send(upstreamOf, Mirror.E.Push.from(({ event }) => ({ sha: event.ref })));",
      'const entry = { _tag: "Command", value: "v", label: "l" };',
      'const kept = (e: { _tag: string }) => e._tag === "Group";',
      'const push = (sha: string) => Mirror.E.Push({ sha });',
    ],
    fires: [1, 2, 3],
  },
  // Not Story or machine files: fake servers, adapters, services, tests and the app files.
  "fixtures/shop/server/planted.ts": {
    text: ['const lost = Effect.fail({ _tag: "NoResponse" } as const);', 'send(x, { _tag: "Push" });'],
    fires: [],
  },
  "fixtures/shop/adapters/planted.ts": { text: ['const lost = { _tag: "NoResponse" } as const;'], fires: [] },
  "fixtures/services/shop/server/planted.ts": {
    text: ['const busy = { _tag: "Busy" as const };'],
    fires: [],
  },
  "fixtures/shop/app.ts": { text: ['const e = { _tag: "Add" };'], fires: [] },
  "tests/planted.ts": { text: ['story.send(Cart, { _tag: "Bogus" });'], fires: [] },
  "src/host/testing/planted.ts": { text: ['const e = { _tag: "Add" };'], fires: [] },
  "../../elsewhere/fixtures/shop/stories/planted.ts": { text: ['const e = { _tag: "Add" };'], fires: [] },
};

inWorkdir(({ pkg, write, lint, lines }) => {
  const placed = (path: string) => join(pkg, path.replace(/planted/u, "no-raw-event-planted"));

  for (const [path, { text }] of Object.entries(files)) write(placed(path), `${text.join("\n")}\n`);

  const found = lint();

  for (const [path, { fires }] of Object.entries(files))
    assert.deepEqual(lines(found, placed(path), "no-raw-event"), fires, `no-raw-event in ${path}`);
});

console.log("flow-state no-raw-event tests passed");
