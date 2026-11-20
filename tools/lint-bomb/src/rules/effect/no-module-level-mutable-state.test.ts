import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noModuleLevelMutableStateRule } from "./no-module-level-mutable-state.ts";

const tester = createRuleTester("no-module-level-mutable-state");

tester.run("no-module-level-mutable-state", noModuleLevelMutableStateRule, {
  valid: [
    "let revision = 0; export function advance() { revision += 1; }",
    {
      code: "let revision = 0; export function advance() { revision += 1; }",
      filename: "/application/test/outside.ts",
      options: [{ sourceRoots: ["/application/src"] }],
    },
    {
      code: "let revision = 0; export function advance() { revision += 1; }",
      filename: "/application/src/host/state.ts",
      options: [
        { sourceRoots: ["/application/src"], allowedFiles: ["/application/src/host/state.ts"] },
      ],
    },
    {
      code: "let revision = 0; export function advance() { revision += 1; }",
      filename: "/application/src/host/state.ts",
      options: [
        { sourceRoots: ["/application/src"], allowedDirectories: ["/application/src/host"] },
      ],
    },
    {
      code: "const table = new Map(); table.set('boot', 1); const values = []; values.push(1); function lookup() { return table.get('boot'); }",
      filename: "/application/src/table.ts",
      options: [{ sourceRoots: ["/application/src"] }],
    },
    {
      code: "export function build() { const map = new Map(); map.set('key', 1); const values = []; values.push(1); return values; }",
      filename: "/application/src/build.ts",
      options: [{ sourceRoots: ["/application/src"] }],
    },
    {
      code: "const Map = class { set(_key, _value) {} }; const registry = new Map(); function register() { registry.set('key', 1); }",
      filename: "/application/src/shadowed.ts",
      options: [{ sourceRoots: ["/application/src"] }],
    },
    {
      code: "const state = { set(_key, _value) {} }; function update() { state.set('key', 1); }",
      filename: "/application/src/custom.ts",
      options: [{ sourceRoots: ["/application/src"] }],
    },
    {
      code: "const ids = new Set(); (() => ids.add('boot'))(); function has(id) { return ids.has(id); }",
      filename: "/application/src/init.ts",
      options: [{ sourceRoots: ["/application/src"] }],
    },
    {
      code: "const table = new Map(); function initialize() { table.set('boot', 1); } initialize();",
      filename: "/application/src/direct-initializer.ts",
      options: [{ sourceRoots: ["/application/src"] }],
    },
    {
      code: "const table = new Map(); function initialize() { table.set('boot', 1); return 1; } export const boot = initialize();",
      filename: "/application/src/exported-initialization-result.ts",
      options: [{ sourceRoots: ["/application/src"] }],
    },
    {
      code: "const table = new Map(); const initialize = () => table.set('boot', 1); initialize();",
      filename: "/application/src/arrow-initializer.ts",
      options: [{ sourceRoots: ["/application/src"] }],
    },
    {
      code: "const table = new Map(); (() => { function seed() { table.set('boot', 1); } seed(); })();",
      filename: "/application/src/iife-helper.ts",
      options: [{ sourceRoots: ["/application/src"] }],
    },
    {
      code: "const table = new Map(); function seed() { table.set('boot', 1); } function initialize() { seed(); } initialize();",
      filename: "/application/src/initializer-chain.ts",
      options: [{ sourceRoots: ["/application/src"] }],
    },
    {
      code: "const cache = new Map(); (() => { class Seed { static install() { cache.set('boot', 1); } } Seed.install(); })();",
      filename: "/application/src/class-initializer.ts",
      options: [{ sourceRoots: ["/application/src"] }],
    },
    {
      code: "const cache = new Map(); class Seed { static seed() { cache.set('boot', 1); } static install() { Seed.seed(); } } Seed.install();",
      filename: "/application/src/class-initializer-chain.ts",
      options: [{ sourceRoots: ["/application/src"] }],
    },
    {
      code: "const cache = new Map(); const Seed = class { static install() { cache.set('boot', 1); } }; Seed.install();",
      filename: "/application/src/class-expression-initializer.ts",
      options: [{ sourceRoots: ["/application/src"] }],
    },
    {
      code: "const cache = new Map(); const Seed = class Local { static seed() { cache.set('boot', 1); } static install() { Local.seed(); } }; Seed.install();",
      filename: "/application/src/named-class-expression-initializer.ts",
      options: [{ sourceRoots: ["/application/src"] }],
    },
    {
      code: "import { Layer } from 'effect'; const description = Layer.succeed({ register() {} });",
      filename: "/application/src/layer.ts",
      options: [{ sourceRoots: ["/application/src"] }],
    },
    {
      code: "import { Context, Effect, Layer } from 'effect'; class Registry extends Context.Service<Registry, { add: (id: string) => Effect.Effect<void> }>()('Registry') {} export const layer = Layer.effect(Registry, Effect.sync(() => { const ids = new Set<string>(); return Registry.of({ add: (id) => Effect.sync(() => { ids.add(id); }) }); }));",
      filename: "/application/src/layer-local-state.ts",
      options: [{ sourceRoots: ["/application/src"] }],
    },
    {
      code: "const registry = new Map(); function register(registry) { registry.set('key', 1); }",
      filename: "/application/src/shadowed-binding.ts",
      options: [{ sourceRoots: ["/application/src"] }],
    },
    {
      code: "const registry = new Map(); function replace() { let alias = registry; alias = new Map(); alias.set('key', 1); }",
      filename: "/application/src/reassigned-local-alias.ts",
      options: [{ sourceRoots: ["/application/src"] }],
    },
  ],
  invalid: [
    {
      code: "let revision = 0; export function advance() { revision += 1; }",
      filename: "/application/src/runtime/state.ts",
      options: [{ sourceRoots: ["/application/src"] }],
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "import { Effect } from 'effect'; let revision = 0; export const advance = () => Effect.sync(() => revision++);",
      filename: "/application/src/effect-state.ts",
      options: [{ sourceRoots: ["/application/src"] }],
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "export const registry = new Map(); export function register(key, value) { registry.set(key, value); registry.delete(key); registry.clear(); }",
      filename: "/application/src/map-state.ts",
      options: [{ sourceRoots: ["/application/src"] }],
      errors: [
        { messageId: "moduleState" },
        { messageId: "moduleState" },
        { messageId: "moduleState" },
      ],
    },
    {
      code: "const ids = new Set(); export function register(id) { ids.add(id); ids.delete(id); ids.clear(); }",
      filename: "/application/src/set-state.ts",
      options: [{ sourceRoots: ["/application/src"] }],
      errors: [
        { messageId: "moduleState" },
        { messageId: "moduleState" },
        { messageId: "moduleState" },
      ],
    },
    {
      code: "const values = []; export function write(index) { values.push(index); values[index] = 1; values.length = index; }",
      filename: "/application/src/array-state.ts",
      options: [{ sourceRoots: ["/application/src"] }],
      errors: [
        { messageId: "moduleState" },
        { messageId: "moduleState" },
        { messageId: "moduleState" },
      ],
    },
    {
      code: "const registry = new Map(); const alias = registry; function register() { alias.set('key', 1); }",
      filename: "/application/src/alias.ts",
      options: [{ sourceRoots: ["/application/src"] }],
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "const registry = new Map(); function register() { const alias = registry; alias.set('key', 1); }",
      filename: "/application/src/local-alias.ts",
      options: [{ sourceRoots: ["/application/src"] }],
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "let revision = 0; export function advance() { revision++; }",
      filename: "/application/src/one-file.ts",
      options: [{ applicationFiles: ["/application/src/one-file.ts"] }],
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "const ids = new Set(); const iterator = (function* () { ids.add('later'); })(); export { iterator };",
      filename: "/application/src/generator-iife.ts",
      options: [{ sourceRoots: ["/application/src"] }],
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "const ids = new Set(); export const pending = (async () => { await Promise.resolve(); ids.add('later'); })();",
      filename: "/application/src/async-iife.ts",
      options: [{ sourceRoots: ["/application/src"] }],
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "const table = new Map(); function initialize() { table.set('later', 1); } export const deferred = initialize;",
      filename: "/application/src/escaped-initializer.ts",
      options: [{ sourceRoots: ["/application/src"] }],
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "const table = new Map(); export function initialize() { table.set('later', 1); } initialize();",
      filename: "/application/src/exported-initializer.ts",
      options: [{ sourceRoots: ["/application/src"] }],
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "const table = new Map(); function seed() { table.set('later', 1); } seed(); export function process() { seed(); }",
      filename: "/application/src/application-call.ts",
      options: [{ sourceRoots: ["/application/src"] }],
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "const table = new Map(); class Seed { static install() { table.set('later', 1); } } Seed.install(); export function process() { Seed.install(); }",
      filename: "/application/src/class-application-call.ts",
      options: [{ sourceRoots: ["/application/src"] }],
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "const table = new Map(); class Seed { static install() { table.set('later', 1); } } export const install = Seed.install; install();",
      filename: "/application/src/class-method-escape.ts",
      options: [{ sourceRoots: ["/application/src"] }],
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "const table = new Map(); class Seed { static async install() { table.set('later', 1); } } Seed.install();",
      filename: "/application/src/async-class-initializer.ts",
      options: [{ sourceRoots: ["/application/src"] }],
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "const table = new Map(); function seed() { table.set('later', 1); } setTimeout(() => seed(), 0);",
      filename: "/application/src/deferred-call.ts",
      options: [{ sourceRoots: ["/application/src"] }],
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "const table = new Map(); async function initialize() { table.set('later', 1); } initialize();",
      filename: "/application/src/async-helper.ts",
      options: [{ sourceRoots: ["/application/src"] }],
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "const table = new Map(); function initialize() { table.set('later', 1); } export class C { field = initialize(); }",
      filename: "/application/src/instance-field-call.ts",
      options: [{ sourceRoots: ["/application/src"] }],
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "const table = new Map(); class Seed { static install() { table.set('later', 1); } } const escaped = Seed; escaped.install();",
      filename: "/application/src/class-escape.ts",
      options: [{ sourceRoots: ["/application/src"] }],
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "const table = new Map(); export class Seed { static install() { table.set('later', 1); } } Seed.install();",
      filename: "/application/src/exported-class.ts",
      options: [{ sourceRoots: ["/application/src"] }],
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "const table = new Map(); class Seed { static first() { table.set('later', 1); Seed.second(); } static second() { Seed.first(); } } Seed.first();",
      filename: "/application/src/class-initialization-cycle.ts",
      options: [{ sourceRoots: ["/application/src"] }],
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "const table = new Map(); const Seed = class { static install() { table.set('later', 1); } }; Seed.install(); export function process() { Seed.install(); }",
      filename: "/application/src/class-expression-application-call.ts",
      options: [{ sourceRoots: ["/application/src"] }],
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "const table = new Map(); const Seed = class { static async install() { table.set('later', 1); } }; Seed.install();",
      filename: "/application/src/async-class-expression-initializer.ts",
      options: [{ sourceRoots: ["/application/src"] }],
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "const table = new Map(); const Seed = class { static install() { table.set('later', 1); } }; export const install = Seed.install; install();",
      filename: "/application/src/class-expression-method-escape.ts",
      options: [{ sourceRoots: ["/application/src"] }],
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "const table = new Map(); export const Seed = class { static install() { table.set('later', 1); } }; Seed.install();",
      filename: "/application/src/exported-class-expression.ts",
      options: [{ sourceRoots: ["/application/src"] }],
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "const table = new Map(); let Seed = class { static install() { table.set('later', 1); } }; Seed.install();",
      filename: "/application/src/reassigned-class-expression-binding.ts",
      options: [{ sourceRoots: ["/application/src"] }],
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "const table = new Map(); const Seed = class Local { static first() { table.set('later', 1); Local.second(); } static second() { Local.first(); } }; Seed.first();",
      filename: "/application/src/class-expression-initialization-cycle.ts",
      options: [{ sourceRoots: ["/application/src"] }],
      errors: [{ messageId: "moduleState" }],
    },
  ],
});

