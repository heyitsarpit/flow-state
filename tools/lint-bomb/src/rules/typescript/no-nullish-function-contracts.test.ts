import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noNullishFunctionContractsRule } from "./no-nullish-function-contracts.ts";

const tester = createRuleTester("no-nullish-function-contracts");

tester.run("no-nullish-function-contracts-regression", noNullishFunctionContractsRule, {
  valid: [
    'function find(value = "fallback"): string { return value; }',
    "const list = (limit = 20) => repository.list(limit);",
    "function list(limit: number = 20): number { return limit; }",
    "function list({ limit = 20 } = {}): number { return limit; }",
    "class Pager { list(limit = 20): number { return limit; } }",
    "class Pager { constructor(public limit: number = 20) {} }",
    "function find(value: string): string { return value; }",
    "function find(value: Option.Option<string>): Result.Result<string, Error> { return result; }",
    "type Maybe<T> = Option.Option<T>; function find(value: Maybe<string>): Maybe<string> { return value; }",
    "type Identity<T> = T; function find<T>(value: Identity<T>): T { return value; }",
    "function run(): Effect.Effect<string, Error, never> { return effect; }",
    "function stop(): void {}",
    "function decode(value: unknown): Result.Result<string, Error> { return result; }",
    "type A<T> = T; type B<T> = A<T>; function safe(value: B<string>): string { return value; }",
    'type A<T> = T; type B<T> = A<Wrapper<T>>; function safe(value: B<string>): string { return "x"; }',
    "type Cycle<T> = Cycle<T>; function safe(value: Cycle<string>): string { return value; }",
    "type Maybe = string | undefined; function safe<Maybe>(value: Maybe): Maybe { return value; }",
    "type Maybe = string | undefined; function safe() { type Maybe = string; const nested = (value: Maybe): Maybe => value; return nested; }",
  ],
  invalid: [
    {
      code: 'function find(value?: string): string { return value ?? "fallback"; }',
      errors: [{ messageId: "nullishContract" }],
    },
    {
      code: 'function find(value: string | null = "fallback"): string { return value ?? "fallback"; }',
      errors: [{ messageId: "nullishContract" }],
    },
    {
      code: 'function find(value: string | undefined = "fallback"): string { return value; }',
      errors: [{ messageId: "nullishContract" }],
    },
    {
      code: 'function find(value = "fallback"): string | undefined { return value; }',
      errors: [{ messageId: "nullishContract" }],
    },
    {
      code: 'function find(value: string | undefined): string { return value ?? "fallback"; }',
      errors: [{ messageId: "nullishContract" }],
    },
    {
      code: 'function find(value: string | null): string { return value ?? "fallback"; }',
      errors: [{ messageId: "nullishContract" }],
    },
    {
      code: "function find(value: Maybe<string>): Maybe<string> { return value; } type Maybe<T> = T | undefined;",
      errors: [{ messageId: "nullishContract" }, { messageId: "nullishContract" }],
    },
    {
      code: 'function find(): Promise<string | undefined> { return Promise.resolve("value"); }',
      errors: [{ messageId: "nullishContract" }],
    },
    {
      code: 'type Maybe<T> = T | null; function find(value: Maybe<string>): string { return value ?? "fallback"; }',
      errors: [{ messageId: "nullishContract" }],
    },
    {
      code: "type Handler = (value?: string) => void;",
      errors: [{ messageId: "nullishContract" }],
    },
    { code: "type Handler = () => string | null;", errors: [{ messageId: "nullishContract" }] },
    {
      code: 'type A<T> = T; type B<T> = A<T>; function find(value: B<undefined>): string { return "x"; }',
      errors: [{ messageId: "nullishContract" }],
    },
    {
      code: 'type A<T> = T; type B<T> = A<T>; function find(value: B<null>): string { return "x"; }',
      errors: [{ messageId: "nullishContract" }],
    },
    {
      code: 'type A<T> = T; type B<T> = A<Wrapper<T>>; function find(value: B<undefined>): string { return "x"; }',
      errors: [{ messageId: "nullishContract" }],
    },
    {
      code: 'type A<T> = T; type B<T> = A<[T]>; function find(value: B<undefined>): string { return "x"; }',
      errors: [{ messageId: "nullishContract" }],
    },
    {
      code: 'type A<T> = T; type B<T> = A<string | T>; function find(value: B<undefined>): string { return "x"; }',
      errors: [{ messageId: "nullishContract" }],
    },
    {
      code: [
        "type Recursive<T> = External<T>;",
        "type Overloaded<T> = {",
        "(value: Recursive<ReadonlyCanonical<T>>): T;",
        "(value: Recursive<ReadonlyCanonical<T>>, options?: T): T;",
        "};",
      ].join(" "),
      errors: [{ messageId: "nullishContract" }],
    },
    {
      code: "function lookup() { type Maybe = string | undefined; const nested = (value: Maybe): Maybe => value; return nested; }",
      errors: [{ messageId: "nullishContract" }, { messageId: "nullishContract" }],
    },
    {
      code: "function lookup() { type Maybe<T> = T | undefined; const nested = (value: Maybe<string>): Maybe<string> => value; return nested; }",
      errors: [{ messageId: "nullishContract" }, { messageId: "nullishContract" }],
    },
    {
      code: "function lookup() { type Inner<T> = T | null; type Maybe<T> = Inner<T>; const nested = (value: Maybe<string>): string => value as string; return nested; }",
      errors: [{ messageId: "nullishContract" }],
    },
  ],
});

tester.run("no-nullish-function-contracts-round3", noNullishFunctionContractsRule, {
  "valid": [
    "namespace Domain { export type T = string; } type Alias<T> = Domain.T; function read(v: Alias<undefined>) {}"
  ],
  "invalid": [
    {
      "code": "type Alias<T> = T; function read(v: Alias<undefined>) {}",
      "errors": [
        {
          "messageId": "nullishContract"
        }
      ]
    }
  ]
});

tester.run("no-nullish-function-contracts-alias-identity-defaults", noNullishFunctionContractsRule, {
  valid: [
    'type T = string; type Alias = T; function f<T>(value: Alias) {}',
    'type T = undefined; function f<T>(value: T) {}',
    'type Alias<T, U = T> = U; function f(value: Alias<string>) {}',
    'type T = string; type Inner = T; type Outer<T> = Inner; function f(value: Outer<undefined>) {}',
    'type Alias<T, U = T, V = U> = V; function f(value: Alias<string>) {}',
  ],
  invalid: [
    {
      code: 'type T = string | undefined; type Alias = T; function f<T>(value: Alias) {}',
      errors: [{ messageId: "nullishContract" }],
    },
    {
      code: 'type Alias<T, U = T> = U; function f(value: Alias<undefined>) {}',
      errors: [{ messageId: "nullishContract" }],
    },
    {
      code: 'type Alias<T, U = T, V = U> = V; function f(value: Alias<undefined>) {}',
      errors: [{ messageId: "nullishContract" }],
    },
  ],
});
