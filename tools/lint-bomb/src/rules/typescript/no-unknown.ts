import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode, Variable } from "@oxlint/plugins";

import { isImportedFromEffect } from "../../shared/effect/effect-import.ts";
import { memberName, unwrapExpression } from "../../shared/effect/effect-call.ts";
import { isTestSupportFile, normalizedFilename } from "../../shared/file-scope.ts";
import { configuredPath, isPathWithin } from "../../shared/module-path.ts";
import { resolveVariable } from "../../shared/scope.ts";

type FieldConfiguration = { readonly file: string; readonly fields: readonly string[] };
type RuleOptions = [
	{
		readonly sourceRoots?: readonly string[];
		readonly admissionRoots?: readonly string[];
		readonly admissionFiles?: readonly string[];
		readonly reportAnyAdmissionPredicates?: boolean;
		readonly allowedSchemaFields?: readonly FieldConfiguration[];
		readonly allowedProperties?: readonly FieldConfiguration[];
		readonly allowedParameters?: readonly FieldConfiguration[];
	},
];

const decoderMethodNames = new Set([
	"decodeUnknownEffect",
	"decodeUnknownExit",
	"decodeUnknownOption",
	"decodeUnknownPromise",
	"decodeUnknownResult",
	"decodeUnknownSync",
]);
const schemaBoundaryMethodNames = new Set(["declareConstructor", ...decoderMethodNames]);

function isNode(value: unknown): value is ESTree.Node {
	return typeof value === "object" && value !== null && "type" in value;
}

function isWithin(node: ESTree.Node, ancestor: ESTree.Node): boolean {
	return node.start >= ancestor.start && node.end <= ancestor.end;
}

function isTypeParameterPosition(node: ESTree.TSUnknownKeyword): boolean {
	let current: ESTree.Node | null = node.parent;
	while (current !== null) {
		if (current.type === "TSTypeParameter") {
			return (
				(current.constraint !== null &&
					current.constraint !== undefined &&
					isWithin(node, current.constraint)) ||
				(current.default !== null &&
					current.default !== undefined &&
					isWithin(node, current.default))
			);
		}
		if (current.type === "Program") return false;
		current = current.parent;
	}
	return false;
}

function isSchemaBoundaryTypeArgument(
	sourceCode: SourceCode,
	node: ESTree.TSUnknownKeyword,
): boolean {
	let current: ESTree.Node | null = node.parent;
	while (current !== null) {
		if (current.type === "TSTypeParameterInstantiation") {
			const owner = current.parent;
			const callee =
				owner.type === "CallExpression" || owner.type === "NewExpression"
					? unwrapExpression(owner.callee)
					: owner.type === "TSInstantiationExpression"
						? unwrapExpression(owner.expression)
						: null;
			if (
				callee?.type === "MemberExpression" &&
				schemaBoundaryMethodNames.has(memberName(callee) ?? "") &&
				isImportedFromEffect(sourceCode, callee.object, new Set(["Schema"]))
			) {
				return true;
			}
		}
		if (current.type === "Program") return false;
		current = current.parent;
	}
	return false;
}

function isConditionalCheckOrExtendsType(node: ESTree.TSUnknownKeyword): boolean {
	let child: ESTree.Node = node;
	let current: ESTree.Node | null = node.parent;
	while (current !== null) {
		if (current.type === "TSConditionalType") {
			return current.checkType === child || current.extendsType === child;
		}
		if (current.type === "Program") return false;
		child = current;
		current = current.parent;
	}
	return false;
}

function isErasedFunctionType(node: ESTree.TSUnknownKeyword): boolean {
	let current: ESTree.Node | null = node.parent;
	while (current !== null) {
		if (current.type === "TSFunctionType") {
			if (
				current.params.some(
					(parameter) => parameter.type === "RestElement" && isWithin(node, parameter),
				)
			) {
				return true;
			}
			return (
				current.returnType !== null &&
				current.returnType !== undefined &&
				current.returnType.typeAnnotation.type === "TSUnknownKeyword" &&
				isWithin(node, current.returnType.typeAnnotation)
			);
		}
		if (current.type === "Program") return false;
		current = current.parent;
	}
	return false;
}

