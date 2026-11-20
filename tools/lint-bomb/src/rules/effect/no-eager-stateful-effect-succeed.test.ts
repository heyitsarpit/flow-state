import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noEagerStatefulEffectSucceedRule } from "./no-eager-stateful-effect-succeed.ts";

const tester = createRuleTester("no-eager-stateful-effect-succeed");

tester.run("no-eager-stateful-effect-succeed", noEagerStatefulEffectSucceedRule, {
  valid: [
    'import { Effect } from "effect"; Effect.succeed(false);',
    'import { Effect } from "effect"; Effect.succeed({ value: 1 });',
    'import { Effect } from "effect"; Effect.sync(() => ++state.count);',
    'import { Effect } from "effect"; Effect.succeed(queue.offerUnsafe(value));',
    'import { Effect } from "effect"; Effect.succeed(queue["offerUnsafe"](item));',
    'import { Effect } from "effect"; const offer = queue.offerUnsafe; Effect.succeed(offer(item));',
    'import { Effect } from "effect"; function mutate() { state.value = next; return next; } Effect.succeed(mutate());',
    'import { Effect } from "effect"; const build = () => { const result = {}; result.value = 1; return result; }; Effect.succeed(build());',
    'import { Effect } from "effect"; function make() { const result = { count: 0 }; return Effect.succeed(++result.count); }',
    'import { Effect } from "effect"; function make() { let count = 0; return Effect.succeed(++count); }',
    'import { Effect } from "effect"; function make() { const state = {}; { return Effect.succeed(state.value = 1); } }',
    'import { Effect } from "effect"; function make() { let count = 0; return Effect.succeed(([count] = [1])); }',
    'import { Effect } from "effect"; function make() { let count = 0; return Effect.succeed(({ count } = input)); }',
    'import { Effect } from "effect"; function make() { let count = 0; return Effect.succeed(({ count = 1 } = input)); }',
    'import { Effect } from "effect"; function make() { let count = 0; return Effect.succeed(([[{ count }]] = input)); }',
    'import { Effect } from "effect"; function make() { let rest = []; return Effect.succeed(([...rest] = input)); }',
    'import { Effect } from "effect"; function make() { let rest = {}; return Effect.succeed(({ ...rest } = input)); }',
    'import { Effect } from "effect"; function make() { let local = 0; return Effect.succeed(([local] = [1])); }',
    'import { Effect } from "effect"; const make = () => Effect.sync(() => ([count] = [1]));',
    'import { Effect } from "effect"; Effect.gen(function* () { return yield* Effect.succeed(++state.count); });',
    'import { Effect } from "effect"; Effect.gen({ self: {} }, function* () { return yield* Effect.succeed(++state.count); });',
    'import { Effect } from "effect"; Effect.fn("run")(function* () { return yield* Effect.succeed(++state.count); });',
    'import { Effect } from "effect"; Effect.fnUntraced(function* () { return yield* Effect.succeed(++state.count); });',
    'import { Effect } from "effect"; Effect.sync(() => Effect.succeed(++state.count));',
    'import { Effect } from "effect"; Effect.suspend(() => Effect.succeed(++state.count));',
    'import { Effect } from "effect"; run.pipe(Effect.flatMap(() => Effect.succeed(++state.count)));',
    'import { Effect } from "effect"; run.pipe(Effect.map(() => Effect.succeed(++state.count)));',
    'import { Effect } from "effect"; run.pipe(Effect.tap(() => Effect.succeed(++state.count)));',
    'import { Effect } from "effect"; Effect.succeed(() => ++state.count);',
    'import { Effect, Ref } from "effect"; Effect.succeed(Ref.make(0));',
    'import { Effect } from "effect"; function make(Effect) { return Effect.succeed(++state.count); }',
    'import { flatMap, succeed } from "effect/Effect"; flatMap(run, () => succeed(++state.count));',
    'import { succeed } from "effect/Effect"; function local(succeed) { succeed(++state.count); }',
    "const Effect = { succeed: value => value }; Effect.succeed(++state.count);",
    {
      code: 'import { Effect } from "effect"; Effect.succeed(++state.count);',
      filename: "/project/example.test.ts",
    },
  ],
  invalid: [
    {
      code: 'import { succeed } from "effect/Effect"; succeed(++state.count);',
      errors: [{ messageId: "eager" }],
    },
    {
      code: 'import { Effect } from "effect"; const succeed = Effect.succeed; succeed(++state.count);',
      errors: [{ messageId: "eager" }],
    },
    {
      code: 'import { Effect } from "effect"; Effect.fnUntracedEager(function* () { return yield* Effect.succeed(++state.count); });',
      errors: [{ messageId: "eager" }],
    },
    {
      code: 'import { Effect } from "effect"; Effect.succeed(state.value = next);',
      errors: [{ messageId: "eager" }],
    },
    {
      code: 'import { Effect } from "effect"; Effect.succeed(state.revision++);',
      errors: [{ messageId: "eager" }],
    },
    {
      code: 'import { Effect } from "effect"; let count = 0; Effect.fn("run")(function* () { yield* Effect.void; }, (effect) => Effect.succeed(++count));',
      errors: [{ messageId: "eager" }],
    },
    {
      code: 'import { Effect } from "effect"; let count = 0; const make = () => Effect.succeed(++count);',
      errors: [{ messageId: "eager" }],
    },
    {
      code: 'import { Effect } from "effect"; const make = state => Effect.succeed(++state.count);',
      errors: [{ messageId: "eager" }],
    },
    {
      code: 'import { Effect } from "effect"; const state = {}; const make = () => Effect.succeed(state.value = next);',
      errors: [{ messageId: "eager" }],
    },
    {
      code: 'import { Effect as E } from "effect"; E["succeed"]({ value: ++state.count });',
      errors: [{ messageId: "eager" }],
    },
    {
      code: 'import { Effect } from "effect"; Effect.succeed(format(++state.count));',
      errors: [{ messageId: "eager" }],
    },
    {
      code: 'import { Effect } from "effect"; Effect.succeed([++state.count, state.value = next]);',
      errors: [{ messageId: "eager" }],
    },
    {
      code: 'import { Effect } from "effect"; let count = 0; const make = () => Effect.succeed(([count] = [1]));',
      errors: [{ messageId: "eager" }],
    },
    {
      code: 'import { Effect } from "effect"; let count = 0; const make = () => Effect.succeed(({ count } = input));',
      errors: [{ messageId: "eager" }],
    },
    {
      code: 'import { Effect } from "effect"; let count = 0; const make = () => Effect.succeed(({ count = 1 } = input));',
      errors: [{ messageId: "eager" }],
    },
    {
      code: 'import { Effect } from "effect"; let state = { count: 0 }; const make = () => Effect.succeed(({ count: state.count } = input));',
      errors: [{ messageId: "eager" }],
    },
    {
      code: 'import { Effect } from "effect"; let rest = []; const make = () => Effect.succeed(([...rest] = input));',
      errors: [{ messageId: "eager" }],
    },
    {
      code: 'import { Effect } from "effect"; let rest = {}; const make = () => Effect.succeed(({ ...rest } = input));',
      errors: [{ messageId: "eager" }],
    },
    {
      code: 'import { Effect } from "effect"; Effect.gen(function* () { return () => Effect.succeed(++state.count); });',
      errors: [{ messageId: "eager" }],
    },
    {
      code: 'import { Effect } from "effect"; function make() { const state = { count: 0 }; return () => Effect.succeed(++state.count); }',
      errors: [{ messageId: "eager" }],
    },
    {
      code: 'import { Effect } from "effect"; const other = { gen: factory => factory }; other.gen(() => Effect.succeed(++state.count));',
      errors: [{ messageId: "eager" }],
    },
  ],
});
