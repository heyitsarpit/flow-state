import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode } from "@oxlint/plugins";

import { isImportedFromEffect } from "../../shared/effect-import.ts";
import { normalizedFilename } from "../../shared/file-scope.ts";

function isFlowRewriteSource(filename: string): boolean {
	return normalizedFilename(filename).includes("/packages/flow-state-rewrite/src/");
}

function isUnknown(
	type: ESTree.TSType,
	aliases: ReadonlyMap<string, ESTree.TSTypeAliasDeclaration>,
	substitutions: ReadonlyMap<string, ESTree.TSType>,
	memo: Map<string, boolean>,
	getTypeId: (type: ESTree.TSType) => number,
	seen: ReadonlySet<string> = new Set(),
): boolean {
	let current = type;
	while (current.type === "TSParenthesizedType") current = current.typeAnnotation;
	const typeKey =
		current.type === "TSTypeReference" && current.typeName.type === "Identifier"
			? `alias:${current.typeName.name}`
			: `node:${getTypeId(current)}`;
	const key = `${typeKey}|${[...substitutions.entries()]
		.map(([name, value]) => `${name}:${getTypeId(value)}`)
		.sort()
		.join(",")}|${[...seen].sort().join(",")}`;
	const cached = memo.get(key);
	if (cached !== undefined) return cached;
	let result = false;
	if (current.type === "TSUnknownKeyword") {
		result = true;
	} else if (current.type === "TSUnionType") {
		result = current.types.some((member) => isUnknown(member, aliases, substitutions, memo, getTypeId, seen));
	} else if (current.type === "TSIntersectionType") {
		result = current.types.every((member) => isUnknown(member, aliases, substitutions, memo, getTypeId, seen));
	} else if (current.type === "TSTypeReference" && current.typeName.type === "Identifier") {
		const substitution = substitutions.get(current.typeName.name);
		if (substitution !== undefined) {
			result = isUnknown(substitution, aliases, substitutions, memo, getTypeId, seen);
		} else if (!seen.has(current.typeName.name)) {
			const alias = aliases.get(current.typeName.name);
			if (alias !== undefined) {
				const nextSubstitutions = new Map(substitutions);
				for (const [index, parameter] of (alias.typeParameters?.params ?? []).entries()) {
					const argument = current.typeArguments?.params[index] ?? parameter.default;
					if (argument !== undefined && argument !== null) nextSubstitutions.set(parameter.name.name, argument);
				}
				const nextSeen = new Set(seen);
				nextSeen.add(current.typeName.name);
				result = isUnknown(alias.typeAnnotation, aliases, nextSubstitutions, memo, getTypeId, nextSeen);
			}
		}
	}
	memo.set(key, result);
	return result;
}

function typeNodeIdFactory(): (type: ESTree.TSType) => number {
	const ids = new WeakMap<object, number>();
	let nextId = 0;
	return (type) => {
		const object = type as object;
		const existing = ids.get(object);
		if (existing !== undefined) return existing;
		const id = nextId++;
		ids.set(object, id);
		return id;
	};
}

function resolveEffectType(
	type: ESTree.TSTypeReference,
	aliases: ReadonlyMap<string, ESTree.TSTypeAliasDeclaration>,
	sourceCode: SourceCode,
	substitutions: ReadonlyMap<string, ESTree.TSType>,
	seen: ReadonlySet<string> = new Set(),
): { readonly type: ESTree.TSTypeReference; readonly substitutions: ReadonlyMap<string, ESTree.TSType> } | null {
	if (isEffectTypeName(sourceCode, type.typeName)) return { type, substitutions };
	if (type.typeName.type !== "Identifier") return null;
	const substitution = substitutions.get(type.typeName.name);
	if (substitution?.type === "TSTypeReference") {
		return resolveEffectType(substitution, aliases, sourceCode, substitutions, seen);
	}
	if (seen.has(type.typeName.name)) return null;
	const alias = aliases.get(type.typeName.name);
	if (alias === undefined || alias.typeAnnotation.type !== "TSTypeReference") return null;
	const nextSubstitutions = new Map(substitutions);
	for (const [index, parameter] of (alias.typeParameters?.params ?? []).entries()) {
		const argument = type.typeArguments?.params[index] ?? parameter.default;
		if (argument !== undefined && argument !== null) nextSubstitutions.set(parameter.name.name, argument);
	}
	const nextSeen = new Set(seen);
	nextSeen.add(type.typeName.name);
	return resolveEffectType(alias.typeAnnotation, aliases, sourceCode, nextSubstitutions, nextSeen);
}

