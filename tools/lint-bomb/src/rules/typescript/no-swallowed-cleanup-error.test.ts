import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noSwallowedCleanupErrorRule } from "./no-swallowed-cleanup-error.ts";

const tester = createRuleTester("no-swallowed-cleanup-error");

tester.run("no-swallowed-cleanup-error", noSwallowedCleanupErrorRule, {
  valid: [
    {
      code: 'await runtime["dispose"]()["catch"](report);',
      filename: "/project/src/example.test.ts",
    },
    {
      code: "await runtime.dispose()[method](() => undefined);",
      filename: "/project/src/example.test.ts",
    },

    { code: "await runtime.dispose().catch(report);", filename: "/project/src/example.test.ts" },
    {
      code: "await runtime.dispose().catch(() => expect(true).toBe(true));",
      filename: "/project/src/example.test.ts",
    },
    { code: "await runtime.dispose().catch(() => undefined);", filename: "/project/src/domain.ts" },
    {
      code: "await runtime.close().catch((error) => report(error));",
      filename: "/project/src/domain.ts",
    },
    {
      code: "await runtime.teardown().catch(() => recordCleanupFailure());",
      filename: "/project/src/domain.ts",
    },
    {
      code: "await runtime.dispose().catch(() => undefined);",
      filename: "/project/src/testing/cleanup.ts",
    },
  ],
  invalid: [
    {
      code: 'await runtime.dispose()["catch"](() => undefined);',
      filename: "/project/src/example.test.ts",
      errors: [{ messageId: "swallowedCleanupError" }],
    },
    {
      code: 'await runtime["dispose"]()["catch"](() => undefined);',
      filename: "/project/src/example.test.ts",
      errors: [{ messageId: "swallowedCleanupError" }],
    },

    {
      code: "await runtime.dispose().catch(() => undefined);",
      filename: "/project/src/example.test.ts",
      errors: [{ messageId: "swallowedCleanupError" }],
    },
    {
      code: "await runtime.dispose().catch(() => undefined);",
      filename: "/project/test/runtime-cleanup.ts",
      errors: [{ messageId: "swallowedCleanupError" }],
    },
    {
      code: "await runtime.dispose().catch(() => undefined);",
      filename: "/project/tests/runtime-cleanup.mts",
      errors: [{ messageId: "swallowedCleanupError" }],
    },
    {
      code: "await release().catch(() => void 0);",
      filename: "/project/src/example.test.ts",
      errors: [{ messageId: "swallowedCleanupError" }],
    },
    {
      code: "await release().catch(() => {});",
      filename: "/project/src/example.test.ts",
      errors: [{ messageId: "swallowedCleanupError" }],
    },
    {
      code: "await runtime.close().catch(() => {});",
      filename: "/project/src/domain.test.ts",
      errors: [{ messageId: "swallowedCleanupError" }],
    },
    {
      code: "await runtime.unsubscribe().catch(() => void 0);",
      filename: "/project/src/domain.test.ts",
      errors: [{ messageId: "swallowedCleanupError" }],
    },
  ],
});
