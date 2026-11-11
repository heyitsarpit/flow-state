import type { ESTree } from "@oxlint/plugins";

const BUILT_INS = new Set(["Record", "Readonly", "Partial", "Required", "Pick", "Omit", "PropertyKey", "NonNullable"]);
const TRANSPARENT_WRAPPERS = new Set(["Readonly", "Partial", "Required", "NonNullable"]);
const SCOPE_BOUNDARIES = new Set(["Program", "BlockStatement", "CatchClause", "ForStatement", "ForInStatement", "ForOfStatement", "SwitchStatement", "TSModuleBlock", "StaticBlock"]);

type TypeAliasEnvironment = ReadonlyMap<string, ESTree.TSType>;
type Binding<T extends ESTree.Node> = { readonly node: T; readonly scope: ESTree.Node };
type ResolvedType = { readonly type: ESTree.TSType; readonly substitutions: TypeAliasEnvironment };

export type UnsafeDictionary = {
	readonly kind: "unsafe-dictionary";
	readonly unsafeValue: "any" | "empty-object" | "object" | "union" | "unknown";
};
export type WideningTargetKind = "anonymous object" | "generic container" | "object" | "open dictionary" | "unknown";
export type WideningTarget = { readonly kind: WideningTargetKind };
export type TypeEnvironment = {
	readonly aliases: ReadonlyMap<string, readonly Binding<ESTree.TSTypeAliasDeclaration>[]>;
	readonly interfaces: ReadonlyMap<string, readonly Binding<ESTree.TSInterfaceDeclaration>[]>;
	readonly shadowedNames: ReadonlyMap<string, readonly ESTree.Node[]>;
};

const typeEnvironments = new WeakMap<ESTree.Program, TypeEnvironment>();

function isNode(value: unknown): value is ESTree.Node {
	return typeof value === "object" && value !== null && "type" in value && typeof value.type === "string";
}

function walk(node: ESTree.Node, visit: (node: ESTree.Node) => void, visited = new Set<ESTree.Node>()): void {
	if (visited.has(node)) return;
	visited.add(node);
	visit(node);
	const record = node as unknown as Readonly<Record<string, unknown>>;
	for (const [key, value] of Object.entries(record)) {
		if (key === "parent" || key === "tokens" || key === "comments") continue;
		if (isNode(value)) {
			walk(value, visit, visited);
			continue;
		}
		if (Array.isArray(value)) for (const child of value) if (isNode(child)) walk(child, visit, visited);
	}
}

function declarationScope(node: ESTree.Node, program: ESTree.Program): ESTree.Node {
	let current = node.parent;
	while (current !== null && !SCOPE_BOUNDARIES.has(current.type)) current = current.parent;
	return current ?? program;
}

function isVisible(scope: ESTree.Node, reference: ESTree.Node): boolean {
	let current: ESTree.Node | null = reference;
	while (current !== null) {
		if (current === scope) return true;
		current = current.parent;
	}
	return false;
}

function scopeDepth(node: ESTree.Node): number {
	let depth = 0;
	let current: ESTree.Node | null = node;
	while (current !== null) {
		depth += 1;
		current = current.parent;
	}
	return depth;
}

function addBinding<T extends ESTree.Node>(bindings: Map<string, Binding<T>[]>, name: string, node: T, program: ESTree.Program): void {
	const entries = bindings.get(name) ?? [];
	entries.push({ node, scope: declarationScope(node, program) });
	bindings.set(name, entries);
}

function addShadowedName(shadowedNames: Map<string, ESTree.Node[]>, name: string, node: ESTree.Node, program: ESTree.Program): void {
	const entries = shadowedNames.get(name) ?? [];
	entries.push(declarationScope(node, program));
	shadowedNames.set(name, entries);
}

