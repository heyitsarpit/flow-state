import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noStatefulEffectConstructionRule } from "./no-stateful-effect-construction.ts";

const tester = createRuleTester("no-stateful-effect-construction");

tester.run("no-stateful-effect-construction", noStatefulEffectConstructionRule, {
  valid: [
    'import { Effect } from "effect"; const items = new Map(); const fn = Effect.fnUntracedEager(function* (condition: boolean) { leave: { switch (condition) { case true: yield* Effect.sleep(1); break leave; default: yield* Effect.sleep(1); } } items.set("a", 1); yield* Effect.void; });',
    'import { Effect } from "effect"; const items = new Map(); const fn = Effect.fnUntracedEager(function* (condition: boolean) { leave: { switch (condition) { case true: break leave; default: yield* Effect.sleep(1); } items.set("a", 1); } yield* Effect.void; });',

    'import { Effect } from "effect"; const items = new Map(); const inspect = () => { items.clear(); return Effect.isEffect(value); };',
    'import { Effect } from "effect"; let count = 0; const run = () => { count++; return Effect.runSync(Effect.succeed(1)); };',
    'import { Effect } from "effect"; const items = new Map(); const getConstructor = () => { items.clear(); return Effect.succeed; };',
    'import { Effect } from "effect"; let count = 0; const make = () => Effect.succeed(++count);',
    'import { Effect } from "effect"; const make = () => Effect.succeed(state.value = next);',
    'import { Effect } from "effect"; const make = () => Effect.succeed(format(++state.count));',
    'import { Effect, Deferred } from "effect"; function make(): Effect.Effect<Deferred.Deferred<void>> { return Deferred.make<void>(); }',
    'import { Effect, Scope } from "effect"; function make(): Effect.Effect<Scope.Scope> { return Scope.make(); }',
    'import { Effect, Ref } from "effect"; const make = () => Ref.make(0);',
    'import { Effect } from "effect"; declare const queue: { offerUnsafe(value: string): void }; function make(): Effect.Effect<void> { queue.offerUnsafe("value"); return Effect.void; }',
    'import { Effect } from "effect"; declare const state: { setUnsafe(key: string, value: number): void }; const make = () => { state.setUnsafe("key", 1); return Effect.void; };',
    'import { Effect } from "effect"; function make() { const items = new Map(); items.set("a", 1); return Effect.succeed(items); }',
    'import { Effect } from "effect"; function make() { { let count = 0; count++; const items = new Map(); items.set("a", count); return Effect.succeed(items); } }',
    'import { Effect } from "effect"; const items = new Map(); const register = () => Effect.sync(() => { items.set("a", 1); });',
    'import { Effect } from "effect"; const items = new Set(); const register = () => Effect.suspend(() => { items.add("a"); return Effect.void; });',
    'import { Effect } from "effect"; const items = new Map(); const make = () => { function factory(again: boolean): Effect.Effect<void> { if (again) return factory(false); items.set("a", 1); return Effect.void; } return Effect.suspend(factory); };',
    'import { Effect } from "effect"; const items = new Map(); const register = () => Effect.acquireUseRelease(Effect.void, () => { items.set("a", 1); return Effect.void; }, () => { items.delete("a"); return Effect.void; });',
    'import { Effect } from "effect"; const items = new Map(); const acquire = () => Effect.acquireRelease(Effect.void, () => { items.clear(); return Effect.void; });',
    'import { Effect } from "effect"; const items = new Map(); const acquire = () => Effect.acquireRelease(Effect.void, () => { items.clear(); return Effect.void; }, { interruptible: true });',
    'import { Effect } from "effect"; const items = new Map(); const register = () => Effect.forEach([1], () => { items.set("a", 1); return Effect.void; }, { concurrency: 1 });',
    'import { Effect } from "effect"; const items = new Map(); const make = () => Effect.try({ try: () => { items.set("a", 1); return Effect.void; }, catch: error => error });',
    'import { Effect } from "effect"; const items = new Map(); const make = () => { const factory = () => { items.set("a", 1); return Effect.void; }; return Effect.suspend(factory); };',
    'import { Effect } from "effect"; const items = new Map(); const make = () => { function factory() { items.set("a", 1); return Effect.void; } return Effect.suspend(factory); };',
    'import { Effect } from "effect"; const items = new Map(); const make = () => { const factory = () => { items.set("a", 1); return Effect.void; }; return Effect.sync(factory); };',
    'import { Effect } from "effect"; const items = new Map(); const register = Effect.fn("register")(() => { items.set("a", 1); return Effect.void; });',
    'import { Effect } from "effect"; const items = new Map(); const register = Effect.fnUntraced(function* () { items.set("a", 1); yield* Effect.void; });',
    'import { Effect } from "effect"; const items = []; const register = Effect.gen(function* () { items.push("a"); yield* Effect.void; });',
    'import { Effect } from "effect"; const items = new Map(); const register = Effect.fnUntracedEager(function* () { yield* Effect.sleep(1); items.set("a", 1); yield* Effect.void; });',
    'import { Effect } from "effect"; const items = new Map(); const register = Effect.fnUntracedEager(function* () { if (condition) { yield* Effect.sleep(1); items.set("a", 1); } yield* Effect.void; });',
    'import { Effect } from "effect"; const items = new Map(); const register = Effect.fnUntracedEager(function* () { if (condition) yield* Effect.sleep(1); else yield* Effect.sleep(2); items.set("a", 1); yield* Effect.void; });',
    'import { Effect } from "effect"; const items = new Map(); const register = Effect.fnUntracedEager(function* (condition: boolean) { switch (condition) { case true: yield* Effect.sleep(1); break; default: yield* Effect.sleep(2); } items.set("a", 1); yield* Effect.void; });',
    'import { Effect } from "effect"; const items = new Map(); const register = Effect.fnUntracedEager(function* (condition: boolean) { switch (condition) { case true: yield* Effect.sleep(1); default: yield* Effect.sleep(2); } items.set("a", 1); yield* Effect.void; });',
    'import { Effect } from "effect"; const items = new Map(); const register = Effect.fnUntracedEager(function* (condition: boolean) { switch (condition) { case true: case false: yield* Effect.sleep(1); break; default: yield* Effect.sleep(2); } items.set("a", 1); yield* Effect.void; });',
    'import { Effect } from "effect"; const items = new Map(); const register = Effect.fnUntracedEager(function* (condition: boolean) { switch (condition) { default: yield* Effect.sleep(2); case true: yield* Effect.sleep(1); break; } items.set("a", 1); yield* Effect.void; });',
    'import { Effect } from "effect"; const items = new Map(); run.pipe(Effect.flatMap(() => { items.set("a", 1); return Effect.void; }));',
    'import { Effect } from "effect"; const items = new Map(); const read = () => { items.get("a"); return Effect.void; };',
    'import { Effect } from "effect"; const items = new Set(); const read = () => { items.has("a"); return Effect.void; };',
    'import { Effect } from "effect"; const items = []; const read = () => { items.slice(); return Effect.void; };',
    'import { Effect } from "effect"; const items = getCustomCollection(); const make = () => { items.set("a", 1); return Effect.void; };',
    'import { Effect } from "effect"; function factory(Map) { const items = new Map(); return () => { items.set("a", 1); return Effect.void; }; }',
    'import { Effect } from "effect"; function factory(Set) { const items = new Set(); return () => { items.add("a"); return Effect.void; }; }',
    'import { Effect } from "effect"; const items = new Map(); function make(items) { items.set("a", 1); return Effect.void; }',
    'import { Effect } from "effect"; let items = new Map(); items = custom; const make = () => { items.set("a", 1); return Effect.void; };',
    'import { Effect } from "effect"; const items = new Map(); const make = () => { items.set("a", 1); return "done"; };',
    "declare const task: { await(): string }; function make(): () => string { let value = 0; return () => { value = 1; return task.await(); }; }",
  ],
  invalid: [
    {
      code: 'import { Effect } from "effect"; const items = new Map(); const fn = Effect.fnUntracedEager(function* (condition: boolean) { leave: { switch (condition) { case true: break leave; default: yield* Effect.sleep(1); } } items.set("a", 1); yield* Effect.void; });',
      errors: [{ messageId: "construction" }],
    },

    {
      code: 'import { Effect } from "effect"; const items = new Map(); const make = () => Effect.succeed(items.set("a", 1));',
      errors: [{ messageId: "construction" }],
    },
    {
      code: 'import { Effect, Deferred } from "effect"; function make(): () => Effect.Effect<void> { let completion; return () => { completion = Deferred.makeUnsafe(); return Effect.void; }; }',
      errors: [{ messageId: "construction" }],
    },
    {
      code: 'import { Effect } from "effect"; let revision = 0; function make(): Effect.Effect<void> { revision += 1; return Effect.void; }',
      errors: [{ messageId: "construction" }],
    },
    {
      code: 'import { Effect } from "effect"; const items = new Map(); const make = () => { items.set("a", 1); return Effect.void; };',
      errors: [{ messageId: "construction" }],
    },
    {
      code: 'import { Effect } from "effect"; const items = new Map(); const make = () => { items.delete("a"); return Effect.void; };',
      errors: [{ messageId: "construction" }],
    },
    {
      code: 'import { Effect } from "effect"; const items = new Set(); const make = () => { items.add("a"); return Effect.void; };',
      errors: [{ messageId: "construction" }],
    },
    {
      code: 'import { Effect } from "effect"; const items = new Set(); const make = () => { items.clear(); return Effect.void; };',
      errors: [{ messageId: "construction" }],
    },
    {
      code: 'import { Effect } from "effect"; const items = []; const make = () => { items.push("a"); return Effect.void; };',
      errors: [{ messageId: "construction" }],
    },
    {
      code: 'import { Effect } from "effect"; const items = new Array(); const make = () => { items.pop(); return Effect.void; };',
      errors: [{ messageId: "construction" }],
    },
    {
      code: 'import { Effect } from "effect"; const items = new Map(); const make = () => { items["set"]("a", 1); return Effect.void; };',
      errors: [{ messageId: "construction" }],
    },
    {
      code: 'import { Effect, Layer } from "effect"; const layer = Layer.effect(Registry, Effect.sync(() => { const members = new Map(); const register = member => { members.set(member.id, member); return Effect.void; }; return Registry.of({ register }); }));',
      errors: [{ messageId: "construction" }],
    },
    {
      code: 'import { Effect } from "effect"; const items = new Map(); const workflow = Effect.gen(function* () { return () => { items.set("a", 1); return Effect.void; }; });',
      errors: [{ messageId: "construction" }],
    },
    {
      code: 'import { Effect } from "effect"; const items = new Map(); const other = { gen: factory => factory }; other.gen(() => { items.set("a", 1); return Effect.void; });',
      errors: [{ messageId: "construction" }],
    },
    {
      code: 'import { Effect } from "effect"; const items = new Map(); const register = Effect.fnUntracedEager(function* () { items.set("a", 1); yield* Effect.void; });',
      errors: [{ messageId: "construction" }],
    },
    {
      code: 'import { Effect } from "effect"; const items = new Map(); const register = Effect.fnUntracedEager(function* () { yield* Effect.succeed(1); items.set("a", 1); yield* Effect.void; });',
      errors: [{ messageId: "construction" }],
    },
    {
      code: 'import { Effect } from "effect"; const items = new Map(); const register = Effect.fnUntracedEager(function* () { if (condition) { yield* Effect.sleep(1); } items.set("a", 1); yield* Effect.void; });',
      errors: [{ messageId: "construction" }],
    },
    {
      code: 'import { Effect } from "effect"; const items = new Map(); const register = Effect.fnUntracedEager(function* () { if (condition) yield* Effect.sleep(1); else yield* Effect.succeed(1); items.set("a", 1); yield* Effect.void; });',
      errors: [{ messageId: "construction" }],
    },
    {
      code: 'import { Effect } from "effect"; const items = new Map(); const register = Effect.fnUntracedEager(function* (condition: boolean) { switch (condition) { case true: yield* Effect.sleep(1); break; } items.set("a", 1); yield* Effect.void; });',
      errors: [{ messageId: "construction" }],
    },
    {
      code: 'import { Effect } from "effect"; const items = new Map(); const register = Effect.fnUntracedEager(function* (condition: boolean) { switch (condition) { case true: break; default: yield* Effect.sleep(1); } items.set("a", 1); yield* Effect.void; });',
      errors: [{ messageId: "construction" }],
    },
    {
      code: 'import { Effect } from "effect"; const items = new Map(); const register = Effect.fnUntracedEager(function* (condition: boolean) { leave: switch (condition) { case true: break leave; default: yield* Effect.sleep(1); } items.set("a", 1); yield* Effect.void; });',
      errors: [{ messageId: "construction" }],
    },
    {
      code: 'import { Effect } from "effect"; const items = new Map(); const register = Effect.fnUntracedEager(function* (condition: 1 | 2) { switch (condition) { case 1: yield* Effect.sleep(1); case 2: items.set("a", 1); yield* Effect.void; } });',
      errors: [{ messageId: "construction" }],
    },
    {
      code: 'import { Effect } from "effect"; const items = new Map(); const register = Effect.fnUntracedEager(function* (condition: boolean) { switch (condition) { case true: case false: items.set("a", 1); yield* Effect.sleep(1); break; default: yield* Effect.sleep(2); } });',
      errors: [{ messageId: "construction" }],
    },
    {
      code: 'import { Effect } from "effect"; const items = new Map(); const register = Effect.fnUntracedEager(function* (condition: boolean) { switch (condition) { default: break; case true: yield* Effect.sleep(1); } items.set("a", 1); yield* Effect.void; });',
      errors: [{ messageId: "construction" }],
    },
    {
      code: 'import { Effect } from "effect"; const items = new Map(); const make = () => { const factory = () => { items.set("a", 1); return Effect.void; }; Effect.suspend(factory); factory(); return Effect.void; };',
      errors: [{ messageId: "construction" }],
    },
    {
      code: 'import { Effect } from "effect"; const items = new Map(); const make = () => { const factory = () => { items.set("a", 1); return Effect.void; }; Effect.suspend(factory); use(factory); return Effect.void; };',
      errors: [{ messageId: "construction" }],
    },
    {
      code: 'import { Effect } from "effect"; const items = new Map(); const make = () => { let factory = () => { items.set("a", 1); return Effect.void; }; Effect.suspend(factory); factory = () => Effect.void; return Effect.void; };',
      errors: [{ messageId: "construction" }],
    },
    {
      code: 'import { Effect } from "effect"; const items = new Map(); const make = () => { function factory() { items.set("a", 1); return Effect.void; } Effect.suspend(factory); factory = () => Effect.void; return Effect.void; };',
      errors: [{ messageId: "construction" }],
    },
    {
      code: 'import { Effect } from "effect"; const items = new Map(); export function factory() { items.set("a", 1); return Effect.void; } const make = () => Effect.suspend(factory);',
      errors: [{ messageId: "construction" }],
    },
  ],
});