function isInCatchParameter(node: ESTree.TSUnknownKeyword): boolean {
	let current: ESTree.Node | null = node.parent;
	while (current !== null) {
		if (current.type === "CatchClause") {
			return current.param !== null && current.param !== undefined && isWithin(node, current.param);
		}
		if (current.type === "Program") return false;
		current = current.parent;
	}
	return false;
}

function parameterIdentifier(parameter: ESTree.ParamPattern): ESTree.BindingIdentifier | null {
	if (parameter.type === "TSParameterProperty") return parameterIdentifier(parameter.parameter);
	if (parameter.type === "RestElement") return parameterIdentifier(parameter.argument);
	if (parameter.type === "AssignmentPattern") return parameterIdentifier(parameter.left);
	return parameter.type === "Identifier" ? parameter : null;
}

function isDecoderCall(
	sourceCode: SourceCode,
	node: ESTree.CallExpression,
	parameter: Variable,
): boolean {
	if (
		!node.arguments.some(
			(argument) => {
				if (argument.type === "SpreadElement") return false;
				const value = unwrapExpression(argument);
				return value.type === "Identifier" && resolveVariable(sourceCode, value) === parameter;
			},
		)
	) {
		return false;
	}

	let callee: ESTree.Expression = unwrapExpression(node.callee);
	while (callee.type === "CallExpression") callee = unwrapExpression(callee.callee);
	return (
		callee.type === "MemberExpression" &&
		memberName(callee) !== null &&
		decoderMethodNames.has(memberName(callee) as string) &&
		isImportedFromEffect(sourceCode, callee.object, new Set(["Schema"]))
	);
}

function containsDecoderCall(
	sourceCode: SourceCode,
	node: ESTree.Node,
	parameter: Variable,
): boolean {
	if (node.type === "CallExpression" && isDecoderCall(sourceCode, node, parameter)) return true;
	for (const [key, value] of Object.entries(node)) {
		if (
			key === "parent" ||
			key === "loc" ||
			key === "range" ||
			key === "tokens" ||
			key === "comments"
		)
			continue;
		if (Array.isArray(value)) {
			if (value.some((child) => isNode(child) && containsDecoderCall(sourceCode, child, parameter)))
				return true;
		} else if (isNode(value) && containsDecoderCall(sourceCode, value, parameter)) {
			return true;
		}
	}
	return false;
}

function isDirectDecoderParameter(sourceCode: SourceCode, node: ESTree.TSUnknownKeyword): boolean {
	let current: ESTree.Node | null = node.parent;
	while (current !== null) {
		if (
			current.type === "ArrowFunctionExpression" ||
			current.type === "FunctionDeclaration" ||
			current.type === "FunctionExpression"
		) {
			const parameter = current.params.find((candidate) => isWithin(node, candidate));
			const identifier = parameter === undefined ? null : parameterIdentifier(parameter);
			const body = current.body;
			const variable = identifier === null ? null : resolveVariable(sourceCode, identifier);
			return (
				variable !== null &&
				body !== null &&
				containsDecoderCall(sourceCode, body, variable)
			);
		}
		if (current.type === "Program") return false;
		current = current.parent;
	}
	return false;
}

function isTypeGuardParameter(sourceCode: SourceCode, node: ESTree.TSUnknownKeyword): boolean {
	let current: ESTree.Node | null = node.parent;
	while (current !== null) {
		if (isAdmissionSignature(current)) {
			const parameter = current.params.find((candidate) => isWithin(node, candidate));
			const identifier = parameter === undefined ? null : parameterIdentifier(parameter);
			const returnType = current.returnType?.typeAnnotation;
			const predicateMatches =
				identifier !== null &&
				returnType?.type === "TSTypePredicate" &&
				returnType.parameterName.type === "Identifier" &&
				(isFunctionLike(current) && current.body !== null
					? sameParameterBinding(sourceCode, identifier, returnType.parameterName) !== null
					: returnType.parameterName.name === identifier.name);
			return predicateMatches;
		}
		if (current.type === "Program") return false;
		current = current.parent;
	}
	return false;
}

