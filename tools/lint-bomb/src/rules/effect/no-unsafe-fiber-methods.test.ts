import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noUnsafeFiberMethodsRule } from "./no-unsafe-fiber-methods.ts";

const tester = createRuleTester("no-unsafe-fiber-methods");

tester.run("no-unsafe-fiber-methods", noUnsafeFiberMethodsRule, {
  valid: [
    'import { Fiber } from "effect"; namespace Local { export namespace Fiber { export type Fiber<A, E> = {pollUnsafe(): void}; } export function inspect(fiber: Fiber.Fiber<number, never>) { fiber.pollUnsafe(); } }',
    'import * as Fx from "effect"; namespace Local { export namespace Fx { export namespace Fiber { export type Fiber<A, E> = {pollUnsafe(): void}; } } export function inspect(fiber: Fx.Fiber.Fiber<number, never>) { fiber.pollUnsafe(); } }',

    'import { Fiber } from "effect"; interface Base { fiber: Fiber.Fiber<number, never> } function inspect() { interface Base { fiber: { pollUnsafe(): void } } interface Holder extends Base {} const holder: Holder = { fiber: { pollUnsafe() {} } }; holder.fiber.pollUnsafe(); }',

    'import { Fiber } from "effect"; type Worker = Fiber.Fiber<number, never>; declare const brand: unique symbol; function inspect<Worker extends { readonly [brand]: true; pollUnsafe(): void }>(worker: Worker) { worker.pollUnsafe(); }',
    'import { Fiber } from "effect"; type Worker = Fiber.Fiber<number, never>; function inspect() { type Worker = { pollUnsafe(): void }; const worker: Worker = { pollUnsafe() {} }; worker.pollUnsafe(); }',

    "const worker = { pollUnsafe() {} }; worker.pollUnsafe();",
    "interface LocalFiber { pollUnsafe(): void } declare const fiber: LocalFiber; fiber.pollUnsafe();",
    {
      code: 'import { Fiber } from "effect"; function inspect<Fiber extends { pollUnsafe(): void }>(fiber: Fiber) { fiber.pollUnsafe(); }',
      filename: "/project/packages/flow-state/src/core/domain.ts",
    },
    {
      code: 'import { Fiber } from "effect"; type Holder<Fiber> = { value: Fiber }; declare const holder: Holder<{ pollUnsafe(): void }>; holder.value.pollUnsafe();',
      filename: "/project/packages/flow-state/src/core/domain.ts",
    },
    {
      code: 'import { Fiber as EffectFiber } from "effect"; type Holder<Fiber> = { value: Fiber }; declare const holder: Holder<{ pollUnsafe(): void }>; holder.value.pollUnsafe();',
      filename: "/project/packages/flow-state/src/core/domain.ts",
    },
    {
      options: [{ allowedFiles: ["/project/packages/flow-state/src/runtime/host.ts"] }],
      code: 'import { Fiber } from "effect"; declare const fiber: Fiber.Fiber<number, never>; fiber.interruptUnsafe();',
      filename: "/project/packages/flow-state/src/runtime/host.ts",
    },
    {
      options: [{ allowedFiles: ["/project/packages/flow-state/src/server.ts"] }],
      code: 'import { Fiber } from "effect"; declare const fiber: Fiber.Fiber<number, never>; fiber.pollUnsafe();',
      filename: "/project/packages/flow-state/src/server.ts",
    },
    {
      options: [
        {
          allowedFiles: [
            "/project/packages/flow-state/src/core/orchestrator/orchestrator-system.ts",
          ],
        },
      ],
      code: 'import { Fiber } from "effect"; declare const fiber: Fiber.Fiber<number, never>; fiber.pollUnsafe();',
      filename: "/project/packages/flow-state/src/core/orchestrator/orchestrator-system.ts",
    },
  ],
  invalid: [
    {
      code: 'import { Fiber } from "effect"; namespace Local { export function inspect(fiber: Fiber.Fiber<number, never>) { fiber.pollUnsafe(); } }',
      errors: [{ messageId: "unsafeFiberMethod" }],
    },
    {
      code: 'import * as Fx from "effect"; namespace Local { export function inspect(fiber: Fx.Fiber.Fiber<number, never>) { fiber.pollUnsafe(); } }',
      errors: [{ messageId: "unsafeFiberMethod" }],
    },

    {
      code: 'import { Fiber } from "effect"; interface Base { fiber: Fiber.Fiber<number, never> } interface Parent extends Base {} function inspect() { interface Base extends Parent {} interface Holder extends Base {} const holder: Holder = {} as Holder; holder.fiber.pollUnsafe(); }',
      errors: [{ messageId: "unsafeFiberMethod" }],
    },

    {
      code: 'import { Fiber } from "effect"; interface Root { fiber: Fiber.Fiber<number, never> } interface Middle extends Root {} interface Base extends Middle {} interface Holder extends Base {} declare const holder: Holder; holder.fiber.pollUnsafe();',
      errors: [{ messageId: "unsafeFiberMethod" }],
    },

    {
      code: 'import { Fiber } from "effect"; function inspect() { interface Base { fiber: Fiber.Fiber<number, never> } interface Holder extends Base {} const holder: Holder = {} as Holder; holder.fiber.pollUnsafe(); }',
      errors: [{ messageId: "unsafeFiberMethod" }],
    },

    {
      code: 'import { Fiber } from "effect"; type Worker = Fiber.Fiber<number, never>; declare const worker: Worker; worker.pollUnsafe();',
      errors: [{ messageId: "unsafeFiberMethod" }],
    },

    {
      code: 'import { Fiber as EffectFiber } from "effect"; declare const fiber: EffectFiber.Fiber<number, never>; fiber.pollUnsafe();',
      filename: "/project/packages/flow-state/src/core/domain.ts",
      errors: [{ messageId: "unsafeFiberMethod" }],
    },
    {
      code: 'import { Fiber } from "effect"; declare const fiber: Fiber.Fiber<number, never>; fiber.pollUnsafe();',
      filename: "/project/packages/flow-state/src/core/domain.ts",
      errors: [{ messageId: "unsafeFiberMethod" }],
    },
    {
      code: 'import { Fiber } from "effect"; interface Holder { fiber: Fiber.Fiber<number, never> } declare const holder: Holder; holder.fiber["pollUnsafe"]();',
      filename: "/project/packages/flow-state/src/core/domain.ts",
      errors: [{ messageId: "unsafeFiberMethod" }],
    },
    {
      code: 'import * as Fx from "effect"; declare const fiber: Fx.Fiber.Fiber<number, never>; fiber.pollUnsafe();',
      filename: "/project/packages/flow-state/src/core/domain.ts",
      errors: [{ messageId: "unsafeFiberMethod" }],
    },
    {
      code: 'import * as Fx from "effect"; type WorkerFiber = Fx.Fiber.Fiber<number, never>; declare const fiber: WorkerFiber; fiber["interruptUnsafe"]();',
      filename: "/project/packages/flow-state/src/core/domain.ts",
      errors: [{ messageId: "unsafeFiberMethod" }],
    },
    {
      code: 'import { Fiber } from "effect"; interface Base { fiber: Fiber.Fiber<number, never> } interface Holder extends Base {} declare const holder: Holder; holder.fiber.pollUnsafe();',
      filename: "/project/packages/flow-state/src/core/domain.ts",
      errors: [{ messageId: "unsafeFiberMethod" }],
    },
  ],
});

tester.run("no-unsafe-fiber-methods-portable-default", noUnsafeFiberMethodsRule, {
  valid: [],
  invalid: [
    {
      code: 'import { Fiber } from "effect"; declare const fiber: Fiber.Fiber<number, never>; fiber.pollUnsafe();',
      filename: "/application/src/runtime/host.ts",
      errors: [{ messageId: "unsafeFiberMethod" }],
    },
  ],
});
