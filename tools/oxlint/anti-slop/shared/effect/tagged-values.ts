import type { ESTree, Scope, SourceCode, Variable } from "@oxlint/plugins";

const equalityOperators = new Set(["==", "===", "!=", "!=="]);
const broadEffectCatchMethods = new Set(["catch", "catchAll", "catchIf"]);

const effectTagFactories = new Map<string, ReadonlySet<string>>([
	["Effect", new Set(["exit", "option", "runSyncExit"])],
	["Cause", new Set(["die", "empty", "fail", "interrupt", "parallel", "sequential"])],
	["Either", new Set(["left", "right"])],
	["Exit", new Set(["die", "fail", "interrupt", "succeed"])],
	["Option", new Set(["none", "some"])],
	["Result", new Set(["fail", "succeed"])],
]);

type IdentifierNode = ESTree.Node & { readonly type: "Identifier"; readonly name: string };

export const isStringLiteral = (node: ESTree.Node | null | undefined): node is ESTree.StringLiteral =>
	node?.type === "Literal" && typeof node.value === "string";

function memberName(node: ESTree.MemberExpression): string | null {
	if (!node.computed && node.property.type === "Identifier") return node.property.name;
	if (!node.computed && node.property.type !== "Identifier") return null;
	if (isStringLiteral(node.property)) return node.property.value;
	if (
		node.property.type === "TemplateLiteral" &&
		node.property.expressions.length === 0 &&
		node.property.quasis.length === 1
	) {
		return node.property.quasis[0]?.value.cooked ?? node.property.quasis[0]?.value.raw ?? null;
	}
	return null;
}

export const isTagMember = (
	node: ESTree.Node | null | undefined,
): node is ESTree.MemberExpression =>
	node?.type === "MemberExpression" && memberName(node) === "_tag";

export const tagMemberFromComparison = (
	node: ESTree.BinaryExpression,
): ESTree.MemberExpression | undefined => {
	if (!equalityOperators.has(node.operator)) return undefined;
	if (isTagMember(node.left) && isStringLiteral(node.right)) return node.left;
	if (isTagMember(node.right) && isStringLiteral(node.left)) return node.right;
	return undefined;
};

export const isReasonTagMember = (node: ESTree.MemberExpression): boolean =>
	node.object.type === "MemberExpression" && memberName(node.object) === "reason";

function unwrapExpression(expression: ESTree.Expression): ESTree.Expression {
	let current = expression;
	while (
		current.type === "ParenthesizedExpression" ||
		current.type === "TSAsExpression" ||
		current.type === "TSSatisfiesExpression" ||
		current.type === "TSTypeAssertion" ||
		current.type === "TSNonNullExpression" ||
		current.type === "TSInstantiationExpression"
	) {
		current = current.expression;
	}
	return current;
}

function isEffectRootNamespace(
	sourceCode: SourceCode,
	expression: ESTree.Expression,
	seen: ReadonlySet<Variable> = new Set(),
): boolean {
	const value = unwrapExpression(expression);
	if (value.type !== "Identifier") return false;
	const variable = resolveVariable(sourceCode, value);
	if (variable === null || seen.has(variable)) return false;
	if (
		variable.defs.some(
			(definition) =>
				definition.type === "ImportBinding" &&
				definition.parent?.type === "ImportDeclaration" &&
				definition.node.type === "ImportNamespaceSpecifier" &&
				definition.parent.source.value === "effect",
		)
	) return true;
	const initializer = variableInitializer(variable);
	return initializer !== null && isEffectRootNamespace(sourceCode, initializer, new Set([...seen, variable]));
}

function isImportedEffectNamespace(
	sourceCode: SourceCode,
	expression: ESTree.Expression,
	namespace: string,
	seen: ReadonlySet<Variable> = new Set(),
): boolean {
	const value = unwrapExpression(expression);
	if (value.type === "MemberExpression") {
		return memberName(value) === namespace && isEffectRootNamespace(sourceCode, value.object);
	}
	if (value.type !== "Identifier") return false;
	const variable = resolveVariable(sourceCode, value);
	if (variable === null || seen.has(variable)) return false;
	if (
		variable.defs.some((definition) => {
			if (definition.type !== "ImportBinding" || definition.parent?.type !== "ImportDeclaration") return false;
			const source = definition.parent.source.value;
			if (definition.node.type === "ImportNamespaceSpecifier") {
				return isEffectModuleForNamespace(source, namespace);
			}
			return (
				definition.node.type === "ImportSpecifier" &&
				importedName(definition.node) === namespace &&
				(source === "effect" || isEffectModuleForNamespace(source, namespace))
			);
		})
	) return true;
	const initializer = variableInitializer(variable);
	return initializer !== null &&
		isImportedEffectNamespace(sourceCode, initializer, namespace, new Set([...seen, variable]));
}

