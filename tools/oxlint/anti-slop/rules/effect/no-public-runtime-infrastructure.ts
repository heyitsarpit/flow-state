import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode } from "@oxlint/plugins";

import { isImportedFromEffect } from "../../shared/effect/effect-import.ts";
import { isPathWithin } from "../../shared/module-path.ts";
import { normalizedFilename } from "../../shared/file-scope.ts";

const defaultPropertyNames = ["consumer", "consumerFactory", "mailbox", "queue", "scope"] as const;
const defaultTypeNames = ["Effect", "PubSub", "Queue", "Scope", "Stream"] as const;

type RuleOptions = [{ allowedFiles?: string[]; allowedPathFragments?: string[]; propertyNames?: string[]; sourceRoots?: string[]; typeNames?: string[] }];

type PublicMember = ESTree.TSPropertySignature | ESTree.TSMethodSignature | ESTree.PropertyDefinition;

function parameterType(parameter: ESTree.ParamPattern): ESTree.TSType | null {
	if (parameter.type === "TSParameterProperty") return parameterType(parameter.parameter);
	if (!("typeAnnotation" in parameter)) return null;
	const annotation = parameter.typeAnnotation;
	return annotation === undefined || annotation === null ? null : annotation.typeAnnotation;
}

function propertyName(node: PublicMember): string | null {
	if (!node.computed && node.key.type === "Identifier") return node.key.name;
	return node.computed && node.key.type === "Literal" && typeof node.key.value === "string"
		? node.key.value
		: null;
}

function isExported(node: ESTree.Node): boolean {
	let current: ESTree.Node = node;
	let parent: ESTree.Node | null = current.parent;
	while (parent !== null && parent.type !== "Program") {
		current = parent;
		if (current.type === "ExportNamedDeclaration" || current.type === "ExportDefaultDeclaration") return true;
		if (current.type === "FunctionDeclaration" || current.type === "ClassDeclaration" || current.type === "TSTypeAliasDeclaration" || current.type === "TSInterfaceDeclaration") {
			return current.parent.type === "ExportNamedDeclaration" || current.parent.type === "ExportDefaultDeclaration";
		}
		parent = current.parent;
	}
	return false;
}

function containsInfrastructureType(sourceCode: SourceCode, node: ESTree.TSType, typeNames: ReadonlySet<string>): boolean {
	if (node.type === "TSParenthesizedType") return containsInfrastructureType(sourceCode, node.typeAnnotation, typeNames);
	if (node.type === "TSTypeReference") {
		if (node.typeName.type === "Identifier") {
			if (typeNames.has(node.typeName.name) && isImportedFromEffect(sourceCode, node.typeName)) return true;
		} else if (
			node.typeName.type === "TSQualifiedName" &&
			typeNames.has(node.typeName.right.name) &&
			node.typeName.left.type === "Identifier" &&
			isImportedFromEffect(sourceCode, node.typeName.left)
		) return true;
		return node.typeArguments?.params.some((parameter) => containsInfrastructureType(sourceCode, parameter, typeNames)) ?? false;
	}
	if (node.type === "TSUnionType" || node.type === "TSIntersectionType") {
		return node.types.some((member) => containsInfrastructureType(sourceCode, member, typeNames));
	}
	if (node.type === "TSFunctionType") {
		const returnType = node.returnType;
		const hasInfrastructureParameter = node.params.some((parameter) => {
			const type = parameterType(parameter);
			return type !== null && containsInfrastructureType(sourceCode, type, typeNames);
		});
		return (returnType !== null && returnType !== undefined && containsInfrastructureType(sourceCode, returnType.typeAnnotation, typeNames)) ||
			hasInfrastructureParameter;
	}
	if (node.type === "TSTypeLiteral") {
		return node.members.some((member) => {
			if (member.type === "TSPropertySignature") {
				return member.typeAnnotation !== null && member.typeAnnotation !== undefined && containsInfrastructureType(sourceCode, member.typeAnnotation.typeAnnotation, typeNames);
			}
			if (member.type === "TSMethodSignature") {
				const returnType = member.returnType;
				const hasInfrastructureParameter = member.params.some((parameter) => {
					const type = parameterType(parameter);
					return type !== null && containsInfrastructureType(sourceCode, type, typeNames);
				});
				return (returnType !== null && returnType !== undefined && containsInfrastructureType(sourceCode, returnType.typeAnnotation, typeNames)) ||
					hasInfrastructureParameter;
			}
			return false;
		});
	}
	return false;
}

