import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode } from "@oxlint/plugins";

import { isImportedFromEffect } from "../../shared/effect/effect-import.ts";
import { memberName, unwrapExpression } from "../../shared/effect/effect-call.ts";
import { isTestSupportFile, normalizedFilename } from "../../shared/file-scope.ts";
import { isPathWithin } from "../../shared/module-path.ts";

type FieldConfiguration = { readonly file: string; readonly fields: readonly string[] };
type RuleOptions = [
	{
		readonly sourceRoots?: readonly string[];
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
				(current.constraint !== null && current.constraint !== undefined && isWithin(node, current.constraint)) ||
				(current.default !== null && current.default !== undefined && isWithin(node, current.default))
			);
		}
		if (current.type === "Program") return false;
		current = current.parent;
	}
	return false;
}

function isSchemaBoundaryTypeArgument(sourceCode: SourceCode, node: ESTree.TSUnknownKeyword): boolean {
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
			if (current.params.some((parameter) => parameter.type === "RestElement" && isWithin(node, parameter))) {
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

function isDecoderCall(sourceCode: SourceCode, node: ESTree.CallExpression, parameter: string): boolean {
	if (!node.arguments.some((argument) => argument.type === "Identifier" && argument.name === parameter)) {
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

function containsDecoderCall(sourceCode: SourceCode, node: ESTree.Node, parameter: string): boolean {
	if (node.type === "CallExpression" && isDecoderCall(sourceCode, node, parameter)) return true;
	for (const [key, value] of Object.entries(node)) {
		if (key === "parent" || key === "loc" || key === "range" || key === "tokens" || key === "comments") continue;
		if (Array.isArray(value)) {
			if (value.some((child) => isNode(child) && containsDecoderCall(sourceCode, child, parameter))) return true;
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
			return (
				identifier !== null &&
				body !== null &&
				containsDecoderCall(sourceCode, body, identifier.name)
			);
		}
		if (current.type === "Program") return false;
		current = current.parent;
	}
	return false;
}

function isTypeGuardParameter(node: ESTree.TSUnknownKeyword): boolean {
	let current: ESTree.Node | null = node.parent;
	while (current !== null) {
		if (
			current.type === "ArrowFunctionExpression" ||
			current.type === "FunctionDeclaration" ||
			current.type === "FunctionExpression"
		) {
			const parameter = current.params.find((candidate) => isWithin(node, candidate));
			const identifier = parameter === undefined ? null : parameterIdentifier(parameter);
			const returnType = current.returnType?.typeAnnotation;
			return (
				identifier !== null &&
				returnType?.type === "TSTypePredicate" &&
				returnType.parameterName.type === "Identifier" &&
				returnType.parameterName.name === identifier.name
			);
		}
		if (current.type === "Program") return false;
		current = current.parent;
	}
	return false;
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

function containingProperty(node: ESTree.Node, sourceCode: SourceCode): { readonly name: string; readonly node: ESTree.Node } | null {
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

function matchesFile(filename: string, configuredFile: string): boolean {
	const normalized = normalizedFilename(filename);
	const relative = normalizedFilename(configuredFile).replace(/^\/+|\/+$/gu, "");
	return normalized === `/${relative}` || normalized.endsWith(`/${relative}`);
}

function isExcludedSupportFile(filename: string): boolean {
	const normalized = normalizedFilename(filename);
	return isTestSupportFile(filename) || normalized.endsWith(".compile.ts");
}

function matchesConfiguration(
	filename: string,
	property: { readonly name: string },
	configurations: readonly FieldConfiguration[],
): boolean {
	return configurations.some(
		(configuration) =>
			configuration.fields.includes(property.name) && matchesFile(filename, configuration.file),
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

function isStandaloneComment(sourceCode: SourceCode, comment: { readonly start: number; readonly end: number }): boolean {
	const text = sourceCode.getText();
	const lineStart = Math.max(text.lastIndexOf("\n", comment.start - 1) + 1, 0);
	const lineEndIndex = text.indexOf("\n", comment.end);
	const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex;
	return text.slice(lineStart, comment.start).trim() === "" && text.slice(comment.end, lineEnd).trim() === "";
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
): boolean {
	const property = containingProperty(node, sourceCode);
	if (property !== null && matchesConfiguration(contextFilename, property, allowedProperties)) return true;
	const parameter = containingParameter(node);
	if (parameter !== null && matchesConfiguration(contextFilename, parameter, allowedParameters)) return true;
	return (
		property !== null &&
		isSchemaUnknown(sourceCode, node.parent) &&
		isSchemaStructField(sourceCode, node.parent) &&
		matchesConfiguration(contextFilename, property, allowedSchemaFields)
	);
}

/** Ban explicit unknown except at proven admission points or documented type-erasure machinery. */
export const noUnknownRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow explicit unknown unless it is generic/conditional type machinery, a direct Schema decoder boundary, a catch binding, a configured open schema field, or an adjacent documented erasure.",
		},
		messages: {
			unknown:
				"This `unknown` loses an application contract. Use a named type or generic, decode at the boundary, or document intentional erasure with `FLOW_STATE_ALLOW_UNKNOWN:`.",
		},
		schema: [
			{
				type: "object",
				properties: {
					sourceRoots: { type: "array", items: { type: "string" } },
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
						(sourceRoots.length > 0 && sourceRoots.some((root) => isPathWithin(context.filename, root))));
					allowedSchemaFields = option?.allowedSchemaFields ?? [];
					allowedProperties = option?.allowedProperties ?? [];
					allowedParameters = option?.allowedParameters ?? [];
			},
			TSUnknownKeyword(node: ESTree.TSUnknownKeyword) {
				if (!enabled) return;
				if (
					isTypeParameterPosition(node) ||
					isConditionalCheckOrExtendsType(node) ||
					isErasedFunctionType(node) ||
					isInCatchParameter(node) ||
					isTypeGuardParameter(node) ||
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
					)
				) {
					return;
				}
				context.report({ node, messageId: "unknown" });
			},
			MemberExpression(node: ESTree.MemberExpression) {
				if (!enabled || !isSchemaUnknown(context.sourceCode, node)) return;
				const property = containingProperty(node, context.sourceCode);
				if (
					property !== null &&
					isSchemaStructField(context.sourceCode, node) &&
					matchesConfiguration(context.filename, property, allowedSchemaFields)
				) {
					return;
				}
				if (hasUnknownWaiver(context.sourceCode, node)) return;
				context.report({ node, messageId: "unknown" });
			},
		};
	},
});