type FunctionLike = ESTree.ArrowFunctionExpression | ESTree.Function;
type DeclareFunctionSignature = ESTree.Node & {
	readonly type: "TSDeclareFunction";
	readonly params: ESTree.ParamPattern[];
	readonly returnType: ESTree.TSTypeAnnotation | null;
};
type AdmissionSignature =
	| FunctionLike
	| DeclareFunctionSignature
	| ESTree.TSFunctionType
	| ESTree.TSMethodSignature
	| ESTree.TSCallSignatureDeclaration;

type AdmissionPredicate = {
	readonly parameterVariable: Variable;
	readonly predicate: ESTree.TSTypePredicate;
	readonly function: AdmissionSignature;
};

function isFunctionLike(node: ESTree.Node): node is FunctionLike {
	return (
		node.type === "ArrowFunctionExpression" ||
		node.type === "FunctionDeclaration" ||
		node.type === "FunctionExpression"
	);
}

function hasRuntimeBody(signature: AdmissionSignature): signature is FunctionLike {
	return isFunctionLike(signature) && signature.body !== null;
}

function isAdmissionSignature(node: ESTree.Node): node is AdmissionSignature {
	return (
		isFunctionLike(node) ||
		isDeclareFunctionSignature(node) ||
		node.type === "TSFunctionType" ||
		node.type === "TSMethodSignature" ||
		node.type === "TSCallSignatureDeclaration"
	);
}

function isDeclareFunctionSignature(node: ESTree.Node): node is DeclareFunctionSignature {
	return (node as ESTree.Node & { readonly type: string }).type === "TSDeclareFunction";
}

function parameterType(parameter: ESTree.ParamPattern): ESTree.Node | null {
	if (parameter.type === "TSParameterProperty") return parameterType(parameter.parameter);
	if (parameter.type === "RestElement") {
		return parameter.typeAnnotation?.typeAnnotation ?? parameterType(parameter.argument);
	}
	if (parameter.type === "AssignmentPattern") return parameterType(parameter.left);
	return parameter.type === "Identifier"
		? (parameter.typeAnnotation?.typeAnnotation ?? null)
		: null;
}

function isExplicitAdmissionType(parameter: ESTree.ParamPattern, node: ESTree.Node): boolean {
	let type = parameterType(parameter);
	while (type?.type === "TSParenthesizedType") type = type.typeAnnotation;
	return type === node;
}

function sameParameterBinding(
	sourceCode: SourceCode,
	parameter: ESTree.BindingIdentifier,
	predicateName: ESTree.IdentifierName,
): Variable | null {
	if (parameter.name !== predicateName.name || parameter.name === "this") return null;
	const parameterVariable = resolveVariable(sourceCode, parameter);
	const predicateVariable = resolveVariable(sourceCode, predicateName);
	return parameterVariable !== null && parameterVariable === predicateVariable
		? parameterVariable
		: null;
}

function admissionPredicateForType(
	sourceCode: SourceCode,
	node: ESTree.TSUnknownKeyword | ESTree.TSAnyKeyword,
): AdmissionPredicate | null {
	let current: ESTree.Node | null = node.parent;
	while (current !== null) {
		if (isAdmissionSignature(current)) {
			const parameter = current.params.find((candidate) => isWithin(node, candidate));
			const identifier = parameter === undefined ? null : parameterIdentifier(parameter);
			const predicate = current.returnType?.typeAnnotation;
			const predicateName =
				predicate?.type === "TSTypePredicate" && predicate.parameterName.type === "Identifier"
					? predicate.parameterName
					: null;
			const parameterVariable =
				identifier !== null && predicateName !== null
					? sameParameterBinding(sourceCode, identifier, predicateName)
					: null;
			if (
				identifier === null ||
				parameter === undefined ||
				!isExplicitAdmissionType(parameter, node) ||
				predicate?.type !== "TSTypePredicate" ||
				predicate.parameterName.type !== "Identifier" ||
				parameterVariable === null
			) {
				return null;
			}
			return { parameterVariable, predicate, function: current };
		}
		if (current.type === "Program") return null;
		current = current.parent;
	}
	return null;
}