function isEffectTagFactoryCall(sourceCode: SourceCode, node: ESTree.CallExpression): boolean {
	const callee = unwrapExpression(node.callee);
	if (callee.type === "MemberExpression") {
		const namespace = [...effectTagFactories].find(([name]) =>
			isImportedEffectNamespace(sourceCode, callee.object, name),
		);
		return namespace !== undefined && namespace[1].has(memberName(callee) ?? "");
	}
	if (callee.type !== "Identifier") return false;
	return [...effectTagFactories].some(([namespace, methods]) =>
		[...methods].some((method) => isNamedEffectFactory(sourceCode, callee, namespace, method)),
	);
}

function resolveVariable(sourceCode: SourceCode, identifier: IdentifierNode): Variable | null {
	let scope: Scope | null = sourceCode.getScope(identifier);
	while (scope !== null) {
		const variable = scope.set.get(identifier.name);
		if (variable !== undefined) return variable;
		scope = scope.upper;
	}
	return null;
}

function variableInitializer(variable: Variable): ESTree.Expression | null {
	if (variable.defs.length !== 1) return null;
	const definition = variable.defs[0];
	if (
		definition?.type !== "Variable" ||
		definition.node.type !== "VariableDeclarator" ||
		definition.parent?.type !== "VariableDeclaration" ||
		definition.parent.kind !== "const" ||
		variable.references.some((reference) => reference.isWrite() && !reference.init)
	) {
		return null;
	}
	return definition.node.id.type === "Identifier" ? definition.node.init : null;
}

function isEffectModuleForNamespace(source: string, namespace: string): boolean {
	return source === "effect" || source === `effect/${namespace}` || source === `effect/${namespace}.js`;
}

function importedName(node: ESTree.ImportSpecifier): string {
	return node.imported.type === "Identifier" ? node.imported.name : node.imported.value;
}

function isNamedEffectFactory(
	sourceCode: SourceCode,
	identifier: ESTree.IdentifierReference,
	namespace: string,
	method: string,
	): boolean {
	const variable = resolveVariable(sourceCode, identifier);
	if (variable === null) return false;
	if (
		variable.defs.some((definition) =>
			definition.type === "ImportBinding" &&
			definition.parent?.type === "ImportDeclaration" &&
			definition.node.type === "ImportSpecifier" &&
			importedName(definition.node) === method &&
			isEffectModuleForNamespace(definition.parent.source.value, namespace),
		)
	) return true;
	const initializer = variableInitializer(variable);
	if (initializer === null) return false;
	const value = unwrapExpression(initializer);
	if (value.type !== "MemberExpression" || memberName(value) !== method) return false;
	return isImportedEffectNamespace(sourceCode, value.object, namespace);
}

/** Restrict tag-comparison enforcement to values produced by known Effect tagged constructors. */
function isEffectTaggedValueFromExpression(
	sourceCode: SourceCode,
	expression: ESTree.Expression,
	seen: ReadonlySet<Variable>,
): boolean {
	const value = unwrapExpression(expression);
	if (value.type === "CallExpression") return isEffectTagFactoryCall(sourceCode, value);
	if (value.type !== "Identifier") return false;
	const variable = resolveVariable(sourceCode, value);
	if (variable === null || seen.has(variable)) return false;
	const initializer = variableInitializer(variable);
	return initializer !== null &&
		isEffectTaggedValueFromExpression(sourceCode, initializer, new Set([...seen, variable]));
}

export function isEffectTaggedValue(sourceCode: SourceCode, expression: ESTree.Expression): boolean {
	return isEffectTaggedValueFromExpression(sourceCode, expression, new Set());
}

