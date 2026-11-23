import { defineRule } from "@oxlint/plugins";

import { isGlobalReflectMethodCall } from "../../shared/reflect-method.ts";

/** Ban Reflect.apply, which bypasses ordinary typed function calls. */
export const noReflectApplyRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow Reflect.apply; call typed functions directly or model dynamic dispatch behind an interface.",
    },
    messages: {
      reflectApply:
        "Replace Reflect.apply with a call through a typed function contract, preserving argument and result relationships. Preserve receiver binding: a bare callback call is not equivalent when the original receiver matters. Keep unavoidable dynamic invocation in an explicit adapter with a declared dispatch contract.",
    },
  },
  createOnce(context) {
    return {
      CallExpression(node) {
        if (node.callee.type === "Super" || node.callee.type === "V8IntrinsicExpression") return;
        if (isGlobalReflectMethodCall(context.sourceCode, node.callee, "apply")) {
          context.report({ node, messageId: "reflectApply" });
        }
      },
    };
  },
});
