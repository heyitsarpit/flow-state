import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

type TypeNode = ESTree.Node & { type: string };

function aliasName(node: ESTree.TSTypeAliasDeclaration): string {
	return node.id.name;
}

function referencedAliasName(node: TypeNode): string | null {
	if (node.type !== "TSTypeReference") return null;
	const typeName = (node as TypeNode & { typeName?: TypeNode }).typeName;
	return typeName?.type === "Identifier" ? (typeName as TypeNode & { name: string }).name : null;
}

function unionMembers(
	node: TypeNode,
	aliases: ReadonlyMap<string, ESTree.TSTypeAliasDeclaration>,
	seen: Set<string>,
): TypeNode[] | null {
	if (node.type === "TSUnionType") return (node as TypeNode & { types: TypeNode[] }).types;
	const reference = referencedAliasName(node);
	if (reference === null || seen.has(reference)) return null;
	const alias = aliases.get(reference);
	if (alias === undefined) return null;
	seen.add(reference);
	return unionMembers(alias.typeAnnotation as TypeNode, aliases, seen);
}

function typeLiteralMembers(
	node: TypeNode,
	aliases: ReadonlyMap<string, ESTree.TSTypeAliasDeclaration>,
	seen: Set<string>,
): TypeNode[] | null {
	if (node.type === "TSTypeLiteral") {
		return (node as TypeNode & { members: TypeNode[] }).members;
	}
	if (node.type === "TSIntersectionType") {
		const combined: TypeNode[] = [];
		for (const member of (node as TypeNode & { types: TypeNode[] }).types) {
			const resolved = typeLiteralMembers(member, aliases, new Set(seen));
			if (resolved === null) return null;
			combined.push(...resolved);
		}
		return combined;
	}
	if (node.type === "TSTypeReference" && referencedAliasName(node) === "Readonly") {
		const wrapped = (node as ESTree.TSTypeReference).typeArguments?.params[0];
		return wrapped === undefined
			? null
			: typeLiteralMembers(wrapped as TypeNode, aliases, new Set(seen));
	}
	const reference = referencedAliasName(node);
	if (reference === null || seen.has(reference)) return null;
	const alias = aliases.get(reference);
	if (alias === undefined) return null;
	seen.add(reference);
	return typeLiteralMembers(alias.typeAnnotation as TypeNode, aliases, seen);
}

function propertyName(node: TypeNode): string | null {
	if (node.type !== "TSPropertySignature") return null;
	const key = (node as TypeNode & { key: TypeNode }).key;
	if (key.type === "Identifier") return (key as TypeNode & { name: string }).name;
	if (key.type === "Literal") {
		const value = (key as TypeNode & { value: unknown }).value;
		return typeof value === "string" ? value : null;
	}
	return null;
}

function stringLiterals(node: TypeNode): string[] | null {
	if (node.type !== "TSLiteralType") return null;
	const literal = (node as TypeNode & { literal?: TypeNode }).literal;
	if (literal?.type !== "Literal") return null;
	const value = (literal as TypeNode & { value: unknown }).value;
	return typeof value === "string" ? [value] : null;
}

function isSemanticProjectionAlias(name: string): boolean {
	return /(?:Cause|Envelope|Evidence|Projection|Wire)/u.test(name);
}

function isCauseReasonProjection(
	name: string,
	variants: readonly { tag: string }[],
): boolean {
	if (!/(?:Cause|FailureReason)$/iu.test(name) || variants.length !== 3) return false;
	const tags = new Set(variants.map(({ tag }) => tag.toLowerCase()));
	return tags.size === 3 && tags.has("fail") && tags.has("die") && tags.has("interrupt");
}

function isCompleteEffectOutcome(variants: readonly { tag: string }[]): boolean {
	const tags = new Set(variants.map(({ tag }) => tag.toLowerCase()));
	return (
		tags.size === 4 &&
		tags.has("success") &&
		tags.has("failure") &&
		tags.has("defect") &&
		tags.has("interrupt")
	);
}

