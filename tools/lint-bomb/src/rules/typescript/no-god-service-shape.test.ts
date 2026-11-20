import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noGodServiceShapeRule } from "./no-god-service-shape.ts";

const tester = createRuleTester("no-god-service-shape");

const methods = (count: number, start = 0) =>
  Array.from({ length: count }, (_, index) => `method${start + index}(): void;`).join(" ");

tester.run("no-god-service-shape", noGodServiceShapeRule, {
  valid: [
    {
      code: "interface Base {a():void;b():void} interface Left extends Base {} interface Right extends Base {} interface AppService extends Left,Right {}",
      options: [{ threshold: 3 }],
    },

    {
      code: "interface SmallService { one(): void; two(): void; }",
      filename: "/project/packages/demo/src/service.ts",
    },
    {
      code: "interface Service { one(): void; two(): void; three(): void; four(): void; five(): void; six(): void; seven(): void; eight(): void; nine(): void; ten(): void; eleven(): void; twelve(): void; thirteen(): void; fourteen(): void; fifteen(): void; sixteen(): void; }",
      filename: "/project/packages/demo/src/service.ts",
    },
    {
      code: "interface LargeValue { one(): void; two(): void; three(): void; four(): void; five(): void; six(): void; seven(): void; eight(): void; nine(): void; ten(): void; eleven(): void; twelve(): void; thirteen(): void; fourteen(): void; fifteen(): void; sixteen(): void; seventeen(): void; }",
      filename: "/project/packages/demo/src/value.ts",
    },
    {
      code: "interface Service { one(): void; two(): void; three(): void; four(): void; five(): void; six(): void; seven(): void; eight(): void; nine(): void; ten(): void; eleven(): void; twelve(): void; thirteen(): void; fourteen(): void; fifteen(): void; sixteen(): void; seventeen(): void; }",
      filename: "/project/packages/demo/src/service.test.ts",
    },
    {
      code: "declare interface Service { one(): void; two(): void; three(): void; four(): void; five(): void; six(): void; seven(): void; eight(): void; nine(): void; ten(): void; eleven(): void; twelve(): void; thirteen(): void; fourteen(): void; fifteen(): void; sixteen(): void; seventeen(): void; }",
      filename: "/project/packages/demo/src/service.ts",
    },
    {
      code: `type Base = { ${methods(17)} }; type LargeService<Base> = Base & { own(): void };`,
      filename: "/project/packages/demo/src/service.ts",
    },
    {
      code: `type Base = { ${methods(17)} }; function make<Base>() { type LargeService = Base & { own(): void }; }`,
      filename: "/project/packages/demo/src/service.ts",
    },
    {
      code: `namespace Local { interface Base { one(): void; } interface LargeService extends Base { own(): void; } } interface Base { ${methods(17)} }`,
      filename: "/project/packages/demo/src/service.ts",
    },
  ],
  invalid: [
    {
      code: "interface Base {a():void;b():void} interface Left extends Base {c():void} interface Right extends Base {d():void} interface AppService extends Left,Right {}",
      options: [{ threshold: 3 }],
      errors: [{ messageId: "godServiceShape", data: { name: "AppService", members: 4 } }],
    },

    {
      code: `interface LargeService<T> { ${methods(9)} } interface LargeService<T> { ${methods(8, 9)} }`,
      filename: "/project/packages/demo/src/service.ts",
      errors: [{ messageId: "godServiceShape" }],
    },
    {
      code: `declare interface LargeService { ${methods(9)} } interface LargeService { ${methods(8, 9)} }`,
      filename: "/project/packages/demo/src/service.ts",
      errors: [{ messageId: "godServiceShape" }],
    },
    {
      code: `namespace Merged { export interface LargeService<T> { ${methods(9)} } } namespace Merged { export interface LargeService<T> { ${methods(8, 9)} } }`,
      filename: "/project/packages/demo/src/service.ts",
      errors: [{ messageId: "godServiceShape" }],
    },
    {
      code: `namespace Large { interface LargeService { ${methods(17)} } } namespace Small { interface LargeService { one(): void; } }`,
      filename: "/project/packages/demo/src/service.ts",
      errors: [{ messageId: "godServiceShape" }],
    },
    {
      code: "interface LargeService { one(): void; two(): void; three(): void; four(): void; five(): void; six(): void; seven(): void; eight(): void; nine(): void; ten(): void; eleven(): void; twelve(): void; thirteen(): void; fourteen(): void; fifteen(): void; sixteen(): void; seventeen(): void; }",
      filename: "/project/packages/demo/src/service.ts",
      errors: [{ messageId: "godServiceShape" }],
    },
    {
      code: "interface DerivedService extends BaseService { three(): void; } interface BaseService { one(): void; two(): void; }",
      filename: "/project/packages/demo/src/service.ts",
      options: [{ threshold: 2 }],
      errors: [{ messageId: "godServiceShape" }],
    },
    {
      code: "interface Base<T> { one: T; } interface DerivedService<T> extends Base<T> { two: T; }",
      filename: "/project/packages/demo/src/service.ts",
      options: [{ threshold: 1 }],
      errors: [{ messageId: "godServiceShape" }],
    },
    {
      code: `namespace Contracts { export interface Base<T> { ${methods(17)} } } interface LargeService extends Contracts.Base<string> { own(): void; }`,
      filename: "/project/packages/demo/src/service.ts",
      errors: [{ messageId: "godServiceShape" }],
    },
    {
      code: "type WrappedService = Readonly<{ one(): void; two(): void; three(): void; }>;",
      filename: "/project/packages/demo/src/service.ts",
      options: [{ threshold: 2 }],
      errors: [{ messageId: "godServiceShape" }],
    },
    {
      code: "interface Repository { one(): void; two(): void; three(): void; four(): void; five(): void; six(): void; seven(): void; eight(): void; nine(): void; ten(): void; eleven(): void; twelve(): void; thirteen(): void; fourteen(): void; fifteen(): void; sixteen(): void; seventeen(): void; }",
      filename: "/project/packages/demo/src/repository.ts",
      errors: [{ messageId: "godServiceShape" }],
    },
    {
      code: "type Client = { one(): void; two(): void; three(): void; four(): void; five(): void; six(): void; seven(): void; eight(): void; nine(): void; ten(): void; eleven(): void; twelve(): void; thirteen(): void; fourteen(): void; fifteen(): void; sixteen(): void; seventeen(): void; };",
      filename: "/project/packages/demo/src/client.ts",
      options: [{ threshold: 16 }],
      errors: [{ messageId: "godServiceShape" }],
    },
  ],
});

