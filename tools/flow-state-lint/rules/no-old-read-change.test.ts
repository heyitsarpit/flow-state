// Planted violations for no-old-read-change, the on-demand finder of the read-change refactor
// (Pending D41), run through oxlint with the rule on.
// Run: node --experimental-strip-types tools/flow-state-lint/rules/no-old-read-change.test.ts
import { plantRules } from "./test-support.ts";

plantRules(
  {
    "no-old-read-change": {
      fires: [
        "const a = { writes: ({ value }) => [history.write({ thread: value.thread }, value)] };",
        "const b = { optimistic: ({ memory }) => [cart.write({ cartId: memory.cartId }, (c) => c)] };",
        "const c = [O.saved.setData(({ memory }) => ({ key: memory.key, data: memory }))];",
        "const d = { writes: ({ value }) => ({ history: { key: value.key, data: value } }) };",
        "const e = { optimistic: function () { return { cart: {} }; } };",
        'const f = run.evidence.filter((x) => Predicate.isTagged(x, "InvalidWrite"));',
        "const g = Act.InvalidWrite({ actor, operation });",
        "const h = history.update({ thread: t }, (current) => { current.messages = []; });",
      ],
      quiet: [
        "const i = { writes: ({ value }) => [history.set({ thread: value.thread }, value)] };",
        "const j = { optimistic: ({ memory }) => [cart.update({ cartId: memory.cartId }, (c) => ({ ...c }))] };",
        "const k = store.write([{ key, value }]);",
        "const l = { writes: true };",
        "const m = history.update({ thread: t }, (current) => { const n = current; return n; });",
        "const o = { writes: ({ value }) => [history.update({ thread: value.t }, (c) => { return { ...c }; })] };",
        'const p = Predicate.isTagged(x, "InvalidUpdate");',
      ],
      silent: [],
    },
  },
  { "flow-state/no-old-read-change": "error" },
);

console.log("flow-state no-old-read-change tests passed");