function tagLiterals(members: readonly TypeNode[]): string[] | null {
	const tag = members.find((member) => {
		const name = propertyName(member);
		return name === "_tag";
	});
	if (tag === undefined) return null;
	const annotation = (tag as TypeNode & { typeAnnotation?: { typeAnnotation?: TypeNode } }).typeAnnotation
		?.typeAnnotation;
	return annotation === undefined ? null : stringLiterals(annotation);
}

function taggedVariants(
	node: ESTree.TSTypeAliasDeclaration,
	aliases: ReadonlyMap<string, ESTree.TSTypeAliasDeclaration>,
): Array<{ tag: string; members: TypeNode[] }> | null {
	const members = unionMembers(node.typeAnnotation as TypeNode, aliases, new Set([aliasName(node)]));
	if (members === null) return null;
	const variants: Array<{ tag: string; members: TypeNode[] }> = [];
	for (const member of members) {
		const fields = typeLiteralMembers(member, aliases, new Set([aliasName(node)]));
		if (fields === null) return null;
		const tags = tagLiterals(fields);
		if (tags === null) return null;
		for (const tag of tags) variants.push({ tag, members: fields });
	}
	return variants;
}

function isResultLike(variants: readonly { tag: string; members: TypeNode[] }[]): boolean {
	if (variants.length !== 2) return false;
	const success = variants.find(({ tag }) => /(?:success|ok|observation)$/iu.test(tag));
	const failure = variants.find(({ tag }) => /(?:failure|error|defect)$/iu.test(tag));
	if (success === undefined || failure === undefined || success === failure) return false;
	const successFields = success.members.filter((member) => {
		const name = propertyName(member);
		return name !== "_tag";
	});
	const failureFields = failure.members.filter((member) => {
		const name = propertyName(member);
		return name !== "_tag";
	});
	return successFields.length > 0 && failureFields.length > 0;
}

function isTopLevelAlias(node: ESTree.TSTypeAliasDeclaration): boolean {
	return (
		node.parent.type === "Program" ||
		(node.parent.type === "ExportNamedDeclaration" && node.parent.parent.type === "Program")
	);
}

/** Prefer native Effect data types for explicitly audited hand-written tagged aliases. */
export const preferEffectNativeTaggedTypesRule = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Suggest Effect Result or Data.TaggedEnum for configured hand-written tagged type aliases.",
		},
		messages: {
			result:
				"`{{name}}` hand-writes a two-way success/failure outcome. Use Effect `Result.Result<Success, Failure>` directly.",
			taggedEnum:
				"`{{name}}` hand-writes a multi-state tagged object union. Define it with Effect `Data.TaggedEnum` and construct variants through `Data.taggedEnum`.",
		},
		schema: [],
	},
	createOnce(context) {
		const aliases = new Map<string, ESTree.TSTypeAliasDeclaration>();
		return {
			Program() {
				aliases.clear();
			},
			TSTypeAliasDeclaration(node: ESTree.TSTypeAliasDeclaration) {
				if (!isTopLevelAlias(node)) return;
				aliases.set(aliasName(node), node);
			},
			"Program:exit"() {
				const wrappedAliases = new Set<string>();
				for (const alias of aliases.values()) {
					const reference = referencedAliasName(alias.typeAnnotation as TypeNode);
					if (reference !== null) wrappedAliases.add(reference);
				}
				for (const alias of aliases.values()) {
					if (wrappedAliases.has(aliasName(alias))) continue;
					if (isSemanticProjectionAlias(aliasName(alias))) continue;
					const variants = taggedVariants(alias, aliases);
					if (variants === null) continue;
					if (isCauseReasonProjection(aliasName(alias), variants)) continue;
					if (isCompleteEffectOutcome(variants)) continue;
					if (isResultLike(variants)) {
						context.report({ node: alias, messageId: "result", data: { name: aliasName(alias) } });
					}
					if (
						variants.length >= 3 &&
						new Set(variants.map(({ tag }) => tag)).size === variants.length
					) {
						context.report({ node: alias, messageId: "taggedEnum", data: { name: aliasName(alias) } });
					}
				}
			},
		};
	},
});