function containsNonEffectInfrastructureType(sourceCode: SourceCode, node: ESTree.TSType, typeNames: ReadonlySet<string>): boolean {
	return containsInfrastructureType(sourceCode, node, new Set([...typeNames].filter((name) => name !== "Effect")));
}

/** Review direct public-route declarations; AST-only syntax cannot follow re-exported types. */
export const noPublicRuntimeInfrastructureRule = defineRule({
	meta: {
		type: "suggestion",
		docs: { description: "Review exported runtime infrastructure handles in configured public-route files." },
		messages: {
			infrastructure:
				"Review this public-route infrastructure handle. Expose commands, observations, drain, or shutdown instead of a mailbox, scope, queue, or cold consumer Effect.",
		},
		schema: [
			{
				type: "object",
				properties: {
					allowedFiles: { type: "array", items: { type: "string" } },
					allowedPathFragments: { type: "array", items: { type: "string" } },
					propertyNames: { type: "array", items: { type: "string" } },
					sourceRoots: { type: "array", items: { type: "string" } },
					typeNames: { type: "array", items: { type: "string" } },
				},
				additionalProperties: false,
			},
		],
		defaultOptions: [{ propertyNames: [...defaultPropertyNames], typeNames: [...defaultTypeNames] }] satisfies RuleOptions,
	},
	createOnce(context) {
		let sourceFile = true;
		let allowedBoundary = false;
		let allowedFiles: readonly string[] = [];
		let allowedPathFragments: readonly string[] = [];
		let propertyNames = new Set<string>(defaultPropertyNames);
		let typeNames: readonly string[] = defaultTypeNames;
		const check = (node: PublicMember) => {
			const name = propertyName(node);
			if (name === null || !sourceFile || allowedBoundary || !isExported(node)) return;
			const annotationType = node.type === "TSMethodSignature"
				? node.returnType?.typeAnnotation ?? null
				: node.typeAnnotation?.typeAnnotation ?? null;
			if (annotationType === null) return;
			if (
				containsNonEffectInfrastructureType(context.sourceCode, annotationType, new Set(typeNames)) ||
				(propertyNames.has(name) && containsInfrastructureType(context.sourceCode, annotationType, new Set(typeNames)))
			) {
				context.report({ node, messageId: "infrastructure" });
			}
		};
		return {
			Program() {
				const option = context.options?.[0];
				const rawRoots =
					typeof option === "object" && option !== null && !Array.isArray(option)
						? option.sourceRoots
						: undefined;
				const rawAllowedFiles =
					typeof option === "object" && option !== null && !Array.isArray(option)
						? option.allowedFiles
						: undefined;
				const rawAllowedPathFragments =
					typeof option === "object" && option !== null && !Array.isArray(option)
						? option.allowedPathFragments
						: undefined;
				const rawPropertyNames =
					typeof option === "object" && option !== null && !Array.isArray(option)
						? option.propertyNames
						: undefined;
				const rawTypeNames =
					typeof option === "object" && option !== null && !Array.isArray(option)
						? option.typeNames
						: undefined;
				const roots = Array.isArray(rawRoots) && rawRoots.every((root): root is string => typeof root === "string")
					? rawRoots
					: [];
				allowedFiles = Array.isArray(rawAllowedFiles) && rawAllowedFiles.every((file): file is string => typeof file === "string")
					? rawAllowedFiles
					: [];
				allowedPathFragments = Array.isArray(rawAllowedPathFragments) && rawAllowedPathFragments.every((fragment): fragment is string => typeof fragment === "string")
					? rawAllowedPathFragments
					: [];
				sourceFile = roots.length === 0 || roots.some((root) => isPathWithin(context.filename, root));
				const normalized = normalizedFilename(context.filename);
				const matchesFile = (file: string) => {
					const normalizedFile = normalizedFilename(file);
					const relativeFile = normalizedFile.startsWith("/") ? normalizedFile.slice(1) : normalizedFile;
					return normalized.endsWith(`/${relativeFile}`);
				};
				allowedBoundary = allowedPathFragments.some((fragment) => normalized.includes(normalizedFilename(fragment))) || allowedFiles.some(matchesFile);
				propertyNames = new Set(
					Array.isArray(rawPropertyNames) && rawPropertyNames.every((name): name is string => typeof name === "string")
						? rawPropertyNames
						: defaultPropertyNames,
				);
				typeNames = Array.isArray(rawTypeNames) && rawTypeNames.every((name): name is string => typeof name === "string")
					? rawTypeNames
					: defaultTypeNames;
			},
			TSPropertySignature: check,
			TSMethodSignature: check,
			PropertyDefinition: check,
		};
	},
});
