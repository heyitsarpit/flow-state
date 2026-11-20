import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode } from "@oxlint/plugins";

type TypeAssertion = ESTree.TSAsExpression | ESTree.TSTypeAssertion;

const commentOwnerKinds = new Set([
  "ExpressionStatement",
  "PropertyDefinition",
  "ReturnStatement",
  "ThrowStatement",
  "VariableDeclaration",
]);

function isConstAssertion(node: TypeAssertion): boolean {
  return (
    node.typeAnnotation.type === "TSTypeReference" &&
    node.typeAnnotation.typeName.type === "Identifier" &&
    node.typeAnnotation.typeName.name === "const"
  );
}

function isDirectUnknownTarget(type: ESTree.TSType): boolean {
	let current = type;
	while (current.type === "TSParenthesizedType") current = current.typeAnnotation;
	return current.type === "TSUnknownKeyword";
}

function hasSafetyJustificationBefore(sourceCode: SourceCode, owner: ESTree.Node, assertion: TypeAssertion): boolean {
  return sourceCode.getCommentsBefore(owner).some((comment) => {
    const text = comment.value.replace(/^\s*\* ?/gmu, "");
    return comment.end <= assertion.start && /(?:^|[^\p{L}\p{N}_])SAFETY\s*:\s*\S/u.test(text);
  });
}

function hasSafetyComment(sourceCode: SourceCode, node: TypeAssertion): boolean {
  let current: ESTree.Node = node;
  while (true) {
    if (hasSafetyJustificationBefore(sourceCode, current, node)) return true;
    if (commentOwnerKinds.has(current.type)) {
      const owner = current.parent;
      return owner.type === "ExportNamedDeclaration" && owner.declaration === current &&
        hasSafetyJustificationBefore(sourceCode, owner, node);
    }
    if (current.parent.type === "Program") return false;
    current = current.parent;
  }
}

/** Require every non-const type assertion to state the invariant TypeScript cannot express. */
export const requireSafetyCommentForTypeAssertionRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Require a nearby SAFETY comment for every TypeScript type assertion except const assertions and direct widening to unknown.",
    },
    messages: {
      missingSafetyComment:
        "Prefer construction or generic relationships that preserve type evidence. If this assertion is unavoidable, add an adjacent SAFETY: comment stating the specific established invariant. A comment does not validate input or make an unsound assertion safe.",
    },
  },
  createOnce(context) {
    const checkAssertion = (node: TypeAssertion) => {
			if (
				isConstAssertion(node) ||
				isDirectUnknownTarget(node.typeAnnotation) ||
				hasSafetyComment(context.sourceCode, node)
			) {
				return;
			}
      context.report({ node, messageId: "missingSafetyComment" });
    };

    return {
      TSAsExpression: checkAssertion,
      TSTypeAssertion: checkAssertion,
    };
  },
});