export function createTypeEnvironment(program: ESTree.Program): TypeEnvironment {
	const cached = typeEnvironments.get(program);
	if (cached !== undefined) return cached;

	const aliases = new Map<string, Binding<ESTree.TSTypeAliasDeclaration>[]>();
	const interfaces = new Map<string, Binding<ESTree.TSInterfaceDeclaration>[]>();
	const shadowedNames = new Map<string, ESTree.Node[]>();
	walk(program, (node) => {
		if (node.type === "TSTypeAliasDeclaration") {
			addBinding(aliases, node.id.name, node, program);
			return;
		}
		if (node.type === "TSInterfaceDeclaration") {
			addBinding(interfaces, node.id.name, node, program);
			return;
		}
		if (node.type === "ImportDeclaration") {
			for (const specifier of node.specifiers) addShadowedName(shadowedNames, specifier.local.name, specifier.local, program);
			return;
		}
		if ((node.type === "TSEnumDeclaration" || node.type === "ClassDeclaration" || node.type === "FunctionDeclaration") && node.id !== null) {
			addShadowedName(shadowedNames, node.id.name, node.id, program);
		}
	});
	const environment = { aliases, interfaces, shadowedNames };
	typeEnvironments.set(program, environment);
	return environment;
}

function typeReferenceName(type: ESTree.TSTypeReference): string | null {
	return type.typeName.type === "Identifier" ? type.typeName.name : null;
}

function visibleBinding<T extends ESTree.Node>(bindings: ReadonlyMap<string, readonly Binding<T>[]>, name: string, referenceNode?: ESTree.Node): Binding<T> | null {
	return visibleBindings(bindings, name, referenceNode)[0] ?? null;
}

function visibleBindings<T extends ESTree.Node>(
	bindings: ReadonlyMap<string, readonly Binding<T>[]>,
	name: string,
	referenceNode?: ESTree.Node,
): readonly Binding<T>[] {
	const candidates = bindings.get(name) ?? [];
	const visible = referenceNode === undefined ? candidates : candidates.filter((candidate) => isVisible(candidate.scope, referenceNode));
	const nearestScope = [...visible].sort((left, right) => scopeDepth(right.scope) - scopeDepth(left.scope))[0]?.scope;
	return nearestScope === undefined ? [] : visible.filter((candidate) => candidate.scope === nearestScope);
}

function isWithin(node: ESTree.Node, ancestor: ESTree.Node): boolean {
	let current: ESTree.Node | null = node;
	while (current !== null) {
		if (current === ancestor) return true;
		current = current.parent;
	}
	return false;
}

export function isShadowedByTypeParameter(name: string, referenceNode?: ESTree.Node): boolean {
	let current = referenceNode ?? null;
	while (current !== null) {
		const owner = current as ESTree.Node & {
			typeParameters?: ESTree.TSTypeParameterDeclaration | null;
		};
		const parameters = owner.typeParameters?.params;
		if (parameters !== null && parameters !== undefined) {
			const containingIndex = referenceNode === undefined ? -1 : parameters.findIndex((parameter) => isWithin(referenceNode, parameter));
			const isInsideConstraint =
				referenceNode !== undefined &&
				parameters.some(
					(parameter) =>
						parameter.constraint !== null &&
						isWithin(referenceNode, parameter.constraint),
				);
			const visibleParameters =
				containingIndex < 0 || isInsideConstraint
					? parameters
					: parameters.slice(0, containingIndex + 1);
			if (visibleParameters.some((parameter) => parameter.name.name === name)) return true;
		}
		current = current.parent;
	}
	return false;
}

function isShadowedName(environment: TypeEnvironment, name: string, referenceNode?: ESTree.Node): boolean {
	const scopes = environment.shadowedNames.get(name) ?? [];
	return referenceNode === undefined ? scopes.length > 0 : scopes.some((scope) => isVisible(scope, referenceNode));
}

function isBuiltIn(
	name: string,
	environment: TypeEnvironment,
	referenceNode?: ESTree.Node,
	lexicalReferenceNode?: ESTree.Node,
): boolean {
	return BUILT_INS.has(name) && !isShadowedByTypeParameter(name, lexicalReferenceNode ?? referenceNode) && visibleBinding(environment.aliases, name, referenceNode) === null && visibleBinding(environment.interfaces, name, referenceNode) === null && !isShadowedName(environment, name, referenceNode);
}

export function hasVisibleAlias(environment: TypeEnvironment, name: string, referenceNode?: ESTree.Node): boolean {
	return !isShadowedByTypeParameter(name, referenceNode) && visibleBinding(environment.aliases, name, referenceNode) !== null;
}

