import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { importedEffectFunctionName } from "../../shared/effect/effect-import.ts";

const combinators = new Set([
  "all",
  "filterMapEffect",
  "forEach",
  "partition",
  "replicateEffect",
  "validate",
]);

function hasConcurrencyOption(node: ESTree.CallExpression): boolean {
  const lastArgument = node.arguments.at(-1);
  if (lastArgument === undefined || lastArgument.type === "SpreadElement") return false;
  let current: ESTree.Expression = lastArgument;
  while (
    current.type === "ParenthesizedExpression" ||
    current.type === "TSAsExpression" ||
    current.type === "TSSatisfiesExpression"
  ) {
    current = current.expression;
  }
  if (current.type !== "ObjectExpression") return false;
  let hasEffectiveConcurrency = false;
  for (const property of current.properties) {
    if (property.type === "SpreadElement") {
      hasEffectiveConcurrency = false;
      continue;
    }
    if (
      property.type === "Property" &&
      ((!property.computed && property.key.type === "Identifier" && property.key.name === "concurrency") ||
        (property.key.type === "Literal" && property.key.value === "concurrency") ||
        (property.computed && property.key.type === "TemplateLiteral" && property.key.expressions.length === 0 && property.key.quasis[0]?.value.cooked === "concurrency"))
    ) {
      hasEffectiveConcurrency = true;
    }
  }
  return hasEffectiveConcurrency;
}

/** Make serial-versus-parallel Effect coordination explicit at each call site. */
export const noImplicitEffectConcurrencyRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Require an explicit concurrency option on sequential-default Effect combinators.",
    },
    messages: {
      concurrency:
        'Effect.{{method}} runs sequentially by default. Choose an explicit concurrency policy at this composition site: 1 for serial execution, a finite budget for bounded parallel work, or "unbounded" when deliberate. This rule checks explicitness; state ownership must enforce correctness independently of concurrency.',
    },
  },
  createOnce(context) {
    return {
      CallExpression(node: ESTree.CallExpression) {
        const method = importedEffectFunctionName(
          context.sourceCode,
          node.callee,
          new Set(["Effect"]),
          combinators,
        );
        if (method === null || hasConcurrencyOption(node)) {
          return;
        }
        context.report({
          node,
          messageId: "concurrency",
          data: { method },
        });
      },
    };
  },
});
