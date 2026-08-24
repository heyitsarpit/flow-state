import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { isTestFile } from "../shared/file-scope.ts";

function normalizedFilename(filename: string): string {
	return filename.replaceAll("\\", "/");
}

function isAllowedBoundary(filename: string): boolean {
	const normalized = normalizedFilename(filename);
	return (
		!/\.tsx?$/u.test(normalized) ||
		isTestFile(filename) ||
		normalized.endsWith("/src/runtime/runtime-boot-decoder.ts") ||
		normalized.endsWith("/src/core/inspection/trace-artifact.ts")
	);
}

function isJsonParse(node: ESTree.Expression): boolean {
	return (
		node.type === "CallExpression" &&
		node.callee.type === "MemberExpression" &&
		!node.callee.computed &&
		node.callee.object.type === "Identifier" &&
		node.callee.object.name === "JSON" &&
		node.callee.property.type === "Identifier" &&
		node.callee.property.name === "parse"
	);
}

/** Require complete decoding before JSON.parse becomes a domain value. */
export const noShallowJsonDomainCastRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow returning or asserting JSON.parse values as domain contracts before complete decoding.",
		},
		messages: {
			jsonParse:
				"This JSON.parse value crosses the boundary without complete decoding. Use Schema or a named security decoder before returning a domain type.",
		},
	},
	createOnce(context) {
		let allowedBoundary = false;

		const report = (node: ESTree.Node) => context.report({ node, messageId: "jsonParse" });

		return {
			Program() {
				allowedBoundary = isAllowedBoundary(context.filename);
			},
			TSAsExpression(node: ESTree.TSAsExpression) {
				if (allowedBoundary) return;
				if (isJsonParse(node.expression)) report(node);
			},
			TSTypeAssertion(node: ESTree.TSTypeAssertion) {
				if (allowedBoundary) return;
				if (isJsonParse(node.expression)) report(node);
			},
			VariableDeclarator(node: ESTree.VariableDeclarator) {
				if (allowedBoundary) return;
				if (node.init !== null && isJsonParse(node.init)) report(node.init);
			},
			AssignmentExpression(node: ESTree.AssignmentExpression) {
				if (allowedBoundary) return;
				if (isJsonParse(node.right)) report(node.right);
			},
			ReturnStatement(node: ESTree.ReturnStatement) {
				if (allowedBoundary) return;
				if (node.argument !== null && isJsonParse(node.argument)) report(node.argument);
			},
		};
	},
});