function isEffectTypeName(sourceCode: SourceCode, typeName: ESTree.TSTypeName): boolean {
	if (typeName.type === "Identifier") {
		return isImportedFromEffect(sourceCode, typeName, new Set(["Effect"]));
	}
	if (typeName.type !== "TSQualifiedName" || typeName.right.name !== "Effect") return false;
	if (typeName.left.type === "Identifier") {
		return isImportedFromEffect(sourceCode, typeName.left, new Set(["Effect"]));
	}
	return isEffectTypeName(sourceCode, typeName.left);
}

function isUnknownChannelWaiver(comment: { readonly value: string }): boolean {
	return /^\s*FLOW_STATE_ALLOW_UNKNOWN_EFFECT_CHANNEL(?:\s*[:\-]|\s*$)/u.test(comment.value);
}

function isStandaloneComment(
	sourceCode: SourceCode,
	comment: { readonly start: number; readonly end: number },
): boolean {
	const text = sourceCode.getText();
	const lineStart = Math.max(text.lastIndexOf("\n", comment.start - 1) + 1, 0);
	const lineEndIndex = text.indexOf("\n", comment.end);
	const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex;
	return text.slice(lineStart, comment.start).trim() === "" && text.slice(comment.end, lineEnd).trim() === "";
}

function hasAttachedWaiver(sourceCode: SourceCode, node: ESTree.Node): boolean {
	let owner: ESTree.Node = node;
	while (owner.parent !== null && owner.parent.type !== "Program" && owner.parent.type !== "TSTypeAliasDeclaration") {
		owner = owner.parent;
	}
	if (owner.parent?.type === "TSTypeAliasDeclaration") owner = owner.parent;
	const before = sourceCode.getCommentsBefore(owner).at(-1);
	if (before !== undefined && isUnknownChannelWaiver(before) && isStandaloneComment(sourceCode, before)) {
		const gap = sourceCode.getText().slice(before.end, owner.start);
		if (gap.trim() === "" && gap.includes("\n") && gap.split("\n").length <= 2) return true;
	}
	const after = sourceCode.getCommentsAfter(owner)[0];
	if (after !== undefined && isUnknownChannelWaiver(after) && isStandaloneComment(sourceCode, after)) {
		const gap = sourceCode.getText().slice(owner.end, after.start);
		if (gap.trim() === "" && gap.includes("\n") && gap.split("\n").length <= 2) return true;
	}
	return false;
}

/** Keep unknown out of public Effect failure and service channels. */
export const noUnknownEffectChannelRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow unexplained unknown in public Flow State Effect error and requirement channels.",
		},
		messages: {
			unknownChannel:
				"Do not erase an Effect channel to unknown. Name the Diagnostic failure or required service contract; keep unknown only at a documented internal decoding/erasure boundary.",
		},
	},
	createOnce(context) {
		const aliases = new Map<string, ESTree.TSTypeAliasDeclaration>();
		return {
			Program(node: ESTree.Program) {
				aliases.clear();
				for (const statement of node.body) {
					const declaration = statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
					if (declaration?.type === "TSTypeAliasDeclaration") {
						aliases.set(declaration.id.name, declaration);
					}
				}
			},
			TSTypeReference(node: ESTree.TSTypeReference) {
				if (!isFlowRewriteSource(context.filename)) return;
				const resolved = resolveEffectType(node, aliases, context.sourceCode, new Map());
				if (resolved === null) return;
				const parameters = resolved.type.typeArguments?.params ?? [];
				const getTypeId = typeNodeIdFactory();
				const memo = new Map<string, boolean>();
				for (const index of [1, 2]) {
					const parameter = parameters[index];
					if (
						parameter !== undefined &&
						isUnknown(parameter, aliases, resolved.substitutions, memo, getTypeId) &&
						!hasAttachedWaiver(context.sourceCode, node)
					) {
						context.report({ node: parameter, messageId: "unknownChannel" });
					}
				}
			},
		};
	},
});
