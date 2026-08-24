import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

function importsEffect(program: ESTree.Program): boolean {
	return program.body.some(
		(statement) =>
			statement.type === "ImportDeclaration" &&
			(statement.source.value === "effect" || statement.source.value.startsWith("effect/")) &&
			statement.importKind !== "type" &&
				(statement.specifiers.length === 0 ||
					statement.specifiers.some((specifier) => specifier.type !== "ImportSpecifier" || specifier.importKind !== "type")),
	);
}

/** Keep Effect-module failures in the typed error channel instead of raw try/catch. */
export const noRawTryCatchRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description: "Disallow native try/catch in modules that import Effect.",
		},
		messages: {
			rawTryCatch:
				"Raw try/catch is not allowed in an Effect module. Use Effect.try or Effect.tryPromise and map the cause into the typed error channel.",
		},
	},
	createOnce(context) {
		let effectModule = false;
		return {
			Program(node: ESTree.Program) {
				effectModule = importsEffect(node);
			},
				TryStatement(node: ESTree.TryStatement) {
					if (effectModule && node.handler !== null) context.report({ node, messageId: "rawTryCatch" });
			},
		};
	},
});
