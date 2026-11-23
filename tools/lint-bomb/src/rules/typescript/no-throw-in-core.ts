import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { isPathWithin } from "../../shared/module-path.ts";

function thrownName(argument: ESTree.Expression): string {
	const target =
		argument.type === "NewExpression" || argument.type === "CallExpression" ? argument.callee : argument;
	if (target.type === "Identifier") return target.name;
	if (target.type === "MemberExpression" && target.property.type === "Identifier") return target.property.name;
	return "";
}

function strings(value: unknown): string[] | undefined {
	return Array.isArray(value) && value.every((item): item is string => typeof item === "string")
		? value
		: undefined;
}

function readOptions(option: unknown): { sourceRoots: string[] | undefined; defects: string[] } {
	if (typeof option !== "object" || option === null || Array.isArray(option)) {
		return { sourceRoots: undefined, defects: [] };
	}
	return {
		sourceRoots: "sourceRoots" in option ? strings(option.sourceRoots) : undefined,
		defects: ("defects" in option ? strings(option.defects) : undefined) ?? [],
	};
}

/** In a pure core, throw only defects; return expected failures as values. */
export const noThrowInCoreRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow throw statements in configured core source roots, except for the named defect constructors or functions.",
		},
		messages: {
			throw:
				"A pure core returns expected failures as values: a Result, an Option, or a tagged variant the caller matches. Throw only a defect, an invariant this code guarantees and found broken, using one of the configured defect constructors.",
		},
		schema: [
			{
				type: "object",
				properties: {
					sourceRoots: { type: "array", items: { type: "string" } },
					defects: { type: "array", items: { type: "string" } },
				},
				additionalProperties: false,
			},
		],
		defaultOptions: [{ defects: [] }],
	},
	createOnce(context) {
		let options = readOptions(undefined);
		let sourceFile = false;
		return {
			Program() {
				options = readOptions(context.options?.[0]);
				const roots = options.sourceRoots;
				sourceFile =
					roots === undefined || roots.some((root) => isPathWithin(context.filename, root, context.cwd));
			},
			ThrowStatement(node: ESTree.ThrowStatement) {
				if (!sourceFile || options.defects.includes(thrownName(node.argument))) return;
				context.report({ node, messageId: "throw" });
			},
		};
	},
});