export function resolveTypeAlias(
	type: ESTree.TSType,
	environment: TypeEnvironment,
): ESTree.TSTypeAliasDeclaration | null {
	if (type.type !== "TSTypeReference" || type.typeName.type !== "Identifier") return null;
	if (isShadowedByTypeParameter(type.typeName.name, type)) return null;
	return visibleBinding(environment.aliases, type.typeName.name, type)?.node ?? null;
}

function isUnappliedReferenceTo(type: ESTree.TSType, name: string): boolean {
	const unwrapped = unwrapTransparentType(type);
	return unwrapped.type === "TSTypeReference" && typeReferenceName(unwrapped) === name && (unwrapped.typeArguments === null || unwrapped.typeArguments === undefined || unwrapped.typeArguments.params.length === 0);
}

function unwrapTransparentType(type: ESTree.TSType): ESTree.TSType {
	let current = type;
	while (current.type === "TSParenthesizedType" || (current.type === "TSTypeOperator" && current.operator === "readonly")) current = current.typeAnnotation;
	return current;
}

function isNeverType(type: ESTree.TSType): boolean {
	return unwrapTransparentType(type).type === "TSNeverKeyword";
}

function isEffectivelyEmptyMember(member: ESTree.TSSignature): boolean {
	return member.type === "TSPropertySignature" && member.optional === true && member.typeAnnotation !== null && member.typeAnnotation !== undefined && isNeverType(member.typeAnnotation.typeAnnotation);
}

function isEffectivelyEmptyTypeLiteral(type: ESTree.TSTypeLiteral): boolean {
	return type.members.length === 0 || type.members.every(isEffectivelyEmptyMember);
}

function isEffectivelyEmptyInterface(declarations: readonly Binding<ESTree.TSInterfaceDeclaration>[]): boolean {
	return declarations.length > 0 && declarations.every(({ node }) => node.extends.length === 0 && (node.body.body.length === 0 || node.body.body.every(isEffectivelyEmptyMember)));
}

function resolvedSubstitutionArgument(type: ESTree.TSType, base: TypeAliasEnvironment, resolving: ReadonlySet<string> = new Set()): ESTree.TSType {
	const unwrapped = unwrapTransparentType(type);
	if (unwrapped.type !== "TSTypeReference") return type;
	const name = typeReferenceName(unwrapped);
	if (name === null || resolving.has(name)) return type;
	const substitution = base.get(name);
	return substitution === undefined ? type : resolvedSubstitutionArgument(substitution, base, new Set([...resolving, name]));
}

function aliasSubstitution(alias: ESTree.TSTypeAliasDeclaration, type: ESTree.TSTypeReference, base: TypeAliasEnvironment): TypeAliasEnvironment | null {
	const next = new Map(base);
	for (const [index, parameter] of (alias.typeParameters?.params ?? []).entries()) {
		const argument = type.typeArguments?.params[index] ?? parameter.default;
		if (argument === null || argument === undefined) return null;
		next.set(parameter.name.name, resolvedSubstitutionArgument(argument, next));
	}
	return next;
}

