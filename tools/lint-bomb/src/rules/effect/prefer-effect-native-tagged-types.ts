import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode } from "@oxlint/plugins";

import { resolveVariable } from "../../shared/scope.ts";
import { createTypeEnvironment, isShadowedByTypeParameter, resolveTypeAlias } from "../../shared/dictionary-types.ts";
import { importedEffectFunctionName, isImportedFromEffect } from "../../shared/effect/effect-import.ts";
import { memberName, unwrapExpression } from "../../shared/effect/effect-call.ts";

import { configuredPath, isPathWithin } from "../../shared/module-path.ts";

type RuleOptions = [{ modelRoots?: string[]; modelFiles?: string[]; excludedFiles?: string[] }];

const defaultOptions: RuleOptions = [{}];

type TypeNode = ESTree.Node & { type: string };

function aliasName(node: ESTree.TSTypeAliasDeclaration): string {
	return node.id.name;
}

function referencedAliasName(node: TypeNode): string | null {
	if (node.type !== "TSTypeReference") return null;
	const typeName = (node as TypeNode & { typeName?: TypeNode }).typeName;
	return typeName?.type === "Identifier" ? (typeName as TypeNode & { name: string }).name : null;
}

function hasTypeArguments(node: TypeNode): boolean {
	if (node.type !== "TSTypeReference") return false;
	return ((node as ESTree.TSTypeReference).typeArguments?.params.length ?? 0) > 0;
}

function hasTypeParameters(node: ESTree.TSTypeAliasDeclaration): boolean {
	return (node.typeParameters?.params.length ?? 0) > 0;
}

function bindingName(node: TypeNode): string | null {
	const id = (node as TypeNode & { id?: TypeNode }).id;
	return id?.type === "Identifier" ? (id as TypeNode & { name: string }).name : null;
}

function declaresTypeName(node: TypeNode, name: string): boolean {
	if (node.type === "ImportDeclaration") {
		const specifiers = (node as TypeNode & { specifiers?: Array<{ local?: TypeNode }> }).specifiers ?? [];
		return specifiers.some(
			({ local }) => local?.type === "Identifier" && (local as TypeNode & { name: string }).name === name,
		);
	}
	if (
		node.type === "TSTypeAliasDeclaration" ||
		node.type === "TSInterfaceDeclaration" ||
		node.type === "ClassDeclaration" ||
		node.type === "TSEnumDeclaration" ||
		node.type === "TSModuleDeclaration" ||
		node.type === "TSImportEqualsDeclaration"
	) {
		return bindingName(node) === name;
	}
	return false;
}

function declaresTopLevelTypeName(statements: readonly TypeNode[], name: string): boolean {
	return statements.some((statement) => {
		if (statement.type === "ExportNamedDeclaration") {
			const declaration = (statement as TypeNode & { declaration?: TypeNode | null }).declaration;
			return declaration !== undefined && declaration !== null && declaresTypeName(declaration, name);
		}
		if (statement.type === "ExportDefaultDeclaration") {
			const declaration = (statement as TypeNode & { declaration: TypeNode }).declaration;
			return declaresTypeName(declaration, name);
		}
		return declaresTypeName(statement, name);
	});
}

function unionMembers(
	node: TypeNode,
	aliases: ReadonlyMap<string, ESTree.TSTypeAliasDeclaration>,
	seen: Set<string>,
	ignoreGenericAliases: boolean,
): TypeNode[] | null {
	if (ignoreGenericAliases && hasTypeArguments(node)) return null;
	if (node.type === "TSUnionType") return (node as TypeNode & { types: TypeNode[] }).types;
	const reference = referencedAliasName(node);
	if (reference === null || seen.has(reference)) return null;
	const alias = aliases.get(reference);
	if (alias === undefined || ignoreGenericAliases && hasTypeParameters(alias)) return null;
	seen.add(reference);
	return unionMembers(alias.typeAnnotation as TypeNode, aliases, seen, ignoreGenericAliases);
}