function isEffectCatchMethodReference(
	sourceCode: SourceCode,
	expression: ESTree.Expression,
	seen: ReadonlySet<Variable> = new Set(),
): string | null {
	const value = unwrapExpression(expression);
	if (value.type === "MemberExpression") {
		const method = memberName(value);
		return method !== null &&
			broadEffectCatchMethods.has(method) &&
			isImportedEffectNamespace(sourceCode, value.object, "Effect")
			? method
			: null;
	}
	if (value.type !== "Identifier") return null;
	const variable = resolveVariable(sourceCode, value);
	if (variable === null || seen.has(variable)) return null;
	if (
		variable.defs.some((definition) => {
			if (definition.type !== "ImportBinding" || definition.parent?.type !== "ImportDeclaration") return false;
			return (
				definition.node.type === "ImportSpecifier" &&
				broadEffectCatchMethods.has(importedName(definition.node)) &&
				isEffectModuleForNamespace(definition.parent.source.value, "Effect")
			);
		})
	) {
		const definition = variable.defs.find(
			(item) =>
				item.type === "ImportBinding" &&
				item.parent?.type === "ImportDeclaration" &&
				item.node.type === "ImportSpecifier",
		);
		return definition?.node.type === "ImportSpecifier" ? importedName(definition.node) : null;
	}
	const initializer = variableInitializer(variable);
	return initializer === null
		? null
		: isEffectCatchMethodReference(sourceCode, initializer, new Set([...seen, variable]));
}

function isBroadEffectCatchCall(sourceCode: SourceCode, node: ESTree.Node | null | undefined): node is ESTree.CallExpression {
	return node?.type === "CallExpression" && isEffectCatchMethodReference(sourceCode, node.callee) !== null;
}

type HandlerFunction = ESTree.ArrowFunctionExpression | ESTree.Function;

function unwrapNode(node: ESTree.Node): ESTree.Node {
	let current = node;
	while (
		current.type === "ParenthesizedExpression" ||
		current.type === "TSAsExpression" ||
		current.type === "TSSatisfiesExpression" ||
		current.type === "TSTypeAssertion" ||
		current.type === "TSNonNullExpression" ||
		current.type === "TSInstantiationExpression"
	) {
		current = current.expression;
	}
	return current;
}

function functionArgumentIndex(call: ESTree.CallExpression, node: ESTree.Node): number {
	const target = unwrapNode(node);
	return call.arguments.findIndex((argument) => argument.type !== "SpreadElement" && unwrapNode(argument) === target);
}

function isFunctionNode(node: ESTree.Node): node is HandlerFunction {
	return (
		node.type === "ArrowFunctionExpression" ||
		node.type === "FunctionExpression" ||
		node.type === "FunctionDeclaration"
	);
}

function isFunctionLikeExpression(
	sourceCode: SourceCode,
	expression: ESTree.Expression | ESTree.SpreadElement,
	seen: ReadonlySet<Variable> = new Set(),
): boolean {
	if (expression.type === "SpreadElement") return false;
	const value = unwrapExpression(expression);
	if (isFunctionNode(value)) return true;
	if (value.type !== "Identifier") return false;
	const variable = resolveVariable(sourceCode, value);
	if (variable === null || seen.has(variable)) return false;
	if (variable.defs.some((definition) => definition.type === "FunctionName" && definition.node.type === "FunctionDeclaration")) {
		return true;
	}
	const initializer = variableInitializer(variable);
	return initializer !== null && isFunctionLikeExpression(sourceCode, initializer, new Set([...seen, variable]));
}

function unwrapParentExpression(node: ESTree.Node): ESTree.Node {
	let current = node;
	while (current.parent !== null) {
		const parent = current.parent;
		switch (parent.type) {
			case "ParenthesizedExpression":
			case "TSAsExpression":
			case "TSSatisfiesExpression":
			case "TSTypeAssertion":
			case "TSNonNullExpression":
			case "TSInstantiationExpression":
				if (parent.expression === current) {
					current = parent;
					continue;
				}
				return current;
			default:
				return current;
		}
	}
	return current;
}

function callForExpression(sourceExpression: ESTree.Node): { readonly call: ESTree.CallExpression; readonly index: number } | null {
	const current = unwrapParentExpression(sourceExpression);
	if (current.parent?.type !== "CallExpression") return null;
	const index = functionArgumentIndex(current.parent, current);
	return index < 0 ? null : { call: current.parent, index };
}