function unsafeDirectValue(type: ESTree.TSType, environment: TypeEnvironment, substitutions: TypeAliasEnvironment, resolvingAliases: ReadonlySet<string>, referenceNode?: ESTree.Node): UnsafeDictionary["unsafeValue"] | null {
	const unwrapped = unwrapTransparentType(type);
	if (unwrapped.type === "TSUnknownKeyword") return "unknown";
	if (unwrapped.type === "TSAnyKeyword") return "any";
	if (unwrapped.type === "TSObjectKeyword") return "object";
	if (unwrapped.type === "TSTypeLiteral" && isEffectivelyEmptyTypeLiteral(unwrapped)) return "empty-object";
	if (unwrapped.type === "TSUnionType") return unwrapped.types.some((member) => unsafeDirectValue(member, environment, substitutions, resolvingAliases, referenceNode) !== null) ? "union" : null;
	if (unwrapped.type === "TSIntersectionType") {
		const unsafeMembers = unwrapped.types.map((member) => unsafeDirectValue(member, environment, substitutions, resolvingAliases, referenceNode));
		if (unsafeMembers.includes("any")) return "any";
		return unsafeMembers.length > 0 && unsafeMembers.every((member) => member !== null) ? unsafeMembers[0] : null;
	}
	if (unwrapped.type !== "TSTypeReference") return null;
	const name = typeReferenceName(unwrapped);
	if (name === null) return null;
	const substitution = substitutions.get(name);
	if (substitution !== undefined) return isUnappliedReferenceTo(substitution, name) ? null : unsafeDirectValue(substitution, environment, substitutions, resolvingAliases, referenceNode);
	if (isShadowedByTypeParameter(name, unwrapped)) return null;
	if (TRANSPARENT_WRAPPERS.has(name) && isBuiltIn(name, environment, referenceNode, unwrapped)) {
		const wrapped = unwrapped.typeArguments?.params[0];
		return wrapped === undefined ? null : unsafeDirectValue(wrapped, environment, substitutions, resolvingAliases, referenceNode);
	}
	const interfaces = visibleBindings(environment.interfaces, name, referenceNode);
	if (interfaces.length > 0) return isEffectivelyEmptyInterface(interfaces) ? "empty-object" : null;
	const aliasBinding = visibleBinding(environment.aliases, name, referenceNode);
	if (aliasBinding === null || resolvingAliases.has(name)) return null;
	const nextSubstitutions = aliasSubstitution(aliasBinding.node, unwrapped, substitutions);
	return nextSubstitutions === null ? null : unsafeDirectValue(aliasBinding.node.typeAnnotation, environment, nextSubstitutions, new Set([...resolvingAliases, name]), referenceNode);
}

function dictionaryValueTypes(type: ESTree.TSType, environment: TypeEnvironment, substitutions: TypeAliasEnvironment, resolvingAliases: ReadonlySet<string>, referenceNode?: ESTree.Node): readonly ResolvedType[] {
	const unwrapped = unwrapTransparentType(type);
	if (unwrapped.type === "TSTypeLiteral") {
		return unwrapped.members.flatMap((member): readonly ResolvedType[] => member.type === "TSIndexSignature" && member.typeAnnotation !== null ? [{ type: member.typeAnnotation.typeAnnotation, substitutions }] : []);
	}
	if (unwrapped.type === "TSMappedType") return unwrapped.typeAnnotation === null ? [] : [{ type: unwrapped.typeAnnotation, substitutions }];
	if (unwrapped.type !== "TSTypeReference") return [];
	const name = typeReferenceName(unwrapped);
	if (name === null) return [];
	const substitution = substitutions.get(name);
	if (substitution !== undefined) return isUnappliedReferenceTo(substitution, name) ? [] : dictionaryValueTypes(substitution, environment, substitutions, resolvingAliases, referenceNode);
	if (isShadowedByTypeParameter(name, unwrapped)) return [];
	if (TRANSPARENT_WRAPPERS.has(name) && isBuiltIn(name, environment, referenceNode, unwrapped)) {
		const wrapped = unwrapped.typeArguments?.params[0];
		return wrapped === undefined ? [] : dictionaryValueTypes(wrapped, environment, substitutions, resolvingAliases, referenceNode);
	}
	if (name === "Record" && isBuiltIn(name, environment, referenceNode, unwrapped)) {
		const value = unwrapped.typeArguments?.params[1];
		return value === undefined ? [] : [{ type: value, substitutions }];
	}
	if ((name === "Pick" || name === "Omit") && isBuiltIn(name, environment, referenceNode, unwrapped)) {
		const source = unwrapped.typeArguments?.params[0];
		return source === undefined ? [] : dictionaryValueTypes(source, environment, substitutions, resolvingAliases, referenceNode);
	}
	const aliasBinding = visibleBinding(environment.aliases, name, referenceNode);
	if (aliasBinding === null || resolvingAliases.has(name)) return [];
	const nextSubstitutions = aliasSubstitution(aliasBinding.node, unwrapped, substitutions);
	return nextSubstitutions === null ? [] : dictionaryValueTypes(aliasBinding.node.typeAnnotation, environment, nextSubstitutions, new Set([...resolvingAliases, name]), referenceNode);
}