function typeLiteralMembers(
	node: TypeNode,
	aliases: ReadonlyMap<string, ESTree.TSTypeAliasDeclaration>,
	seen: Set<string>,
	ignoreGenericAliases: boolean,
	allowBuiltinReadonly: boolean,
): TypeNode[] | null {
	if (node.type === "TSTypeLiteral") {
		return (node as TypeNode & { members: TypeNode[] }).members;
	}
	if (node.type === "TSIntersectionType") {
		const combined: TypeNode[] = [];
		for (const member of (node as TypeNode & { types: TypeNode[] }).types) {
			const resolved = typeLiteralMembers(
				member,
				aliases,
				new Set(seen),
				ignoreGenericAliases,
				allowBuiltinReadonly,
			);
			if (resolved === null) return null;
			combined.push(...resolved);
		}
		return combined;
	}
	const isBuiltinReadonly =
		allowBuiltinReadonly && node.type === "TSTypeReference" && referencedAliasName(node) === "Readonly";
	if (ignoreGenericAliases && hasTypeArguments(node) && !isBuiltinReadonly) return null;
	if (isBuiltinReadonly) {
		const wrapped = (node as ESTree.TSTypeReference).typeArguments?.params[0];
		return wrapped === undefined
			? null
			: typeLiteralMembers(
					wrapped as TypeNode,
					aliases,
					new Set(seen),
					ignoreGenericAliases,
					allowBuiltinReadonly,
				);
	}
	const reference = referencedAliasName(node);
	if (reference === null || seen.has(reference)) return null;
	const alias = aliases.get(reference);
	if (alias === undefined || ignoreGenericAliases && hasTypeParameters(alias)) return null;
	seen.add(reference);
	return typeLiteralMembers(
		alias.typeAnnotation as TypeNode,
		aliases,
		seen,
		ignoreGenericAliases,
		allowBuiltinReadonly,
	);
}

