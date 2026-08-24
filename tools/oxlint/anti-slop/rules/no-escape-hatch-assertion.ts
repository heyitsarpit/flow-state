import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode } from "@oxlint/plugins";

import { isTestFile } from "../shared/file-scope.ts";

type TypeAssertion = ESTree.TSAsExpression | ESTree.TSTypeAssertion;

function isConstAssertion(node: TypeAssertion): boolean {
	return (
		node.typeAnnotation.type === "TSTypeReference" &&
		node.typeAnnotation.typeName.type === "Identifier" &&
		node.typeAnnotation.typeName.name === "const"
	);
}

function isBroadType(type: ESTree.TSType): boolean {
	if (
		type.type === "TSAnyKeyword" ||
		type.type === "TSUnknownKeyword" ||
		type.type === "TSNeverKeyword" ||
		type.type === "TSObjectKeyword"
	)
		return true;

	if (type.type === "TSParenthesizedType") return isBroadType(type.typeAnnotation);
	if (type.type === "TSUnionType") return type.types.some(isBroadType);

	if (type.type === "TSTypeReference" && type.typeName.type === "Identifier") {
		const name = type.typeName.name;
		const params = type.typeArguments?.params ?? [];
		if (name === "Readonly") return params[0] !== undefined && isBroadType(params[0]);
		if (name === "Record") return params[1] !== undefined && isBroadType(params[1]);
	}

	if (type.type === "TSTypeLiteral" && type.members.length === 1) {
		const [member] = type.members;
		return (
			member?.type === "TSIndexSignature" &&
			isBroadType(member.typeAnnotation.typeAnnotation)
		);
	}

	return false;
}

function hasExplicitAllowComment(sourceCode: SourceCode, node: TypeAssertion): boolean {
	return sourceCode
		.getCommentsBefore(node)
		.some((comment) => /ANTI-SLOP\s*:\s*allow\s+no-escape-hatch-assertion/u.test(comment.value));
}

function isAllowedBoundary(filename: string): boolean {
	const normalized = filename.replaceAll("\\", "/");
	return (
		isTestFile(filename) ||
		normalized.includes("/src/testing/") ||
		normalized.endsWith("/src/runtime/runtime-boot-decoder.ts")
	);
}

/** Disallow assertions that explicitly erase evidence before rebuilding a type. */
export const noEscapeHatchAssertionRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow as any, as unknown, as never, and broad dictionary assertions that erase type evidence.",
		},
		messages: {
			escapeHatch:
				"This assertion erases type evidence. Preserve the precise type, decode the value at its boundary, or isolate the intentional erasure behind a named adapter.",
		},
	},
	createOnce(context) {
		let allowedBoundary = false;
		const check = (node: TypeAssertion) => {
			if (allowedBoundary) return;
			if (
				node.parent?.type === "TSAsExpression" ||
				node.parent?.type === "TSTypeAssertion"
			) {
				// The chain itself is owned by no-chained-type-assertions. Avoid
				// making one escape hatch produce two overlapping diagnostics.
				return;
			}
			if (isConstAssertion(node) || !isBroadType(node.typeAnnotation)) return;
			if (hasExplicitAllowComment(context.sourceCode, node)) return;
			context.report({ node, messageId: "escapeHatch" });
		};

		return {
			Program() {
				allowedBoundary = isAllowedBoundary(context.filename);
			},
			TSAsExpression: check,
			TSTypeAssertion: check,
		};
	},
});
