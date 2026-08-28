import { defineRule } from "@oxlint/plugins";

import type { ESTree, Scope, SourceCode, Variable } from "@oxlint/plugins";

import { isEffectHostBoundaryFile, normalizedFilename } from "../shared/file-scope.ts";

const unsafeMethodNames = new Set(["interruptUnsafe", "pollUnsafe"]);

type TypeEnvironment = Readonly<{
	aliases: ReadonlyMap<string, ESTree.TSType>;
	interfaces: ReadonlyMap<string, ESTree.TSInterfaceDeclaration>;
	fiberImports: ReadonlySet<string>;
}>;

function isAllowedBoundary(filename: string): boolean {
	const normalized = normalizedFilename(filename);
	return (
		isEffectHostBoundaryFile(filename) ||
		normalized.endsWith("/src/core/orchestrator/orchestrator-system.ts") ||
		normalized.endsWith("/src/core/runtime/owned-effect-runner.ts") ||
		normalized.endsWith("/src/core/runtime/services/host-signals.ts")
	);
}

function createTypeEnvironment(program: ESTree.Program): TypeEnvironment {
	const aliases = new Map<string, ESTree.TSType>();
	const interfaces = new Map<string, ESTree.TSInterfaceDeclaration>();
	const fiberImports = new Set<string>();

	for (const statement of program.body) {
		if (
			statement.type === "ImportDeclaration" &&
			(statement.source.value === "effect" || statement.source.value.startsWith("effect/"))
		) {
			for (const specifier of statement.specifiers) {
				if (specifier.type === "ImportNamespaceSpecifier") {
					fiberImports.add(specifier.local.name);
					continue;
				}
				if (
					specifier.type === "ImportSpecifier" &&
					(specifier.imported.type === "Identifier"
						? specifier.imported.name
						: specifier.imported.value) === "Fiber"
				) {
					fiberImports.add(specifier.local.name);
				}
			}
			continue;
		}

		const declaration =
			statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
		if (declaration?.type === "TSTypeAliasDeclaration") {
			aliases.set(declaration.id.name, declaration.typeAnnotation);
		}
		if (declaration?.type === "TSInterfaceDeclaration") {
			interfaces.set(declaration.id.name, declaration);
		}
	}

	return { aliases, interfaces, fiberImports };
}

function resolveVariable(sourceCode: SourceCode, identifier: ESTree.IdentifierReference): Variable | null {
	let scope: Scope | null = sourceCode.getScope(identifier);
	while (scope !== null) {
		const variable = scope.set.get(identifier.name);
		if (variable !== undefined) return variable;
		scope = scope.upper;
	}
	return null;
}

function unwrapType(
	type: ESTree.TSType,
	environment: TypeEnvironment,
	seen: ReadonlySet<string> = new Set(),
): ESTree.TSType {
	if (type.type === "TSParenthesizedType") {
		return unwrapType(type.typeAnnotation, environment, seen);
	}
	if (type.type !== "TSTypeReference" || type.typeName.type !== "Identifier") return type;
	const alias = environment.aliases.get(type.typeName.name);
	if (alias === undefined || seen.has(type.typeName.name)) return type;
	return unwrapType(alias, environment, new Set([...seen, type.typeName.name]));
}

function isFiberType(type: ESTree.TSType, environment: TypeEnvironment): boolean {
	const resolved = unwrapType(type, environment);
	if (resolved.type !== "TSTypeReference") return false;
	if (resolved.typeName.type === "Identifier") {
		return environment.fiberImports.has(resolved.typeName.name);
	}
	if (resolved.typeName.type !== "TSQualifiedName") return false;
	if (
		resolved.typeName.left.type === "TSQualifiedName" &&
		resolved.typeName.left.left.type === "Identifier" &&
		environment.fiberImports.has(resolved.typeName.left.left.name) &&
		resolved.typeName.left.right.type === "Identifier" &&
		resolved.typeName.left.right.name === "Fiber" &&
		resolved.typeName.right.type === "Identifier" &&
		resolved.typeName.right.name === "Fiber"
	) {
		return true;
	}
	return (
		resolved.typeName.left.type === "Identifier" &&
		environment.fiberImports.has(resolved.typeName.left.name) &&
		resolved.typeName.right.type === "Identifier" &&
		resolved.typeName.right.name === "Fiber"
	);
}

