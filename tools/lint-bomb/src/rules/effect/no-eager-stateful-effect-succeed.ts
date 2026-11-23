import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode } from "@oxlint/plugins";

import { resolveVariable } from "../../shared/scope.ts";
import { importedEffectFunctionName } from "../../shared/effect/effect-import.ts";
import { unwrapExpression } from "../../shared/effect/effect-call.ts";
import { isEffectDeferredCallback, isLazyEffectWorkflowCallback } from "../../shared/effect/effect-workflow.ts";
import { isTestFile } from "../../shared/file-scope.ts";

type FunctionNode = ESTree.Function | ESTree.ArrowFunctionExpression;

function enclosingFunction(node: ESTree.Node): FunctionNode | null {
  let current = node.parent;
  while (current !== null) {
    if (
      current.type === "FunctionDeclaration" ||
      current.type === "FunctionExpression" ||
      current.type === "ArrowFunctionExpression"
    )
      return current;
    current = current.parent;
  }
  return null;
}

function isExecutedCallback(sourceCode: SourceCode, fn: FunctionNode): boolean {
  return isLazyEffectWorkflowCallback(sourceCode, fn) || isEffectDeferredCallback(sourceCode, fn);
}

function assignmentTargetLeaves(target: ESTree.Node): ESTree.Node[] {
	if (target.type === "ArrayPattern") {
		return target.elements.flatMap((element) => element === null ? [] : assignmentTargetLeaves(element));
	}
	if (target.type === "ObjectPattern") {
		return target.properties.flatMap((property) =>
			property.type === "RestElement"
				? assignmentTargetLeaves(property.argument)
				: assignmentTargetLeaves(property.value),
		);
	}
	if (target.type === "AssignmentPattern") return assignmentTargetLeaves(target.left);
	if (target.type === "RestElement") return assignmentTargetLeaves(target.argument);
	return [target];
}

function succeedArgument(sourceCode: SourceCode, node: ESTree.Node): ESTree.Node | null {
  const fn = enclosingFunction(node);
  if (fn !== null && isExecutedCallback(sourceCode, fn)) return null;
  let current = node.parent;
  while (current !== null && current !== fn) {
    if (current.type === "CallExpression") {
      const argument = current.arguments[0];
      if (
        importedEffectFunctionName(sourceCode, current.callee, new Set(["Effect"]), new Set(["succeed"])) === "succeed" &&
        argument !== undefined &&
        argument.type !== "SpreadElement" &&
        node.start >= argument.start &&
        node.end <= argument.end
      )
        return argument;
    }
    current = current.parent;
  }
  return null;
}

function writesExternalBinding(
  sourceCode: SourceCode,
  target: ESTree.Node,
  node: ESTree.Node,
): boolean {
  let root = target;
  while (root.type === "MemberExpression") root = unwrapExpression(root.object);
  if (root.type !== "Identifier") return false;
  const variable = resolveVariable(sourceCode, root);
  const fn = enclosingFunction(node);
  // Fresh local builders are outside this warning's scope. Do not infer alias ownership.
  return (
    fn === null ||
    variable === null ||
    !variable.defs.some(
      (definition) => definition.type === "Variable" && enclosingFunction(definition.node) === fn,
    )
  );
}

/** Warn on direct writes to captured or parameter state while constructing a success value. */
export const noEagerStatefulEffectSucceedRule = defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Warn on direct captured or parameter writes inside Effect.succeed arguments outside recognized execution callbacks.",
    },
    messages: {
      eager:
        "This Effect.succeed argument writes to captured or parameter state during argument evaluation. For execution-time mutation, use the owner's Effect-native operation or Effect.sync so each execution performs the change. Pure construction can remain in Effect.succeed.",
    },
  },
  createOnce(context) {
    const reported = new Set<ESTree.Node>();
    const check = (node: ESTree.AssignmentExpression | ESTree.UpdateExpression) => {
      if (isTestFile(context.filename)) return;
      const argument = succeedArgument(context.sourceCode, node);
      if (argument === null || reported.has(argument)) return;
      const target = node.type === "AssignmentExpression" ? node.left : node.argument;
			if (!assignmentTargetLeaves(target).some((leaf) => writesExternalBinding(context.sourceCode, leaf, node))) return;
      reported.add(argument);
      context.report({ node: argument, messageId: "eager" });
    };
    return {
      Program() {
        reported.clear();
      },
      AssignmentExpression: check,
      UpdateExpression: check,
    };
  },
});