function singleReturnedExpression(node: AdmissionSignature): ESTree.Expression | null {
	if (!isFunctionLike(node)) return null;
	if (node.body === null) return null;
	if (node.body.type !== "BlockStatement")
		return node.type === "ArrowFunctionExpression" ? node.body : null;
	if (node.body.body.length !== 1) return null;
	const statement = node.body.body[0];
	return statement?.type === "ReturnStatement" ? statement.argument : null;
}

function stableConstInitializer(
	sourceCode: SourceCode,
	identifier: ESTree.IdentifierReference,
): ESTree.Expression | null {
	const variable = resolveVariable(sourceCode, identifier);
	if (variable === null || variable.defs.length !== 1) return null;
	const definition = variable.defs[0];
	if (
		definition?.type !== "Variable" ||
		definition.node.type !== "VariableDeclarator" ||
		definition.parent?.type !== "VariableDeclaration" ||
		definition.parent.kind !== "const" ||
		definition.node.id.type !== "Identifier" ||
		variable.references.some((reference) => reference.isWrite() && !reference.init)
	) {
		return null;
	}
	return definition.node.init;
}

function schemaIsFactoryArgument(
	sourceCode: SourceCode,
	expression: ESTree.Expression,
	seen: ReadonlySet<Variable> = new Set(),
): ESTree.Expression | null {
	const unwrapped = unwrapExpression(expression);
	if (unwrapped.type === "CallExpression") {
		const callee = unwrapExpression(unwrapped.callee);
		return !unwrapped.optional &&
			unwrapped.arguments.length === 1 &&
			unwrapped.arguments[0]?.type !== "SpreadElement" &&
			callee.type === "MemberExpression" &&
			memberName(callee) === "is" &&
			isImportedFromEffect(sourceCode, callee.object, new Set(["Schema"]))
			? (unwrapped.arguments[0] as ESTree.Expression)
			: null;
	}
	if (unwrapped.type !== "Identifier") return null;
	const variable = resolveVariable(sourceCode, unwrapped);
	if (variable === null || seen.has(variable)) return null;
	const initializer = stableConstInitializer(sourceCode, unwrapped);
	return initializer === null
		? null
		: schemaIsFactoryArgument(sourceCode, initializer, new Set([...seen, variable]));
}

function isSchemaIsDelegation(
	sourceCode: SourceCode,
	expression: ESTree.Expression,
	parameterVariable: Variable,
): ESTree.Expression | null {
	const call = unwrapExpression(expression);
	if (call.type !== "CallExpression" || call.optional || call.arguments.length !== 1) return null;
	const argument = call.arguments[0];
	if (argument === undefined || argument.type === "SpreadElement") return null;
	const input = unwrapExpression(argument);
	if (input.type !== "Identifier" || resolveVariable(sourceCode, input) !== parameterVariable) {
		return null;
	}
	const callee = unwrapExpression(call.callee);
	return callee.type === "CallExpression" || callee.type === "Identifier"
		? schemaIsFactoryArgument(sourceCode, callee)
		: null;
}

function schemaAssertDelegation(
	sourceCode: SourceCode,
	admission: AdmissionPredicate,
): ESTree.Expression | null {
	if (admission.predicate.asserts) return isSchemaAssertDelegation(sourceCode, admission);
	const expression = singleReturnedExpression(admission.function);
	return expression === null
		? null
		: isSchemaIsDelegation(sourceCode, expression, admission.parameterVariable);
}