function isRecoveryHandlerArgument(sourceCode: SourceCode, call: ESTree.CallExpression, index: number): boolean {
	if (!isBroadEffectCatchCall(sourceCode, call)) return false;
	const method = isEffectCatchMethodReference(sourceCode, call.callee);
	if (method === null) return false;
	const firstArgument = call.arguments[0];
	const firstIsFunction = firstArgument !== undefined &&
		isFunctionLikeExpression(sourceCode, firstArgument);
	const handlerIndex = method === "catchIf"
		? firstIsFunction ? 1 : call.arguments.length >= 3 ? 2 : 1
		: (() => {
			return firstIsFunction ? 0 : 1;
		})();
	return index === handlerIndex;
}

function functionBinding(sourceCode: SourceCode, node: HandlerFunction): Variable | null {
	const current = unwrapParentExpression(node);
	if (current.parent?.type === "VariableDeclarator" && current.parent.id.type === "Identifier" && current.parent.init === current) {
		if (current.parent.parent?.type !== "VariableDeclaration" || current.parent.parent.kind !== "const") return null;
		return resolveVariable(sourceCode, current.parent.id);
	}
	if (node.type === "FunctionDeclaration" && node.id !== null) return resolveVariable(sourceCode, node.id);
	return null;
}

function isStableFunctionReference(variable: Variable): boolean {
	return variable.references.every((reference) => reference.init || !reference.isWrite());
}

function isBroadEffectHandlerFunction(
	sourceCode: SourceCode,
	node: ESTree.Node,
	): node is ESTree.ArrowFunctionExpression | ESTree.Function {
	if (!isFunctionNode(node)) return false;
	const direct = callForExpression(node);
	if (direct !== null && isRecoveryHandlerArgument(sourceCode, direct.call, direct.index)) return true;
	const variable = functionBinding(sourceCode, node);
	return variable !== null && isStableFunctionReference(variable) && variable.references.some((reference) => {
		if (!reference.isRead()) return false;
		const call = callForExpression(reference.identifier);
		return call !== null && isRecoveryHandlerArgument(sourceCode, call.call, call.index);
	});
}

export const getBroadEffectHandlerParameter = (
	sourceCode: SourceCode,
	node: ESTree.Node,
): ESTree.BindingIdentifier | undefined => {
	let current: ESTree.Node | null = node.parent;
	while (current !== null) {
		if (isBroadEffectHandlerFunction(sourceCode, current)) {
			const parameter = current.params[0];
			return parameter?.type === "Identifier" ? parameter : undefined;
		}
		current = current.parent;
	}
	return undefined;
};

export const isInsideBroadEffectHandler = (sourceCode: SourceCode, node: ESTree.Node): boolean => {
	return getBroadEffectHandlerParameter(sourceCode, node) !== undefined;
};

function caughtErrorPathDepth(
	sourceCode: SourceCode,
	expression: ESTree.Expression,
	parameter: ESTree.BindingIdentifier,
	seen: ReadonlySet<Variable>,
): number | null {
	const value = unwrapExpression(expression);
	if (value.type === "MemberExpression") {
		return memberName(value) === "reason"
			? (() => {
				const depth = caughtErrorPathDepth(sourceCode, value.object, parameter, seen);
				return depth === null ? null : depth + 1;
			})()
			: null;
	}
	if (value.type !== "Identifier") return null;
	const parameterVariable = resolveVariable(sourceCode, parameter);
	const variable = resolveVariable(sourceCode, value);
	if (parameterVariable === null || variable === null) return null;
	if (variable === parameterVariable) return 0;
	if (seen.has(variable)) return null;
	const initializer = variableInitializer(variable);
	return initializer === null
		? null
		: caughtErrorPathDepth(sourceCode, initializer, parameter, new Set([...seen, variable]));
}

export function broadEffectErrorTagDepth(
	sourceCode: SourceCode,
	member: ESTree.MemberExpression,
	parameter: ESTree.BindingIdentifier,
): number | null {
	return caughtErrorPathDepth(sourceCode, member.object, parameter, new Set());
}