tester.run("resource-acquisition-construction", noStatefulEffectConstructionRule, {
  valid: [
    'import { Effect } from "effect"; const resource = Effect.acquireRelease(Effect.sync(() => new Socket()), close);',
    'import { Effect } from "effect"; const resource = Effect.acquireRelease(Effect.try({ try: () => open(), catch: error => error }), close);',
    'import { Effect } from "effect"; const resource = Effect.acquireRelease(Effect.sync(() => { const socket = new Socket(); return socket; }), close);',
    'import { Effect } from "effect"; const own = (handle: Socket) => Effect.acquireRelease(Effect.succeed(handle), close);',
    'import { Effect } from "effect"; const resource = Effect.acquireRelease(Effect.succeed(1), close);',
    'import { Effect } from "effect"; const lazy = Effect.sync(open); const resource = Effect.acquireRelease(Effect.succeed(lazy), close);',
    "const Effect = custom; const resource = Effect.acquireRelease(Effect.succeed(new Socket()), close);",
    {
      filename: "/project/resource.test.ts",
      code: 'import { Effect } from "effect"; const resource = Effect.acquireRelease(Effect.succeed(new Socket()), close);',
    },
  ],
  invalid: [
    {
      code: 'import { Effect } from "effect"; const resource = Effect.acquireRelease(Effect.succeed(new Socket()), close);',
      errors: [{ messageId: "acquisition" }],
    },
    {
      code: 'import { Effect } from "effect"; const socket = new Socket(); const resource = Effect.acquireRelease(Effect.succeed(socket), close);',
      errors: [{ messageId: "acquisition" }],
    },
    {
      code: 'import { Effect as E } from "effect"; const socket = open(); const alias = socket; const resource = E.acquireRelease(E.sync(() => alias), close);',
      errors: [{ messageId: "acquisition" }],
    },
    {
      code: 'import { Effect } from "effect"; const socket = open(); const resource = Effect.acquireRelease(Effect.sync(() => { return socket; }), close);',
      errors: [{ messageId: "acquisition" }],
    },
    {
      code: 'import { acquireRelease, succeed } from "effect/Effect"; const resource = acquireRelease(succeed(open()), close);',
      errors: [{ messageId: "acquisition" }],
    },
    {
      code: 'import { Effect } from "effect"; const resource = Effect.acquireUseRelease(Effect.succeed(new Socket()), use, close);',
      errors: [{ messageId: "acquisition" }],
    },
  ],
});

tester.run("resource-acquisition-controls", noStatefulEffectConstructionRule, {
  valid: [
    'import { acquireRelease, succeed, sync } from "effect/Effect"; const lazy = sync(open); const resource = acquireRelease(succeed(lazy), close);',
    'import { Effect } from "effect"; let handle = new Socket(); handle = passed; const resource = Effect.acquireRelease(Effect.succeed(handle), close);',
    'import { Effect } from "effect"; const handle = external; const resource = Effect.acquireRelease(Effect.sync(() => handle), close);',
    'import { Effect } from "effect"; const resource = Effect.acquireRelease(Effect.sync(() => open()), close);',
    'import { Effect } from "effect"; function own(handle: Socket) { return Effect.acquireRelease(Effect.sync(() => handle), close); }',
  ],
  invalid: [
    {
      code: 'import { Effect } from "effect"; const resource = Effect.acquireRelease(Effect.succeed(open()), close);',
      errors: [{ messageId: "acquisition" }],
    },
  ],
});