function propertyType(
	type: ESTree.TSType | ESTree.TSInterfaceHeritage,
	propertyName: string,
	environment: TypeEnvironment,
	seen = new Set<string>(),
): ESTree.TSType | null {
	if (type.type === "TSInterfaceHeritage") {
		if (type.expression.type !== "Identifier") return null;
		const declaration = environment.interfaces.get(type.expression.name);
		if (declaration === undefined) return null;
		for (const member of declaration.body.body) {
			if (
				member.type === "TSPropertySignature" &&
				!member.computed &&
				member.key.type === "Identifier" &&
				member.key.name === propertyName &&
				member.typeAnnotation !== null
			) return member.typeAnnotation.typeAnnotation;
		}
		for (const parent of declaration.extends) {
			const result = propertyType(parent, propertyName, environment, seen);
			if (result !== null) return result;
		}
		return null;
	}
	const resolved = unwrapType(type, environment);
	if (resolved.type === "TSIntersectionType") {
		for (const member of resolved.types) {
			const result = propertyType(member, propertyName, environment, seen);
			if (result !== null) return result;
		}
		return null;
	}
	if (resolved.type === "TSTypeLiteral") {
		for (const member of resolved.members) {
			if (member.type !== "TSPropertySignature") continue;
			const memberName =
				!member.computed && member.key.type === "Identifier"
					? member.key.name
					: member.computed && member.key.type === "Literal" && typeof member.key.value === "string"
						? member.key.value
						: null;
			if (member.type === "TSPropertySignature" && memberName === propertyName && member.typeAnnotation !== null) {
				return member.typeAnnotation.typeAnnotation;
			}
		}
		return null;
	}
	if (resolved.type !== "TSTypeReference" || resolved.typeName.type !== "Identifier") return null;
	const name = resolved.typeName.name;
	if (seen.has(name)) return null;
	const nextSeen = new Set(seen);
	nextSeen.add(name);
	const alias = environment.aliases.get(name);
	if (alias !== undefined) return propertyType(alias, propertyName, environment, nextSeen);
	const declaration = environment.interfaces.get(name);
	if (declaration === undefined) return null;
	for (const member of declaration.body.body) {
		if (member.type !== "TSPropertySignature") continue;
		const memberName =
			!member.computed && member.key.type === "Identifier"
				? member.key.name
				: member.computed && member.key.type === "Literal" && typeof member.key.value === "string"
					? member.key.value
					: null;
		if (memberName === propertyName && member.typeAnnotation !== null) return member.typeAnnotation.typeAnnotation;
	}
	for (const parent of declaration.extends) {
		const result = propertyType(parent, propertyName, environment, nextSeen);
		if (result !== null) return result;
	}
	return null;
}

function bindingType(
	sourceCode: SourceCode,
	identifier: ESTree.IdentifierReference,
	environment: TypeEnvironment,
): ESTree.TSType | null {
	const variable = resolveVariable(sourceCode, identifier);
	if (variable === null) return null;

	for (const definition of variable.defs) {
		if (definition.name.typeAnnotation !== null && definition.name.typeAnnotation !== undefined) {
			return definition.name.typeAnnotation.typeAnnotation;
		}
		if (definition.type !== "Parameter") continue;
		const callback = definition.node;
		if (
			(callback.type !== "ArrowFunctionExpression" && callback.type !== "FunctionExpression") ||
			callback.parent.type !== "CallExpression" ||
			callback.parent.arguments[0] !== callback
		) {
			continue;
		}
		const parameterIndex = callback.params.findIndex((parameter) => parameter === definition.name);
		const callee = callback.parent.callee;
		if (
			parameterIndex !== 0 ||
			callee.type !== "MemberExpression" ||
			callee.computed ||
			callee.property.type !== "Identifier" ||
			callee.property.name !== "forEach"
		) {
			continue;
		}
		const collectionType = expressionType(sourceCode, callee.object, environment);
		if (collectionType === null) continue;
		const resolvedCollection = unwrapType(collectionType, environment);
		if (
			resolvedCollection.type === "TSTypeReference" &&
			resolvedCollection.typeName.type === "Identifier" &&
			["Array", "ReadonlyArray", "ReadonlySet", "Set"].includes(
				resolvedCollection.typeName.name,
			) &&
			resolvedCollection.typeArguments?.params.length === 1
		) {
			return resolvedCollection.typeArguments.params[0];
		}
	}

	return null;
}

function expressionType(
	sourceCode: SourceCode,
	expression: ESTree.Expression,
	environment: TypeEnvironment,
): ESTree.TSType | null {
	if (expression.type === "Identifier") return bindingType(sourceCode, expression, environment);
	if (
		expression.type !== "MemberExpression" ||
		(expression.computed
			? expression.property.type !== "Literal" || typeof expression.property.value !== "string"
			: expression.property.type !== "Identifier")
	) {
		return null;
	}
	const ownerType = expressionType(sourceCode, expression.object, environment);
	const propertyName = expression.computed
		? String(expression.property.type === "Literal" ? expression.property.value : "")
		: expression.property.type === "Identifier"
			? expression.property.name
			: "";
	return ownerType === null
		? null
		: propertyType(ownerType, propertyName, environment);
}

/** Keep Effect Fiber unsafe runtime hooks inside explicit host/runtime owners. */
export const noUnsafeFiberMethodsRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow direct calls to Effect Fiber unsafe methods outside explicit runtime boundaries.",
		},
		messages: {
			unsafeFiberMethod:
				"Do not call Fiber.{{method}} directly in production domain code. Use the safe Fiber API, or move the operation to an explicit host/runtime owner.",
		},
	},
	createOnce(context) {
		let allowedBoundary = false;
		let environment: TypeEnvironment | null = null;

		return {
			Program(node: ESTree.Program) {
				allowedBoundary = isAllowedBoundary(context.filename);
				environment = createTypeEnvironment(node);
			},
			CallExpression(node: ESTree.CallExpression) {
				if (allowedBoundary || environment === null) return;
				const callee = node.callee;
				if (
					callee.type !== "MemberExpression" ||
					(callee.computed
						? callee.property.type !== "Literal" || typeof callee.property.value !== "string"
						: callee.property.type !== "Identifier")
				) {
					return;
				}
				const method = callee.computed
					? String(callee.property.type === "Literal" ? callee.property.value : "")
					: callee.property.type === "Identifier"
						? callee.property.name
						: "";
				if (!unsafeMethodNames.has(method)) return;
				const receiverType = expressionType(context.sourceCode, callee.object, environment);
				if (receiverType !== null && isFiberType(receiverType, environment)) {
					context.report({
						node,
						messageId: "unsafeFiberMethod",
						data: { method },
					});
				}
			},
		};
	},
});