export function classifyUnsafeDictionaryValue(valueType: ESTree.TSType, environment: TypeEnvironment, referenceNode?: ESTree.Node): UnsafeDictionary | null {
	const unsafeValue = unsafeDirectValue(valueType, environment, new Map(), new Set(), referenceNode);
	return unsafeValue === null ? null : { kind: "unsafe-dictionary", unsafeValue };
}

export function classifyUnsafeDictionary(type: ESTree.TSType, environment: TypeEnvironment, referenceNode?: ESTree.Node): UnsafeDictionary | null {
	for (const valueType of dictionaryValueTypes(type, environment, new Map(), new Set(), referenceNode)) {
		const unsafeValue = unsafeDirectValue(valueType.type, environment, valueType.substitutions, new Set(), referenceNode);
		if (unsafeValue !== null) return { kind: "unsafe-dictionary", unsafeValue };
	}
	return null;
}

export function classifyWideningTarget(type: ESTree.TSType, environment: TypeEnvironment, referenceNode?: ESTree.Node): WideningTarget | null {
	const unwrapped = unwrapTransparentType(type);
	if (unwrapped.type === "TSUnknownKeyword") return { kind: "unknown" };
	if (unwrapped.type === "TSObjectKeyword") return { kind: "object" };
	if (unwrapped.type === "TSTypeLiteral") return unwrapped.members.some((member) => member.type === "TSIndexSignature") ? { kind: "open dictionary" } : unwrapped.members.length > 0 ? { kind: "anonymous object" } : null;
	if (unwrapped.type === "TSMappedType") return isBroadMappedKey(unwrapped.constraint, environment, new Map(), referenceNode) ? { kind: "open dictionary" } : null;
	if (unwrapped.type !== "TSTypeReference") return null;
	const name = typeReferenceName(unwrapped);
	if (name === null) return null;
	if (isShadowedByTypeParameter(name, unwrapped)) return null;
	if (TRANSPARENT_WRAPPERS.has(name) && isBuiltIn(name, environment, referenceNode, unwrapped)) {
		const wrapped = unwrapped.typeArguments?.params[0];
		return wrapped === undefined ? null : classifyWideningTarget(wrapped, environment, referenceNode);
	}
	if (name === "Record" && isBuiltIn(name, environment, referenceNode, unwrapped)) {
		const key = unwrapped.typeArguments?.params[0];
		return key !== undefined && isBroadMappedKey(key, environment, new Map(), referenceNode) ? { kind: "open dictionary" } : null;
	}
	const aliasBinding = visibleBinding(environment.aliases, name, referenceNode);
	if (aliasBinding === null) return null;
	const alias = aliasBinding.node;
	const substitutions = aliasSubstitution(alias, unwrapped, new Map());
	if (substitutions === null) return null;
	if ((alias.typeParameters?.params.length ?? 0) > 0) return classifyAliasBroadTarget(alias.typeAnnotation, environment, substitutions, new Set([name]), referenceNode)?.kind === "open dictionary" ? { kind: "generic container" } : null;
	return classifyAliasBroadTarget(alias.typeAnnotation, environment, substitutions, new Set([name]), referenceNode);
}

function isBroadMappedKey(type: ESTree.TSType, environment: TypeEnvironment, substitutions: TypeAliasEnvironment, referenceNode?: ESTree.Node, resolving: ReadonlySet<ESTree.TSType> = new Set()): boolean {
	const unwrapped = unwrapTransparentType(type);
	if (resolving.has(unwrapped)) return false;
	const nextResolving = new Set([...resolving, unwrapped]);
	if (unwrapped.type === "TSStringKeyword" || unwrapped.type === "TSNumberKeyword" || unwrapped.type === "TSSymbolKeyword") return true;
	if (unwrapped.type === "TSUnionType") return unwrapped.types.some((member) => isBroadMappedKey(member, environment, substitutions, referenceNode, nextResolving));
	if (unwrapped.type !== "TSTypeReference") return false;
	const name = typeReferenceName(unwrapped);
	if (name === null) return false;
	const substitution = substitutions.get(name);
	if (substitution !== undefined && !isUnappliedReferenceTo(substitution, name)) return isBroadMappedKey(substitution, environment, substitutions, referenceNode, nextResolving);
	if (isShadowedByTypeParameter(name, unwrapped)) return false;
	if (name === "PropertyKey" && isBuiltIn(name, environment, referenceNode, unwrapped)) return true;
	const alias = visibleBinding(environment.aliases, name, referenceNode)?.node;
	if (alias === undefined) return false;
	const nextSubstitutions = aliasSubstitution(alias, unwrapped, substitutions);
	return nextSubstitutions !== null && isBroadMappedKey(alias.typeAnnotation, environment, nextSubstitutions, referenceNode, nextResolving);
}