function propertyName(node: TypeNode): string | null {
	if (node.type !== "TSPropertySignature" && node.type !== "Property") return null;
	const key = (node as TypeNode & { key: TypeNode }).key;
	if (key.type === "Identifier" && !(node as ESTree.TSPropertySignature).computed) {
		return (key as TypeNode & { name: string }).name;
	}
	if (key.type === "Literal") {
		const value = (key as TypeNode & { value: unknown }).value;
		return typeof value === "string" ? value : null;
	}
	if (key.type === "TemplateLiteral") {
		const template = key as ESTree.TemplateLiteral;
		return template.expressions.length === 0 ? template.quasis[0]?.value.cooked ?? null : null;
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
	ignoreGenericAliases = false,
	allowBuiltinReadonly = true,
): Array<{ tag: string; members: TypeNode[] }> | null {
	if (ignoreGenericAliases && hasTypeParameters(node)) return null;
	const members = unionMembers(
		node.typeAnnotation as TypeNode,
		aliases,
		new Set([aliasName(node)]),
		ignoreGenericAliases,
	);
	if (members === null) return null;
	const variants: Array<{ tag: string; members: TypeNode[] }> = [];
	for (const member of members) {
		const fields = typeLiteralMembers(
			member,
			aliases,
			new Set([aliasName(node)]),
			ignoreGenericAliases,
			allowBuiltinReadonly,
		);
		if (fields === null) return null;
		const tags = tagLiterals(fields);
		if (tags === null) return null;
		for (const tag of tags) variants.push({ tag, members: fields });
	}
	return variants;
}

function isDirectLiteralUnion(node: ESTree.TSTypeAliasDeclaration): boolean {
	const annotation = node.typeAnnotation as TypeNode;
	return (
		annotation.type === "TSUnionType" &&
		(annotation as TypeNode & { types: TypeNode[] }).types.every((member) => member.type === "TSTypeLiteral")
	);
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

function isConfiguredModelFile(
	filename: string,
	options: RuleOptions[0] | undefined,
	cwd: string,
): boolean {
	const modelRoots = options?.modelRoots ?? [];
	const modelFiles = options?.modelFiles ?? [];
	const excludedFiles = options?.excludedFiles ?? [];
	const matchesFile = (file: string) => configuredPath(filename, cwd) === configuredPath(file, cwd);
	const included =
		modelFiles.some(matchesFile) || modelRoots.some((root) => isPathWithin(filename, root, cwd));
	return included && !excludedFiles.some(matchesFile);
}

function literalValueTag(node: ESTree.ObjectExpression): string | null {
	for (const property of node.properties) {
		if (property.type !== "Property" || propertyName(property as TypeNode) !== "_tag") continue;
		const value = unwrapExpression(property.value);
		if (value.type === "Literal" && typeof value.value === "string") return value.value;
	}
	return null;
}

function modelFactory(
	sourceCode: SourceCode,
	expression: ESTree.Expression,
): "Data" | "Schema" | null {
	const value = unwrapExpression(expression);
	if (value.type !== "Identifier") return null;
	const variable = resolveVariable(sourceCode, value);
	if (
		variable === null ||
		variable.references.some((reference) => reference.isWrite() && !reference.init)
	)
		return null;
	const definitions = variable.defs.filter((definition) => definition.type === "Variable");
	if (definitions.length !== 1) return null;
	const definition = definitions[0];
	if (
		definition?.node.type !== "VariableDeclarator" ||
		definition.node.init === null ||
		definition.parent?.type !== "VariableDeclaration" ||
		definition.parent.kind !== "const"
	)
		return null;
	const factory = unwrapExpression(definition.node.init);
	if (factory.type !== "CallExpression") return null;
	if (
		importedEffectFunctionName(
			sourceCode,
			factory.callee,
			new Set(["Data"]),
			new Set(["taggedEnum"]),
		) !== null
	)
		return "Data";
	return importedEffectFunctionName(
		sourceCode,
		factory.callee,
		new Set(["Schema"]),
		new Set(["Struct", "TaggedStruct", "TaggedUnion", "Union"]),
	) !== null
		? "Schema"
		: null;
}

function isConstructorInput(node: ESTree.ObjectExpression, sourceCode: SourceCode): boolean {
	let current: ESTree.Node = node;
	while (
		current.parent !== null &&
		[
			"ParenthesizedExpression",
			"TSAsExpression",
			"TSTypeAssertion",
			"TSSatisfiesExpression",
		].includes(current.parent.type)
	)
		current = current.parent;
	const parent = current.parent;
	if (parent?.type !== "CallExpression" || parent.arguments[0] !== current) return false;
	const callee = unwrapExpression(parent.callee);
	if (callee.type !== "MemberExpression") return false;
	let owner = unwrapExpression(callee.object);
	while (owner.type === "MemberExpression") owner = unwrapExpression(owner.object);
	const factory = modelFactory(sourceCode, owner);
	return factory === "Schema"
		? memberName(callee) === "make"
		: factory === "Data" && memberName(callee) === literalValueTag(node);
}

function constructionType(
	node: ESTree.ObjectExpression,
	sourceCode: SourceCode,
): ESTree.TSType | null {
	let current: ESTree.Node = node;
	while (current.parent?.type === "ParenthesizedExpression") current = current.parent;
	const parent = current.parent;
	if (
		parent.type === "TSAsExpression" ||
		parent.type === "TSTypeAssertion" ||
		parent.type === "TSSatisfiesExpression"
	)
		return parent.typeAnnotation;
	if (parent.type === "VariableDeclarator" && parent.id.type === "Identifier")
		return parent.id.typeAnnotation?.typeAnnotation ?? null;
	if (
		parent.type === "AssignmentExpression" &&
		parent.right === current &&
		parent.left.type === "Identifier"
	) {
		const variable = resolveVariable(sourceCode, parent.left);
		for (const definition of variable?.defs ?? []) {
			if (definition.node.type === "VariableDeclarator" && definition.node.id.type === "Identifier")
				return definition.node.id.typeAnnotation?.typeAnnotation ?? null;
		}
	}
	if (
		parent.type === "ReturnStatement" ||
		(parent.type === "ArrowFunctionExpression" && parent.body === current)
	) {
		let owner: ESTree.Node | null = parent;
		while (owner !== null) {
			if (
				owner.type === "FunctionDeclaration" ||
				owner.type === "FunctionExpression" ||
				owner.type === "ArrowFunctionExpression"
			)
				return owner.returnType?.typeAnnotation ?? null;
			owner = owner.parent;
		}
	}
	return null;
}

function ownedTaggedType(
	sourceCode: SourceCode,
	type: ESTree.TSType,
	seen = new Set<ESTree.Node>(),
): boolean {
	if (seen.has(type)) return false;
	seen.add(type);
	if (type.type === "TSParenthesizedType")
		return ownedTaggedType(sourceCode, type.typeAnnotation, seen);
	if (type.type === "TSTypeQuery") {
		const name = type.exprName;
		if (
			name.type !== "TSQualifiedName" ||
			name.right.name !== "Type" ||
			name.left.type !== "Identifier"
		)
			return false;
		return modelFactory(sourceCode, name.left) === "Schema";
	}
	if (type.type !== "TSTypeReference") return false;
	const name = type.typeName;
	if (name.type === "TSQualifiedName") {
		if (name.right.name === "TaggedEnum") {
			const data =
				name.left.type === "TSQualifiedName" && name.left.right.name === "Data"
					? name.left.left
					: name.left;
			return (
				data.type === "Identifier" && isImportedFromEffect(sourceCode, data, new Set(["Data"]))
			);
		}
		const schema =
			name.left.type === "TSQualifiedName" && name.left.right.name === "Schema"
				? name.left.left
				: name.left;
		return (
			name.right.name === "Type" &&
			schema.type === "Identifier" &&
			isImportedFromEffect(sourceCode, schema, new Set(["Schema"]))
		);
	}
	if (name.type !== "Identifier" || isShadowedByTypeParameter(name.name, type)) return false;
	if (
		importedEffectFunctionName(sourceCode, name, new Set(["Data"]), new Set(["TaggedEnum"])) !==
		null
	)
		return true;
	const alias = resolveTypeAlias(type, createTypeEnvironment(sourceCode.ast));
	return alias !== null && ownedTaggedType(sourceCode, alias.typeAnnotation, seen);
}

function isTypedMatchPattern(node: ESTree.ObjectExpression, sourceCode: SourceCode): boolean {
	let current: ESTree.Node = node;
	while (current.parent !== null) {
		const parent: ESTree.Node = current.parent;
		if (
			parent.type === "FunctionDeclaration" ||
			parent.type === "FunctionExpression" ||
			parent.type === "ArrowFunctionExpression"
		)
			return false;
		if (parent.type === "CallExpression")
			return (
				parent.arguments[0] === current &&
				importedEffectFunctionName(
					sourceCode,
					parent.callee,
					new Set(["Match"]),
					new Set(["when", "not"]),
				) !== null
			);
		current = parent;
	}
	return false;
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
			construction: "Use the constructor that owns {{model}}: a Data.taggedEnum variant constructor or the Schema-owned .make or variant constructor. Do not hand-write _tag or duplicate a Schema model with Data.",
			result:
				"{{name}} hand-writes success and failure alternatives. Use Result.Result<Success, Failure> for a pure outcome, or Exit for a complete Effect outcome. If this is an admitted or encoded contract, let Schema own its variants.",
			taggedEnum:
				"{{name}} hand-writes a closed tagged model. Use Data.TaggedEnum with Data.taggedEnum for trusted domain variants. For admitted or encoded variants, let Schema own the model and derive its matching; do not duplicate it with a parallel Data enum.",
		},
		schema: [
			{
				type: "object",
				properties: {
					modelRoots: { type: "array", items: { type: "string", minLength: 1 } },
					modelFiles: { type: "array", items: { type: "string", minLength: 1 } },
					excludedFiles: { type: "array", items: { type: "string", minLength: 1 } },
				},
				additionalProperties: false,
			},
		],
		defaultOptions: defaultOptions,
	},
	createOnce(context) {
		const aliases = new Map<string, ESTree.TSTypeAliasDeclaration>();
		let configuredModelFile = false;
		let allowBuiltinReadonly = true;
		let excludeConstruction = false;
		return {
			Program() {
				excludeConstruction = (context.options?.[0] as RuleOptions[0] | undefined)?.excludedFiles?.some(file => configuredPath(context.filename, context.cwd) === configuredPath(file, context.cwd)) ?? false;
				aliases.clear();
				configuredModelFile = isConfiguredModelFile(
					context.filename,
					context.options?.[0] as RuleOptions[0] | undefined,
					context.cwd,
				);
				allowBuiltinReadonly =
					!configuredModelFile ||
					!declaresTopLevelTypeName(context.sourceCode.ast.body as TypeNode[], "Readonly");
			},
			ObjectExpression(node: ESTree.ObjectExpression) {
				if (excludeConstruction || literalValueTag(node) === null) return;
				const type = constructionType(node, context.sourceCode);
				if (type === null || !ownedTaggedType(context.sourceCode, type)) return;
				if (isTypedMatchPattern(node, context.sourceCode) || isConstructorInput(node, context.sourceCode)) return;
				context.report({
					node,
					messageId: "construction",
					data: { model: context.sourceCode.getText(type) },
				});
			},
			TSTypeAliasDeclaration(node: ESTree.TSTypeAliasDeclaration) {
				if (!isTopLevelAlias(node)) return;
				aliases.set(aliasName(node), node);
			},
			"Program:exit"() {
				const wrappedAliases = new Set<string>();
				for (const alias of aliases.values()) {
					// A generic parameter can shadow a top-level alias with the same name.
					if (configuredModelFile && hasTypeParameters(alias)) continue;
					const reference = referencedAliasName(alias.typeAnnotation as TypeNode);
					if (reference !== null) wrappedAliases.add(reference);
				}
				for (const alias of aliases.values()) {
					if (configuredModelFile && hasTypeParameters(alias)) {
						if (isDirectLiteralUnion(alias)) {
							const variants = taggedVariants(alias, aliases);
						if (variants !== null && isResultLike(variants)) {
							context.report({ node: alias, messageId: "result", data: { name: aliasName(alias) } });
						}
						}
						continue;
					}
					if (wrappedAliases.has(aliasName(alias))) continue;
					if (!configuredModelFile && isSemanticProjectionAlias(aliasName(alias))) continue;
					const variants = taggedVariants(
						alias,
						aliases,
						configuredModelFile,
						allowBuiltinReadonly,
					);
					if (variants === null) continue;
					if (isCauseReasonProjection(aliasName(alias), variants)) continue;
					if (isCompleteEffectOutcome(variants)) continue;
					if (isResultLike(variants)) {
						context.report({ node: alias, messageId: "result", data: { name: aliasName(alias) } });
						continue;
					}
					const minimumDistinctTags = configuredModelFile ? 2 : 3;
					const distinctTags = new Set(variants.map(({ tag }) => tag));
					if (
						distinctTags.size >= minimumDistinctTags &&
						distinctTags.size === variants.length
					) {
						context.report({ node: alias, messageId: "taggedEnum", data: { name: aliasName(alias) } });
					}
				}
			},
		};
	},
});