tester.run("no-module-level-mutable-state-var-and-patterns", noModuleLevelMutableStateRule, {
  valid: [
    {
      code: 'export function advance() { var count = 0; count++; [count] = [1]; }',
      filename: "/app/src/domain.ts",
      options: [{ sourceRoots: ["/app/src"] }],
    },
    {
      code: 'var count = 0; function initialize() { [count] = [1]; } initialize();',
      filename: "/app/src/domain.ts",
      options: [{ sourceRoots: ["/app/src"] }],
    },
    {
      code: 'let count = 0; export function advance(count) { [count] = [1]; }',
      filename: "/app/src/domain.ts",
      options: [{ sourceRoots: ["/app/src"] }],
    },
  ],
  invalid: [
    {
      code: 'var count = 0; export function advance() { count++; }',
      filename: "/app/src/domain.ts",
      options: [{ sourceRoots: ["/app/src"] }],
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: 'let count = 0; export function advance() { [count] = [1]; }',
      filename: "/app/src/domain.ts",
      options: [{ sourceRoots: ["/app/src"] }],
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: 'var count = 0; export function advance() { ({value: [count = 1]} = source); }',
      filename: "/app/src/domain.ts",
      options: [{ sourceRoots: ["/app/src"] }],
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: 'let count = 0; export function advance() { [...count] = source; }',
      filename: "/app/src/domain.ts",
      options: [{ sourceRoots: ["/app/src"] }],
      errors: [{ messageId: "moduleState" }],
    },
  ],
});