function classifyAliasBroadTarget(type: ESTree.TSType, environment: TypeEnvironment, substitutions: TypeAliasEnvironment, resolvingAliases: ReadonlySet<string>, referenceNode?: ESTree.Node): WideningTarget | null {
	const unwrapped = unwrapTransparentType(type);
	if (unwrapped.type === "TSUnknownKeyword") return { kind: "unknown" };
	if (unwrapped.type === "TSObjectKeyword") return { kind: "object" };
	if (unwrapped.type === "TSTypeLiteral") return unwrapped.members.some((member) => member.type === "TSIndexSignature") ? { kind: "open dictionary" } : null;
	if (unwrapped.type === "TSMappedType") return isBroadMappedKey(unwrapped.constraint, environment, substitutions, referenceNode) ? { kind: "open dictionary" } : null;
	if (unwrapped.type !== "TSTypeReference") return null;
	const name = typeReferenceName(unwrapped);
	if (name === null) return null;
	const substitution = substitutions.get(name);
	if (substitution !== undefined) return isUnappliedReferenceTo(substitution, name) ? null : classifyAliasBroadTarget(substitution, environment, substitutions, resolvingAliases, referenceNode);
	if (isShadowedByTypeParameter(name, unwrapped)) return null;
	if (TRANSPARENT_WRAPPERS.has(name) && isBuiltIn(name, environment, referenceNode, unwrapped)) {
		const wrapped = unwrapped.typeArguments?.params[0];
		return wrapped === undefined ? null : classifyAliasBroadTarget(wrapped, environment, substitutions, resolvingAliases, referenceNode);
	}
	if (name === "Record" && isBuiltIn(name, environment, referenceNode, unwrapped)) {
		const key = unwrapped.typeArguments?.params[0];
		return key !== undefined && isBroadMappedKey(key, environment, substitutions, referenceNode) ? { kind: "open dictionary" } : null;
	}
	const aliasBinding = visibleBinding(environment.aliases, name, referenceNode);
	if (aliasBinding === null || resolvingAliases.has(name)) return null;
	const nextSubstitutions = aliasSubstitution(aliasBinding.node, unwrapped, substitutions);
	return nextSubstitutions === null ? null : classifyAliasBroadTarget(aliasBinding.node.typeAnnotation, environment, nextSubstitutions, new Set([...resolvingAliases, name]), referenceNode);
}

export function isPopulatedObjectExpression(expression: ESTree.Expression): boolean {
	let current = expression;
	while (current.type === "ParenthesizedExpression" || current.type === "TSAsExpression" || current.type === "TSTypeAssertion" || current.type === "TSNonNullExpression") current = current.expression;
	return current.type === "ObjectExpression" && current.properties.length > 0;
}

export function isKnownEvidenceExpression(expression: ESTree.Expression): boolean {
	let current = expression;
	while (current.type === "ParenthesizedExpression" || current.type === "TSAsExpression" || current.type === "TSTypeAssertion" || current.type === "TSNonNullExpression" || current.type === "TSSatisfiesExpression") current = current.expression;
	if (current.type === "ObjectExpression") return true;
	return current.type === "ArrayExpression" || current.type === "ArrowFunctionExpression" || current.type === "ClassExpression" || current.type === "FunctionExpression" || current.type === "NewExpression" || current.type === "Literal" || current.type === "TemplateLiteral" || current.type === "UnaryExpression";
}
