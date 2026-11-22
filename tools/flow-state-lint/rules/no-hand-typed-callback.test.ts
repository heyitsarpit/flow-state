// Planted hand types for no-hand-typed-callback, run through oxlint with the options vite.config.ts
// gives it: the shapes it must report (an ending mapper's typed parameter, a destructured event or
// memory typed by a literal or a hand alias, a memory parameter typed by a literal) and the ones it
// must leave (derived types, local aliases of them, `loose(...)`, a type test's refusal).
// Run: node --experimental-strip-types tools/flow-state-lint/rules/no-hand-typed-callback.test.ts
import { plantRules } from "./test-support.ts";

plantRules({
  "no-hand-typed-callback": {
    fires: [
      "const a = E.Done.from((v: { readonly receipt: string }) => ({ receipt: v.receipt }));",
      "const b = E.Declined.from((e: Declined) => ({ code: e.code }));",
      "const c = ({ event }: { readonly event: { readonly repo: string } }) => ({ repo: event.repo });",
      "const d = ({ memory }: { readonly memory: { readonly account: string } }) => memory.account;",
      "const e = ({ memory }: { readonly memory: Copied }) => memory.n;",
      "function f({ event }: { event: { id: string } }) { return event.id; }",
      "const g = (memory: { readonly n: number }) => memory.n;",
      "const h = O.x.commit(({ event, memory }: { readonly event: { a: string }; readonly memory: Hand }) => event.a);",
      "const i = Mirror.E.Push.from(({ sha }: { readonly sha: string }) => ({ sha, hops: 0 }));",
    ],
    quiet: [
      "type Copied = { readonly n: number };",
      "type Derived = typeof Room.Memory.Type;",
      "type Again = Derived;",
      "const j = E.Done.from((v) => ({ receipt: v.receipt }));",
      "const k = E.Changed.from((account: typeof Order.M.account.Type) => ({ account }));",
      "const l = ({ event }: { readonly event: typeof Sync.E.SyncRepo.Type }) => ({ repo: event.repo });",
      "const m = ({ memory }: { readonly memory: Again }) => memory.n;",
      "const n = (memory: typeof Cart.Memory.Type) => memory.n;",
      'const o = ({ memory, now }: { readonly memory: Pick<typeof Room.Memory.Type, "room">; readonly now: number }) => now;',
      "const p = loose(({ memory }: { memory: { n: number } }) => memory.n);",
      "const q = E.Tick.from(loose(({ key }: { key: { id: string } }) => ({ id: key.id })));",
      "const r = (memory: Readonly<Record<string, unknown>>) => memory;",
      "const s = ({ key }: { readonly key: { id: string } }) => key.id;",
      "// @ts-expect-error a type test's refusal, written wrong on purpose",
      "const t = E.Done.from((v: { receiptt: number }) => ({ receipt: v.receiptt }));",
    ],
    silent: ["src/core/planted.ts", "src/core/deep/planted.ts", "src/host/planted.ts", "src/host/platform/planted.ts"],
  },
});

console.log("flow-state no-hand-typed-callback tests passed");
