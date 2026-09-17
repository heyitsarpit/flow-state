import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noDomainWallClockRule } from "./no-domain-wall-clock.ts";

const tester = createRuleTester("no-domain-wall-clock");
const options = [{ sourceRoots: ["packages/flow-state-rewrite/src/runtime"] }];
tester.run("ambient wall-clock access", noDomainWallClockRule, {
  valid: [
    {
      code: 'import { Clock, Effect } from "effect"; const read = Effect.gen(function* () { return yield* Clock.currentTimeMillis; }); void read;',
      filename: "/project/packages/flow-state-rewrite/src/runtime/clock.ts",
      options,
    },
    {
      code: "const localDate = Date; void localDate;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/clock.ts",
      options,
    },
    {
      code: "const LocalDate = () => 0; const value = LocalDate(); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/clock.ts",
      options,
    },
    {
      code: "const Date = () => 0; const value = Date(); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/shadowed.ts",
      options,
    },
    {
      code: "const NativeDate = Date; const value = NativeDate; void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/alias.ts",
      options,
    },
    {
      code: "const self = { Date: () => 0 }; const value = self.Date(); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/local-self.ts",
      options,
    },
    {
      code: "const performance = { now: () => 0 }; const value = performance.now(); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/local-performance.ts",
      options,
    },
    {
      code: "const localDate = () => 0; let alias; if (condition) alias = localDate; else alias = localDate; const value = alias(); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/local-branch.ts",
      options,
    },
    {
      code: "const localDate = () => 0; let alias; alias = Date; alias = localDate; const value = alias(); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/replaced-alias.ts",
      options,
    },
    {
      code: "const Date = () => 0; const performance = { now: () => 0 }; const [localDate, , localPerformance] = [Date, 0, performance]; const first = localDate(); const second = localPerformance.now(); void first; void second;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/local-array-aliases.ts",
      options,
    },
    {
      code: "const localDate = () => 0; let alias; condition && (alias = localDate); other || (alias = localDate); const value = alias(); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/local-logical-alias.ts",
      options,
    },
    {
      code: "const localDate = () => 0; let alias; if (condition) { alias = Date; alias = localDate; } const value = alias(); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/branch-replacement.ts",
      options,
    },
    {
      code: "const localDate = () => 0; let alias; while (condition) { alias = Date; alias = localDate; } const value = alias(); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/loop-replacement.ts",
      options,
    },
    {
      code: "const localDate = () => 0; let alias; condition ? (alias = Date, alias = localDate) : (alias = localDate); const value = alias(); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/conditional-replacement.ts",
      options,
    },
    {
      code: "const localDate = () => 0; let alias; const value = (alias = localDate)(); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/assignment-expression-local.ts",
      options,
    },
    {
      code: "const localDate = () => 0; let alias; false && (alias = Date); const value = alias(); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/short-circuit-false.ts",
      options,
    },
    {
      code: "const localDate = () => 0; let alias; true || (alias = Date); const value = alias(); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/short-circuit-true.ts",
      options,
    },
    {
      code: "const localDate = () => 0; const sources = false ? [Date] : [localDate]; const [alias] = sources; const value = alias(); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/constant-array-local.ts",
      options,
    },
    {
      code: "const localDate = () => 0; const { Date: alias = (false ? Date : localDate) } = {}; const value = alias(); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/constant-object-default-local.ts",
      options,
    },
    {
      code: "const localDate = () => 0; const [alias = (false ? Date : localDate)] = []; const value = alias(); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/constant-array-default-local.ts",
      options,
    },
    {
      code: "const localDate = () => 0; const sources = [0, ...(false ? [Date] : [localDate])]; const [, alias] = sources; const value = alias(); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/constant-array-spread-local.ts",
      options,
    },
    {
      code: "const localDate = () => 0; let alias; while (condition) { alias = Date; if (stop) { alias = localDate; break; } alias = localDate; } const value = alias(); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/loop-break-local.ts",
      options,
    },
    {
      code: "const localDate = () => 0; let alias = localDate; while (condition) { if (stop) { alias = localDate; continue; } alias = localDate; } const value = alias(); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/loop-continue-local.ts",
      options,
    },
    {
      code: "const localDate = () => 0; let alias; switch (kind) { case 0: alias = Date; case 1: alias = localDate; break; default: alias = localDate; } const value = alias(); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/switch-fallthrough-local.ts",
      options,
    },
    {
      code: "const localDate = () => 0; let alias = localDate; try { alias = Date; throw new Error(); } catch { alias = localDate; } const value = alias(); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/try-catch-replacement.ts",
      options,
    },
    {
      code: "const localDate = () => 0; const source = {}; source.Date = Date; source.Date = localDate; const value = source.Date(); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/replaced-date-property.ts",
      options,
    },
    {
      code: "const localDate = () => 0; let alias = Date; switch (kind) { case 0: alias = localDate; break; default: alias = localDate; } const value = alias(); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/switch-default-overwrite.ts",
      options,
    },
    {
      code: "var sources = other; var other = sources; const [alias] = sources; const value = alias(); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/cyclic-array-alias.ts",
      options,
    },
    {
      code: "const localDate = () => 0; const source = condition ? { NativeDate: localDate } : { NativeDate: localDate }; const { NativeDate = Date } = source; const value = NativeDate(); void value;",
      filename:
        "/project/packages/flow-state-rewrite/src/runtime/object-conditional-default-local.ts",
      options,
    },
    {
      code: "const localDate = () => 0; let alias = Date; alias = localDate; const value = (alias || Date)(); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/replaced-short-circuit-local.ts",
      options,
    },
    {
      code: "let alias = Date; alias = 0; const value = (alias ?? Date); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/replaced-nullish-local.ts",
      options,
    },
    {
      code: "const localDate = () => 0; let source = { NativeDate: Date }; source = { NativeDate: localDate }; const { NativeDate } = source; const value = NativeDate(); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/object-replaced-local.ts",
      options,
    },
    {
      code: "const local = {}; const source = { root: {} }; source.root.Date = Date; source.root = local; source.root.Date();",
      filename: "/project/packages/flow-state-rewrite/src/runtime/replaced-nested-date-property.ts",
      options,
    },
  ],
  invalid: [
    {
      code: "const first = Date.now(); const second = performance.now(); const third = Date(); const fourth = new Date(); void first; void second; void third; void fourth;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/clock.ts",
      options,
      errors: [
        { messageId: "wallClock" },
        { messageId: "wallClock" },
        { messageId: "wallClock" },
        { messageId: "wallClock" },
      ],
    },
    {
      code: "const text = `now: ${Date.now()}`; void text;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/template.ts",
      options,
      errors: [{ messageId: "wallClock" }],
    },
    {
      code: "consume(...[Date.now()]);",
      filename: "/project/packages/flow-state-rewrite/src/runtime/spread.ts",
      options,
      errors: [{ messageId: "wallClock" }],
    },
    {
      code: "const now = globalThis.Date.now(); const value = new globalThis.Date(); void now; void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/clock.ts",
      options,
      errors: [{ messageId: "wallClock" }, { messageId: "wallClock" }],
    },
    {
      code: "const NativeDate = Date; const first = NativeDate(); const second = new NativeDate(); void first; void second;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/clock.ts",
      options,
      errors: [{ messageId: "wallClock" }, { messageId: "wallClock" }],
    },
    {
      code: "const { Date: NativeDate } = globalThis; const first = NativeDate.call(null); const second = new NativeDate(); void first; void second;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/clock.ts",
      options,
      errors: [{ messageId: "wallClock" }, { messageId: "wallClock" }],
    },
    {
      code: "const { now } = Date; const first = now(); const second = globalThis.performance.now(); void first; void second;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/clock.ts",
      options,
      errors: [{ messageId: "wallClock" }, { messageId: "wallClock" }],
    },
    {
      code: "const first = window.Date(); const second = window.performance.now(); void first; void second;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/clock.ts",
      options,
      errors: [{ messageId: "wallClock" }, { messageId: "wallClock" }],
    },
    {
      code: "const value = Date.call(null); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/clock.ts",
      options,
      errors: [{ messageId: "wallClock" }],
    },
    {
      code: "let NativeDate; NativeDate = Date; const first = NativeDate(); let clock; clock = performance; const second = clock.now(); void first; void second;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/assigned-alias.ts",
      options,
      errors: [{ messageId: "wallClock" }, { messageId: "wallClock" }],
    },
    {
      code: "let NativeDate; ({ Date: NativeDate } = globalThis); const value = new NativeDate(); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/assigned-destructure.ts",
      options,
      errors: [{ messageId: "wallClock" }],
    },
    {
      code: "const first = self.Date(); const second = self.performance.now(); const third = global.Date(); const fourth = global.performance.now(); void first; void second; void third; void fourth;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/global-forms.ts",
      options,
      errors: [
        { messageId: "wallClock" },
        { messageId: "wallClock" },
        { messageId: "wallClock" },
        { messageId: "wallClock" },
      ],
    },
    {
      code: "const value = Date.now(); void value;",
      filename: "/project/packages/flow-state-rewrite/src/host/browser.ts",
      options: [{ sourceRoots: ["packages/flow-state-rewrite/src"] }],
      errors: [{ messageId: "wallClock" }],
    },
    {
      code: "class Feature { field = Date.now(); static field = performance.now(); method() { return Date(); } static { Date.now(); } } switch (value) { case Date.now(): break; case performance.now(): break; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/classes-and-switch.ts",
      options,
      errors: [
        { messageId: "wallClock" },
        { messageId: "wallClock" },
        { messageId: "wallClock" },
        { messageId: "wallClock" },
        { messageId: "wallClock" },
        { messageId: "wallClock" },
      ],
    },
    {
      code: "const localDate = () => 0; let alias; if (condition) alias = Date; else alias = localDate; const value = alias(); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/conditional-alias.ts",
      options,
      errors: [{ messageId: "wallClock" }],
    },
    {
      code: "const localDate = () => 0; let alias = Date; while (condition) { alias = Date; alias = localDate; } const value = alias(); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/loop-alias.ts",
      options,
      errors: [{ messageId: "wallClock" }],
    },
    {
      code: "const NativeDate = Date as typeof Date; const SatisfyingDate = Date satisfies typeof Date; const NonNullDate = Date!; const first = NativeDate(); const second = SatisfyingDate(); const third = NonNullDate(); void first; void second; void third;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/typed-aliases.ts",
      options,
      errors: [{ messageId: "wallClock" }, { messageId: "wallClock" }, { messageId: "wallClock" }],
    },
    {
      code: "const [NativeDate, , NativePerformance] = [Date, 0, performance]; const first = NativeDate(); const second = NativePerformance.now(); void first; void second;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/array-aliases.ts",
      options,
      errors: [{ messageId: "wallClock" }, { messageId: "wallClock" }],
    },
    {
      code: "const localDate = () => 0; let alias; condition && (alias = Date); other || (alias = localDate); const value = alias(); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/logical-branch-alias.ts",
      options,
      errors: [{ messageId: "wallClock" }],
    },
    {
      code: "const [NativeDate = Date, NativePerformance = performance] = []; const first = NativeDate(); const second = NativePerformance.now(); void first; void second;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/array-defaults.ts",
      options,
      errors: [{ messageId: "wallClock" }, { messageId: "wallClock" }],
    },
    {
      code: "const localDate = () => 0; const dateSources = condition ? [Date] : [localDate]; const [NativeDate] = dateSources; const value = NativeDate(); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/conditional-array.ts",
      options,
      errors: [{ messageId: "wallClock" }],
    },
    {
      code: "const localPerformance = { now: () => 0 }; const performanceSources = condition && [performance]; const [NativePerformance] = performanceSources; const value = NativePerformance.now(); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/logical-array.ts",
      options,
      errors: [{ messageId: "wallClock" }],
    },
    {
      code: "let alias; const value = (alias = Date)(); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/assignment-expression-ambient.ts",
      options,
      errors: [{ messageId: "wallClock" }],
    },
    {
      code: "const localDate = () => 0; let alias; true && (alias = Date); const value = alias(); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/short-circuit-ambient.ts",
      options,
      errors: [{ messageId: "wallClock" }],
    },
    {
      code: "const localDate = () => 0; const sources = true ? [Date] : [localDate]; const [alias] = sources; const value = alias(); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/constant-array-ambient.ts",
      options,
      errors: [{ messageId: "wallClock" }],
    },
    {
      code: "const sources = [0, ...[Date]]; const [, alias] = sources; const value = alias(); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/array-spread-ambient.ts",
      options,
      errors: [{ messageId: "wallClock" }],
    },
    {
      code: "const localDate = () => 0; const { Date: alias = (true ? Date : localDate) } = {}; const value = alias(); void value;",
      filename:
        "/project/packages/flow-state-rewrite/src/runtime/constant-object-default-ambient.ts",
      options,
      errors: [{ messageId: "wallClock" }],
    },
    {
      code: "const localDate = () => 0; const [alias = (true ? Date : localDate)] = []; const value = alias(); void value;",
      filename:
        "/project/packages/flow-state-rewrite/src/runtime/constant-array-default-ambient.ts",
      options,
      errors: [{ messageId: "wallClock" }],
    },
    {
      code: "const localDate = () => 0; const sources = [0, ...(true ? [Date] : [localDate])]; const [, alias] = sources; const value = alias(); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/constant-array-spread-ambient.ts",
      options,
      errors: [{ messageId: "wallClock" }],
    },
    {
      code: "const localDate = () => 0; let alias; while (condition) { if (stop) { alias = Date; break; } alias = localDate; } const value = alias(); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/loop-break-ambient.ts",
      options,
      errors: [{ messageId: "wallClock" }],
    },
    {
      code: "const localDate = () => 0; let alias; switch (kind) { case 0: alias = Date; break; default: alias = localDate; } const value = alias(); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/switch-break-ambient.ts",
      options,
      errors: [{ messageId: "wallClock" }],
    },
    {
      code: "const localDate = () => 0; const { NativeDate } = { NativeDate: Date }; const value = NativeDate(); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/object-rhs-ambient.ts",
      options,
      errors: [{ messageId: "wallClock" }],
    },
    {
      code: "const source = { ...{ NativeDate: Date } }; const { NativeDate } = source; const value = NativeDate(); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/object-spread-ambient.ts",
      options,
      errors: [{ messageId: "wallClock" }],
    },
    {
      code: "const { ...rest } = globalThis; const value = rest.Date(); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/object-rest-ambient.ts",
      options,
      errors: [{ messageId: "wallClock" }],
    },
    {
      code: "const localDate = () => 0; const source = condition ? { NativeDate: undefined } : { NativeDate: localDate }; const { NativeDate = Date } = source; const value = NativeDate(); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/object-conditional-undefined.ts",
      options,
      errors: [{ messageId: "wallClock" }],
    },
    {
      code: "let alias = Date; alias = undefined; const value = (alias || Date)(); void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/replaced-short-circuit-ambient.ts",
      options,
      errors: [{ messageId: "wallClock" }],
    },
    {
      code: "const [head, ...rest] = [0, Date]; const value = rest[0](); void head; void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/array-rest-ambient.ts",
      options,
      errors: [{ messageId: "wallClock" }],
    },
    {
      code: "const localDate = () => 0; let source; source = condition ? [localDate] : [Date]; const [head, ...rest] = source; const value = rest[0](); void head; void value;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/assigned-array-container.ts",
      options,
      errors: [{ messageId: "wallClock" }],
    },
    {
      code: "const localDate = () => 0; let alias = localDate; try { alias = Date; throw new Error(); } catch { const value = alias(); void value; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/try-catch-alias.ts",
      options,
      errors: [{ messageId: "wallClock" }],
    },
    {
      code: "const source = {}; source.Date = Date; source.Date();",
      filename: "/project/packages/flow-state-rewrite/src/runtime/assigned-date-property.ts",
      options,
      errors: [{ messageId: "wallClock" }],
    },
    {
      code: "const source = { root: {} }; source.root.Date = Date; source.root.Date();",
      filename: "/project/packages/flow-state-rewrite/src/runtime/nested-assigned-date-property.ts",
      options,
      errors: [{ messageId: "wallClock" }],
    },
    {
      code: "const source = { root: {} }; const alias = source; alias.root.Date = Date; source.root.Date();",
      filename: "/project/packages/flow-state-rewrite/src/runtime/aliased-nested-date-property.ts",
      options,
      errors: [{ messageId: "wallClock" }],
    },
    {
      code: "const source = { root: {} }; const root = source.root; root.Date = Date; source.root.Date();",
      filename: "/project/packages/flow-state-rewrite/src/runtime/destructured-nested-date-property.ts",
      options,
      errors: [{ messageId: "wallClock" }],
    },
    {
      code: "const source = { root: {} };\nconst other = { root: {} };\nlet alias = source;\nalias = other;\nalias.root.Date = Date;\nsource.root.Date();\nother.root.Date();",
      filename: "/project/packages/flow-state-rewrite/src/runtime/rebound-nested-date-property.ts",
      options,
      errors: [{ messageId: "wallClock", line: 7 }],
    },
  ],
});