function isSchemaAssertDelegation(
	sourceCode: SourceCode,
	admission: AdmissionPredicate,
): ESTree.Expression | null {
	if (!isFunctionLike(admission.function)) return null;
	const body = admission.function.body;
	if (body === null || body.type !== "BlockStatement" || body.body.length !== 1) return null;
	const statement = body.body[0];
	if (statement?.type !== "ExpressionStatement") return null;
	const call = unwrapExpression(statement.expression);
	if (
		call.type !== "CallExpression" ||
		call.optional ||
		call.arguments.length !== 2 ||
		call.arguments.some((argument) => argument.type === "SpreadElement")
	) {
		return null;
	}
	const callee = unwrapExpression(call.callee);
	if (
		callee.type !== "MemberExpression" ||
		memberName(callee) !== "asserts" ||
		!isImportedFromEffect(sourceCode, callee.object, new Set(["Schema"]))
	) {
		return null;
	}
	const input = call.arguments[1];
	if (input === undefined || input.type === "SpreadElement") return null;
	const unwrappedInput = unwrapExpression(input);
	return unwrappedInput.type === "Identifier" &&
		resolveVariable(sourceCode, unwrappedInput) === admission.parameterVariable
		? (call.arguments[0] as ESTree.Expression)
		: null;
}

function qualifiedNamePath(node: ESTree.TSTypeName): {
	readonly root: ESTree.IdentifierReference;
	readonly parts: readonly string[];
} | null {
	if (node.type === "Identifier") return { root: node, parts: [] };
	if (node.type !== "TSQualifiedName") return null;
	const left = qualifiedNamePath(node.left);
	return left === null ? null : { root: left.root, parts: [...left.parts, node.right.name] };
}

function schemaTypeImportPath(
	sourceCode: SourceCode,
	root: ESTree.IdentifierReference,
): readonly string[] | null {
	const variable = resolveVariable(sourceCode, root);
	if (variable === null) return null;
	for (const definition of variable.defs) {
		if (definition.type !== "ImportBinding" || definition.parent?.type !== "ImportDeclaration")
			continue;
		const source = definition.parent.source.value;
		if (!source.startsWith("effect")) continue;
		if (definition.node.type === "ImportSpecifier") {
			const imported =
				definition.node.imported.type === "Identifier"
					? definition.node.imported.name
					: definition.node.imported.value;
			return imported === "Schema" && (source === "effect" || source === "effect/Schema")
				? ["Schema", "Type"]
				: null;
		}
		if (definition.node.type === "ImportNamespaceSpecifier") {
			return source === "effect"
				? ["Schema", "Schema", "Type"]
				: source === "effect/Schema"
					? ["Schema", "Type"]
					: null;
		}
	}
	return null;
}

function schemaBindingForExpression(
	sourceCode: SourceCode,
	expression: ESTree.Expression,
	seen: ReadonlySet<Variable> = new Set(),
): Variable | null {
	const value = unwrapExpression(expression);
	if (value.type !== "Identifier") return null;
	const variable = resolveVariable(sourceCode, value);
	if (variable === null || seen.has(variable) || variable.defs.length !== 1) return null;
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
	const initializer = definition.node.init;
	return initializer !== null && unwrapExpression(initializer).type === "Identifier"
		? schemaBindingForExpression(sourceCode, initializer, new Set([...seen, variable]))
		: variable;
}

function isSchemaDerivedType(
	sourceCode: SourceCode,
	type: ESTree.Node | null | undefined,
	schemaBinding: Variable,
	seen: ReadonlySet<Variable> = new Set(),
): boolean {
	if (type === null || type === undefined) return false;
	if (type.type === "TSParenthesizedType")
		return isSchemaDerivedType(sourceCode, type.typeAnnotation, schemaBinding, seen);
	if (type.type === "TSTypeQuery") {
		if (type.exprName.type === "TSImportType") return false;
		const query = qualifiedNamePath(type.exprName);
		return (
			query !== null &&
			query.parts.length === 1 &&
			query.parts[0] === "Type" &&
			schemaBindingForExpression(sourceCode, query.root) === schemaBinding
		);
	}
	if (type.type !== "TSTypeReference") return false;
	const name = qualifiedNamePath(type.typeName);
	if (
		name !== null &&
		name.parts.length > 0 &&
		name.parts.join(".") === schemaTypeImportPath(sourceCode, name.root)?.join(".")
	) {
		const argument = type.typeArguments?.params[0];
		if (argument?.type !== "TSTypeQuery" || argument.exprName.type !== "Identifier") return false;
		return schemaBindingForExpression(sourceCode, argument.exprName) === schemaBinding;
	}
	if (type.typeName.type !== "Identifier") return false;
	const alias = resolveVariable(sourceCode, type.typeName);
	if (alias === null || seen.has(alias)) return false;
	const definition = alias.defs.find(
		(candidate) => candidate.node.type === "TSTypeAliasDeclaration",
	);
	return (
		definition?.node.type === "TSTypeAliasDeclaration" &&
		isSchemaDerivedType(
			sourceCode,
			definition.node.typeAnnotation,
			schemaBinding,
			new Set([...seen, alias]),
		)
	);
}

