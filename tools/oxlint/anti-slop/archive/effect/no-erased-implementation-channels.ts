// Archived: superseded by anti-slop/no-unknown. Retained for historical reference; not registered.
import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode } from "@oxlint/plugins";

import { isImportedFromEffect } from "../../shared/effect/effect-import.ts";
import { isPathWithin } from "../../shared/module-path.ts";

type RuleOptions = [{ sourceRoots?: string[] }];

function isUnknown(type: ESTree.TSType): boolean {
	if (type.type === "TSUnknownKeyword") return true;
	if (type.type === "TSParenthesizedType") return isUnknown(type.typeAnnotation);
	return type.type === "TSUnionType" && type.types.some(isUnknown);
}

function isEffectType(sourceCode: SourceCode, type: ESTree.TSTypeReference): boolean {
	if (type.typeName.type === "Identifier") return isImportedFromEffect(sourceCode, type.typeName, new Set(["Effect"]));
	return type.typeName.type === "TSQualifiedName" && type.typeName.right.name === "Effect" &&
		type.typeName.left.type === "Identifier" && isImportedFromEffect(sourceCode, type.typeName.left, new Set(["Effect"]));
}

function implementationContainer(node: ESTree.Node): boolean {
	let current: ESTree.Node | null = node.parent;
	while (current !== null && current.type !== "Program") {
		if (
			(current.type === "TSTypeAliasDeclaration" || current.type === "TSInterfaceDeclaration") &&
			/(?:adapter|capability|implementation|provider)/iu.test(current.id.name)
		) return true;
		current = current.parent;
	}
	return false;
}

function isAcquireProperty(node: ESTree.Node): boolean {
	let current: ESTree.Node | null = node.parent;
	while (current !== null && current.type !== "Program") {
		if (current.type === "TSPropertySignature") {
			return !current.computed && current.key.type === "Identifier" && current.key.name === "acquire";
		}
		current = current.parent;
	}
	return false;
}

function hasAttachedWaiver(sourceCode: SourceCode, node: ESTree.Node): boolean {
	let owner: ESTree.Node = node;
	while (owner.parent !== null && owner.parent.type !== "Program" && owner.parent.type !== "TSTypeAliasDeclaration") {
		owner = owner.parent;
	}
	if (owner.parent?.type === "TSTypeAliasDeclaration") owner = owner.parent;
	const comment = sourceCode.getCommentsBefore(owner).at(-1);
	if (comment === undefined || !/^\s*FLOW_STATE_ALLOW_UNKNOWN_EFFECT_CHANNEL(?:\s*[:\-]|\s*$)/u.test(comment.value)) return false;
	const text = sourceCode.getText();
	const lineStart = Math.max(text.lastIndexOf("\n", comment.start - 1) + 1, 0);
	const lineEndIndex = text.indexOf("\n", comment.end);
	const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex;
	if (text.slice(lineStart, comment.start).trim() !== "" || text.slice(comment.end, lineEnd).trim() !== "") return false;
	const gap = text.slice(comment.end, owner.start);
	return gap.trim() === "" && gap.includes("\n") && gap.split("\n").length <= 2;
}

/** Review implementation graph A/E/R channels; isolate existential erasure in one proven owner. */
export const noErasedImplementationChannelsRule = defineRule({
	meta: {
		type: "suggestion",
		docs: { description: "Review unexplained all-unknown Effect channels in implementation and provider storage." },
		schema: [
			{
				type: "object",
				properties: { sourceRoots: { type: "array", items: { type: "string" } } },
				additionalProperties: false,
			},
		],
		defaultOptions: [{ sourceRoots: [] }] satisfies RuleOptions,
		messages: {
			channel: "Do not erase implementation Effect A/E/R channels to unknown without the documented FLOW_STATE_ALLOW_UNKNOWN_EFFECT_CHANNEL owner waiver.",
		},
	},
	createOnce(context) {
		let sourceFile = true;
		return {
			Program() {
				const option = context.options?.[0];
				const rawRoots = typeof option === "object" && option !== null && !Array.isArray(option)
					? option.sourceRoots
					: undefined;
				const roots = Array.isArray(rawRoots) && rawRoots.every((root): root is string => typeof root === "string")
					? rawRoots
					: [];
				sourceFile = roots.length === 0 || roots.some((root) => isPathWithin(context.filename, root));
			},
			TSTypeReference(node: ESTree.TSTypeReference) {
				if (!sourceFile || !implementationContainer(node) || !isAcquireProperty(node) || !isEffectType(context.sourceCode, node)) return;
				const parameters = node.typeArguments?.params ?? [];
				if (parameters.length === 3 && parameters.every(isUnknown) && !hasAttachedWaiver(context.sourceCode, node)) {
					context.report({ node, messageId: "channel" });
				}
			},
		};
	},
});
