import { defineRule } from "@oxlint/plugins";

import type { ESTree, Scope, SourceCode } from "@oxlint/plugins";

import { memberName, unwrapExpression } from "../../shared/effect/effect-call.ts";

function isGlobalObject(sourceCode: SourceCode, node: ESTree.Expression): boolean {
	if (node.type !== "Identifier" || node.name !== "Object") return false;
	if (sourceCode.isGlobalReference(node)) return true;
	let scope: Scope | null = sourceCode.getScope(node);
	while (scope !== null) {
		const variable = scope.set.get(node.name);
		if (variable !== undefined) return variable.defs.length === 0;
		scope = scope.upper;
	}
	return true;
}

function isObjectIteration(sourceCode: SourceCode, node: ESTree.Expression): boolean {
	const value = unwrapExpression(node);
	if (value.type !== "CallExpression") return false;
	const callee = unwrapExpression(value.callee);
	if (callee.type !== "MemberExpression") return false;
	const method = memberName(callee);
	return isGlobalObject(sourceCode, callee.object) && (method === "entries" || method === "values");
}

function isBroadType(type: ESTree.TSType): boolean {
	if (type.type === "TSParenthesizedType" || type.type === "TSTypeOperator") return isBroadType(type.typeAnnotation);
	if (type.type === "TSAnyKeyword" || type.type === "TSUnknownKeyword" || type.type === "TSObjectKeyword") return true;
	if (type.type === "TSArrayType") return isBroadType(type.elementType);
	if (type.type !== "TSTypeReference" || type.typeName.type !== "Identifier" || type.typeName.name !== "Array") return false;
	const [element] = type.typeArguments?.params ?? [];
	return element !== undefined && isBroadType(element);
}

const safetyCommentOwners = new Set([
	"ExpressionStatement",
	"PropertyDefinition",
	"ReturnStatement",
	"ThrowStatement",
	"VariableDeclaration",
]);

function isStandaloneComment(text: string, comment: ESTree.Comment): boolean {
	const lineStart = text.lastIndexOf("\n", comment.start - 1) + 1;
	return text.slice(lineStart, comment.start).trim() === "";
}

function isOxlintSuppression(comment: ESTree.Comment): boolean {
	return /^\s*oxlint-disable-next-line\b/u.test(comment.value);
}

function hasAdjacentSafetyComment(sourceCode: SourceCode, node: ESTree.Node): boolean {
	const text = sourceCode.getText();
	let current: ESTree.Node = node;
	while (true) {
		const comments = sourceCode
			.getCommentsBefore(current)
			.filter((comment) => comment.end <= node.start);
		for (let index = comments.length - 1; index >= 0; index -= 1) {
			const comment = comments[index];
			if (!/\bSAFETY\s*:/u.test(comment.value)) continue;
			if (!isStandaloneComment(text, comment)) break;

			const following = comments.slice(index + 1);
			if (!following.every(isOxlintSuppression)) break;
			const nearby = [comment, ...following];
			const separatedOnlyByWhitespace = nearby.every((item, itemIndex) => {
				const nextStart = itemIndex + 1 < nearby.length ? nearby[itemIndex + 1].start : current.start;
				return /^[ \t]*\r?\n[ \t]*$/u.test(text.slice(item.end, nextStart));
			});
			if (separatedOnlyByWhitespace) return true;
		}
		const parent = current.parent;
		if (safetyCommentOwners.has(current.type) || parent === null || parent.type === "Program") return false;
		current = parent;
	}
}

/** Require per-element admission before asserting Object.entries/values into a domain token array. */
export const noObjectIterationResultCastRule = defineRule({
	meta: {
		type: "problem",
		docs: { description: "Disallow direct casts of Object.entries/values results into domain collections." },
		messages: {
			iterationCast:
				"Object.entries/values widens element identity. Admit each element with a schema or predicate before asserting the collection type.",
		},
	},
	createOnce(context) {
		const check = (node: ESTree.TSAsExpression | ESTree.TSTypeAssertion) => {
			if (
				hasAdjacentSafetyComment(context.sourceCode, node) ||
				!isObjectIteration(context.sourceCode, node.expression) ||
				isBroadType(node.typeAnnotation)
			)
				return;
			context.report({ node, messageId: "iterationCast" });
		};
		return {
			TSAsExpression: check,
			TSTypeAssertion: check,
		};
	},
});