function isSchemaDelegatedAdmission(
	sourceCode: SourceCode,
	admission: AdmissionPredicate,
): boolean {
	const schema = schemaAssertDelegation(sourceCode, admission);
	const schemaBinding = schema === null ? null : schemaBindingForExpression(sourceCode, schema);
	return (
		schemaBinding !== null &&
		isSchemaDerivedType(
			sourceCode,
			admission.predicate.typeAnnotation?.typeAnnotation,
			schemaBinding,
		)
	);
}

function propertyName(node: ESTree.Node, sourceCode: SourceCode): string | null {
	if (
		node.type !== "Property" &&
		node.type !== "TSPropertySignature" &&
		node.type !== "PropertyDefinition"
	) {
		return null;
	}
	const key = node.key;
	if (key.type === "Identifier" || key.type === "PrivateIdentifier") return key.name;
	if (key.type === "Literal" && typeof key.value === "string") return key.value;
	return sourceCode.getText(key);
}

function containingProperty(
	node: ESTree.Node,
	sourceCode: SourceCode,
): { readonly name: string; readonly node: ESTree.Node } | null {
	let current: ESTree.Node | null = node.parent;
	while (current !== null && current.type !== "Program") {
		const name = propertyName(current, sourceCode);
		if (name !== null) return { name, node: current };
		current = current.parent;
	}
	return null;
}

function containingParameter(node: ESTree.Node): { readonly name: string } | null {
	let current: ESTree.Node | null = node.parent;
	while (current !== null && current.type !== "Program") {
		if (
			current.type === "ArrowFunctionExpression" ||
			current.type === "FunctionDeclaration" ||
			current.type === "FunctionExpression"
		) {
			const parameter = current.params.find((candidate) => isWithin(node, candidate));
			const identifier = parameter === undefined ? null : parameterIdentifier(parameter);
			return identifier === null ? null : { name: identifier.name };
		}
		current = current.parent;
	}
	return null;
}

function matchesFile(filename: string, configuredFile: string, cwd: string): boolean {
	return configuredPath(filename, cwd) === configuredPath(configuredFile, cwd);
}

function isAdmissionFile(
	filename: string,
	files: readonly string[],
	roots: readonly string[],
	cwd: string,
): boolean {
	return (
		files.some((file) => matchesFile(filename, file, cwd)) ||
		roots.some((root) => isPathWithin(filename, root, cwd))
	);
}

function isExcludedSupportFile(filename: string): boolean {
	const normalized = normalizedFilename(filename);
	return isTestSupportFile(filename) || normalized.endsWith(".compile.ts");
}

function matchesConfiguration(
	filename: string,
	property: { readonly name: string },
	configurations: readonly FieldConfiguration[],
	cwd: string,
): boolean {
	return configurations.some(
		(configuration) =>
			configuration.fields.includes(property.name) &&
			matchesFile(filename, configuration.file, cwd),
	);
}

function isSchemaUnknown(sourceCode: SourceCode, node: ESTree.Node): boolean {
	if (node.type !== "MemberExpression" || memberName(node) !== "Unknown") return false;
	return isImportedFromEffect(sourceCode, node.object, new Set(["Schema"]));
}