tester.run("no-god-service-shape-ambient-visibility", noGodServiceShapeRule, {
  valid: [],
  invalid: [
    { code: 'declare namespace N { interface TinyService { a(): void } } declare namespace N { interface TinyService { b(): void } }', options: [{threshold:1}], errors: [{messageId:'godServiceShape'}] },
  ],
});

tester.run("no-god-service-shape-namespace-visibility", noGodServiceShapeRule, {
  valid: [
    { code: 'namespace N { interface TinyService { a(): void } } namespace N { interface TinyService { b(): void } }', options: [{threshold:1}] },
    { code: 'namespace N { interface Base { a():void } interface TinyService extends Base {} } namespace N { interface Base { b():void } interface TinyService extends Base {} }', options: [{threshold:1}] },
  ],
  invalid: [
    { code: 'namespace N { export interface TinyService { a(): void } } namespace N { export interface TinyService { b(): void } }', options: [{threshold:1}], errors: [{messageId:'godServiceShape'}] },
    { code: 'namespace N { interface TinyService { a(): void } interface TinyService { b(): void } }', options: [{threshold:1}], errors: [{messageId:'godServiceShape'}] },
    { code: 'namespace N { export interface Base { a():void } } namespace N { interface TinyService extends Base { b():void } }', options: [{threshold:1}], errors: [{messageId:'godServiceShape'}] },
    { code: 'namespace N { export namespace Inner { export interface TinyService { a():void } } } namespace N { export namespace Inner { export interface TinyService { b():void } } }', options: [{threshold:1}], errors: [{messageId:'godServiceShape'}] },
  ],
});
