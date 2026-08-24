import { defineRule } from "@oxlint/plugins";
import type { ESTree, SourceCode } from "@oxlint/plugins";

import { isImportedFromEffect } from "../shared/effect-import.ts";

type Parameter = ESTree.ParamPattern;
type ParameterOwner =
  | ESTree.ArrowFunctionExpression
  | ESTree.Function
  | ESTree.TSCallSignatureDeclaration
  | ESTree.TSConstructSignatureDeclaration
  | ESTree.TSConstructorType
  | ESTree.TSFunctionType
  | ESTree.TSMethodSignature;

function parameterAnnotation(parameter: Parameter): ESTree.TSTypeAnnotation | null | undefined {
  if (parameter.type === "TSParameterProperty") {
    return parameterAnnotation(parameter.parameter);
  }
  if (parameter.type === "RestElement") {
    return parameter.typeAnnotation ?? parameterAnnotation(parameter.argument);
  }
  if (parameter.type === "AssignmentPattern") {
    return parameter.typeAnnotation ?? parameter.left.typeAnnotation;
  }
  return parameter.typeAnnotation;
}

function parameterName(parameter: Parameter, sourceText: string): string {
  if (parameter.type === "TSParameterProperty") {
    return parameterName(parameter.parameter, sourceText);
  }
  if (parameter.type === "AssignmentPattern") {
    return parameterName(parameter.left, sourceText);
  }
  if (parameter.type === "RestElement") {
    return parameterName(parameter.argument, sourceText);
  }
  return parameter.type === "Identifier"
    ? parameter.name
    : sourceText.replace(/\s*:\s*unknown\s*$/u, "");
}

const decoderMethodNames = new Set(["decode", "decodeUnknown", "decodeUnknownSync", "parse", "safeParse"]);

function isDecoderCall(sourceCode: SourceCode, node: ESTree.CallExpression, parameter: string): boolean {
	if (!node.arguments.some((argument) => argument.type === "Identifier" && argument.name === parameter)) return false;
	let callee: ESTree.Expression = node.callee;
	while (callee.type === "CallExpression") callee = callee.callee;
	return (
		callee.type === "MemberExpression" &&
			!callee.computed &&
			callee.object.type === "Identifier" &&
			callee.object.name === "Schema" &&
			isImportedFromEffect(sourceCode, callee.object, new Set(["Schema"])) &&
			callee.property.type === "Identifier" &&
		decoderMethodNames.has(callee.property.name)
	);
}

function containsDecoderUse(sourceCode: SourceCode, node: ESTree.Node, parameter: string): boolean {
	if (node.type === "CallExpression" && isDecoderCall(sourceCode, node, parameter)) return true;
	for (const [key, value] of Object.entries(node)) {
		if (key === "parent" || key === "loc" || key === "range" || key === "tokens" || key === "comments") continue;
		if (Array.isArray(value)) {
			if (value.some((child) => child !== null && typeof child === "object" && "type" in child && containsDecoderUse(sourceCode, child as ESTree.Node, parameter))) return true;
		} else if (value !== null && typeof value === "object" && "type" in value && containsDecoderUse(sourceCode, value as ESTree.Node, parameter)) {
			return true;
		}
	}
	return false;
}

function isDecoderBoundary(sourceCode: SourceCode, node: ParameterOwner, parameter: Parameter, sourceText: string): boolean {
	if (!("body" in node) || node.body === null || node.body.type !== "BlockStatement") return false;
	return containsDecoderUse(sourceCode, node.body, parameterName(parameter, sourceText));
}

/** Disallow unknown inputs except error-cause enrichment and direct decoder boundaries. */
export const noUnknownParametersRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow explicitly unknown function parameters except `cause` and direct decoder boundaries.",
    },
    messages: {
      unknownParameter:
        "Parameter `{{parameter}}` leaves input unparsed. Accept a named domain type; run the expected schema or parser at the I/O boundary before calling this function.",
    },
  },
  createOnce(context) {
    const checkParameters = (node: ParameterOwner) => {
      for (const parameter of node.params) {
        const annotation = parameterAnnotation(parameter);
        if (annotation?.typeAnnotation.type !== "TSUnknownKeyword") continue;
        const name = parameterName(parameter, context.sourceCode.getText(parameter));
		if (name === "cause" || isDecoderBoundary(context.sourceCode, node, parameter, context.sourceCode.getText(parameter))) continue;
        context.report({
          node: annotation.typeAnnotation,
          messageId: "unknownParameter",
          data: { parameter: name },
        });
      }
    };

    return {
      ArrowFunctionExpression: checkParameters,
      FunctionDeclaration: checkParameters,
      FunctionExpression: checkParameters,
      TSCallSignatureDeclaration: checkParameters,
      TSConstructSignatureDeclaration: checkParameters,
      TSConstructorType: checkParameters,
      TSDeclareFunction: checkParameters,
      TSEmptyBodyFunctionExpression: checkParameters,
      TSFunctionType: checkParameters,
      TSMethodSignature: checkParameters,
    };
  },
});