function isSchemaStructField(sourceCode: SourceCode, node: ESTree.Node): boolean {
	const property = containingProperty(node, sourceCode);
	if (property === null || property.node.type !== "Property") return false;
	let object: ESTree.Node | null = property.node.parent;
	while (object !== null && object.type === "ObjectExpression") {
		const call = object.parent;
		if (call?.type !== "CallExpression") return false;
		const callee = unwrapExpression(call.callee);
		return (
			callee.type === "MemberExpression" &&
			memberName(callee) === "Struct" &&
			isImportedFromEffect(sourceCode, callee.object, new Set(["Schema"]))
		);
	}
	return false;
}

function isStandaloneComment(
	sourceCode: SourceCode,
	comment: { readonly start: number; readonly end: number },
): boolean {
	const text = sourceCode.getText();
	const lineStart = Math.max(text.lastIndexOf("\n", comment.start - 1) + 1, 0);
	const lineEndIndex = text.indexOf("\n", comment.end);
	const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex;
	return (
		text.slice(lineStart, comment.start).trim() === "" &&
		text.slice(comment.end, lineEnd).trim() === ""
	);
}

function hasUnknownWaiver(sourceCode: SourceCode, node: ESTree.Node): boolean {
	let current: ESTree.Node | null = node;
	while (current !== null) {
		const comment = sourceCode.getCommentsBefore(current).at(-1);
		if (
			comment !== undefined &&
			/^\s*FLOW_STATE_ALLOW_UNKNOWN\s*:/u.test(comment.value) &&
			isStandaloneComment(sourceCode, comment)
		) {
			const gap = sourceCode.getText().slice(comment.end, current.start);
			if (gap.trim() === "" && gap.includes("\n") && gap.split("\n").length <= 2) return true;
		}
		if (current.type === "Program") return false;
		current = current.parent;
	}
	return false;
}

function isAllowedByConfiguration(
	contextFilename: string,
	sourceCode: SourceCode,
	node: ESTree.TSUnknownKeyword,
	allowedSchemaFields: readonly FieldConfiguration[],
	allowedProperties: readonly FieldConfiguration[],
	allowedParameters: readonly FieldConfiguration[],
	cwd: string,
): boolean {
	const property = containingProperty(node, sourceCode);
	if (property !== null && matchesConfiguration(contextFilename, property, allowedProperties, cwd))
		return true;
	const parameter = containingParameter(node);
	if (
		parameter !== null &&
		matchesConfiguration(contextFilename, parameter, allowedParameters, cwd)
	)
		return true;
	return (
		property !== null &&
		isSchemaUnknown(sourceCode, node.parent) &&
		isSchemaStructField(sourceCode, node.parent) &&
		matchesConfiguration(contextFilename, property, allowedSchemaFields, cwd)
	);
}

/** Ban explicit unknown except at proven admission points or documented type-erasure machinery. */
export const noUnknownRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow explicit unknown except generic/conditional machinery, Schema decoder boundaries, catch bindings, " +
				"configured open schema fields, or documented erasure. Require Schema decoding for configured unknown " +
				"or any admission predicates.",
		},
		messages: {
			unknown:
				"This explicit unknown is outside the rule's recognized exceptions. Preserve the named type or generic relationship. External input may remain unknown at its boundary; decode it with Schema before downstream use. Document intentional erasure with FLOW_STATE_ALLOW_UNKNOWN:.",
			admission:
				"This configured admission implementation declares a type predicate for unknown or any input that is not tied to a recognized Schema-derived result. Use a Schema decoder or return a guard derived from the same Schema; this rule checks syntax and does not verify arbitrary schema/type equivalence.",
		},
		schema: [
			{
				type: "object",
				properties: {
					sourceRoots: { type: "array", items: { type: "string" } },
					admissionRoots: { type: "array", items: { type: "string" } },
					admissionFiles: { type: "array", items: { type: "string" } },
					reportAnyAdmissionPredicates: { type: "boolean" },
					allowedSchemaFields: {
						type: "array",
						items: {
							type: "object",
							properties: {
								file: { type: "string" },
								fields: { type: "array", items: { type: "string" } },
							},
							required: ["file", "fields"],
							additionalProperties: false,
						},
					},
					allowedProperties: {
						type: "array",
						items: {
							type: "object",
							properties: {
								file: { type: "string" },
								fields: { type: "array", items: { type: "string" } },
							},
							required: ["file", "fields"],
							additionalProperties: false,
						},
					},
					allowedParameters: {
						type: "array",
						items: {
							type: "object",
							properties: {
								file: { type: "string" },
								fields: { type: "array", items: { type: "string" } },
							},
							required: ["file", "fields"],
							additionalProperties: false,
						},
					},
				},
				additionalProperties: false,
			},
		],
		defaultOptions: [{}] satisfies RuleOptions,
	},
	createOnce(context) {
		let enabled = true;
		let admissionEnabled = false;
		let reportAnyAdmissionPredicates = true;
		let allowedSchemaFields: readonly FieldConfiguration[] = [];
		let allowedProperties: readonly FieldConfiguration[] = [];
		let allowedParameters: readonly FieldConfiguration[] = [];

		return {
			Program() {
				const option = context.options?.[0] as Partial<RuleOptions[0]> | undefined;
				const sourceRoots = option?.sourceRoots;
				enabled =
					!isExcludedSupportFile(context.filename) &&
					(sourceRoots === undefined ||
						(sourceRoots.length > 0 &&
							sourceRoots.some((root) => isPathWithin(context.filename, root, context.cwd))));
				admissionEnabled =
					enabled &&
					isAdmissionFile(
						context.filename,
						option?.admissionFiles ?? [],
						option?.admissionRoots ?? [],
						context.cwd,
					);
				reportAnyAdmissionPredicates = option?.reportAnyAdmissionPredicates !== false;
				allowedSchemaFields = option?.allowedSchemaFields ?? [];
				allowedProperties = option?.allowedProperties ?? [];
				allowedParameters = option?.allowedParameters ?? [];
			},
			TSUnknownKeyword(node: ESTree.TSUnknownKeyword) {
				if (!enabled) return;
				if (admissionEnabled) {
					const admission = admissionPredicateForType(context.sourceCode, node);
					if (
						admission !== null &&
						hasRuntimeBody(admission.function) &&
						!isSchemaDelegatedAdmission(context.sourceCode, admission)
					) {
						context.report({ node: admission.predicate, messageId: "admission" });
						return;
					}
				}
				if (
					isTypeParameterPosition(node) ||
					isConditionalCheckOrExtendsType(node) ||
					isErasedFunctionType(node) ||
					isInCatchParameter(node) ||
					isTypeGuardParameter(context.sourceCode, node) ||
					isDirectDecoderParameter(context.sourceCode, node) ||
					isSchemaBoundaryTypeArgument(context.sourceCode, node) ||
					hasUnknownWaiver(context.sourceCode, node) ||
					isAllowedByConfiguration(
						context.filename,
						context.sourceCode,
						node,
						allowedSchemaFields,
						allowedProperties,
						allowedParameters,
						context.cwd,
					)
				) {
					return;
				}
				context.report({ node, messageId: "unknown" });
			},
			TSAnyKeyword(node: ESTree.TSAnyKeyword) {
				if (!enabled || !admissionEnabled || !reportAnyAdmissionPredicates) return;
				const admission = admissionPredicateForType(context.sourceCode, node);
				if (
					admission !== null &&
					hasRuntimeBody(admission.function) &&
					!isSchemaDelegatedAdmission(context.sourceCode, admission)
				) {
					context.report({ node: admission.predicate, messageId: "admission" });
				}
			},
			MemberExpression(node: ESTree.MemberExpression) {
				if (!enabled || !isSchemaUnknown(context.sourceCode, node)) return;
				const property = containingProperty(node, context.sourceCode);
				if (
					property !== null &&
					isSchemaStructField(context.sourceCode, node) &&
					matchesConfiguration(context.filename, property, allowedSchemaFields, context.cwd)
				) {
					return;
				}
				if (hasUnknownWaiver(context.sourceCode, node)) return;
				context.report({ node, messageId: "unknown" });
			},
		};
	},
});
