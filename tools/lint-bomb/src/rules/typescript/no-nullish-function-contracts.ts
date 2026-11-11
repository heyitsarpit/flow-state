import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { lexicalTypeParameterNames } from "../../shared/lexical-type-parameters.ts";
import {
  createTypeEnvironment,
  resolveTypeAlias,
  type TypeEnvironment,
} from "../../shared/dictionary-types.ts";

type Parameter = ESTree.ParamPattern;
type FunctionWithContract =
  | ESTree.ArrowFunctionExpression
  | ESTree.Function
  | ESTree.TSCallSignatureDeclaration
  | ESTree.TSConstructSignatureDeclaration
  | ESTree.TSConstructorType
  | ESTree.TSFunctionType
  | ESTree.TSMethodSignature;

type TypeSubstitution = {
  readonly type: ESTree.TSType;
  readonly substitutions: ReadonlyMap<ESTree.TSTypeParameter, TypeSubstitution>;
};

function parameterAnnotation(parameter: Parameter): ESTree.TSTypeAnnotation | null | undefined {
  if (parameter.type === "TSParameterProperty") return parameterAnnotation(parameter.parameter);
  if (parameter.type === "RestElement") {
    return parameter.typeAnnotation ?? parameterAnnotation(parameter.argument);
  }
  if (parameter.type === "AssignmentPattern") {
    return parameter.typeAnnotation ?? parameter.left.typeAnnotation;
  }
  return parameter.typeAnnotation;
}

function parameterName(parameter: Parameter, sourceText: string): string {
  if (parameter.type === "TSParameterProperty")
    return parameterName(parameter.parameter, sourceText);
  if (parameter.type === "AssignmentPattern") return parameterName(parameter.left, sourceText);
  if (parameter.type === "RestElement") return parameterName(parameter.argument, sourceText);
  return parameter.type === "Identifier" ? parameter.name : sourceText;
}

function isOptionalParameter(parameter: Parameter): boolean {
  if (parameter.type === "TSParameterProperty") return isOptionalParameter(parameter.parameter);
  if (parameter.type === "AssignmentPattern") return false;
  return "optional" in parameter && parameter.optional === true;
}

function typeReferenceName(type: ESTree.TSTypeReference): string | null {
  if (type.typeName.type === "Identifier") return type.typeName.name;
  return null;
}

function typeParameterForReference(type: ESTree.TSTypeReference): ESTree.TSTypeParameter | null {
  if (type.typeName.type !== "Identifier") return null;
  const name = type.typeName.name;
  let current: ESTree.Node | null = type.parent;
  while (current !== null) {
    if ("typeParameters" in current) {
      const parameter = current.typeParameters?.params.find((item) => item.name.name === name);
      if (parameter !== undefined) return parameter;
    }
    current = current.parent;
  }
  return null;
}

function containsNullishTupleElement(
  element: ESTree.TSTupleElement,
  containsNullish: (type: ESTree.TSType) => boolean,
): boolean {
  if (element.type === "TSOptionalType") return true;
  if (element.type === "TSRestType") return containsNullish(element.typeAnnotation);
  if (element.type === "TSNamedTupleMember") {
    return element.optional || containsNullishTupleElement(element.elementType, containsNullish);
  }
  return containsNullish(element);
}

/** Disallow hidden absence in function inputs and outputs. */
export const noNullishFunctionContractsRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow optional parameters and explicitly nullish function contracts; allow default parameters and use Option for meaningful absence.",
    },
    messages: {
      nullishContract:
        "Function contract `{{name}}` includes an optional parameter or explicitly nullish type. Use Option for meaningful absence, Result for pure rejection, or Effect's E channel for execution failure. Intentional default parameters are allowed; explicit nullish annotations remain subject to this rule.",
    },
  },
  createOnce(context) {
    let environment: TypeEnvironment | null = null;

    const containsNullish = (
      type: ESTree.TSType,
      substitutions: ReadonlyMap<ESTree.TSTypeParameter, TypeSubstitution> = new Map(),
      visitedAliases = new Set<ESTree.TSTypeAliasDeclaration>(),
      visitedTypes = new Set<ESTree.TSType>(),
    ): boolean => {
      if (visitedTypes.has(type)) return false;
      const nextVisitedTypes = new Set(visitedTypes);
      nextVisitedTypes.add(type);
      if (type.type === "TSNullKeyword" || type.type === "TSUndefinedKeyword") return true;
      if (type.type === "TSParenthesizedType") {
        return containsNullish(
          type.typeAnnotation,
          substitutions,
          visitedAliases,
          nextVisitedTypes,
        );
      }
      if (type.type === "TSUnionType" || type.type === "TSIntersectionType") {
        return type.types.some((member) =>
          containsNullish(member, substitutions, visitedAliases, nextVisitedTypes),
        );
      }
      if (type.type === "TSConditionalType") {
        return (
          containsNullish(
            type.trueType,
            substitutions,
            visitedAliases,
            nextVisitedTypes,
          ) ||
          containsNullish(
            type.falseType,
            substitutions,
            visitedAliases,
            nextVisitedTypes,
          )
        );
      }
      if (type.type === "TSArrayType") {
        return containsNullish(
          type.elementType,
          substitutions,
          visitedAliases,
          nextVisitedTypes,
        );
      }
      if (type.type === "TSTupleType") {
        return type.elementTypes.some((element) =>
          containsNullishTupleElement(element, (elementType) =>
            containsNullish(
              elementType,
              substitutions,
              visitedAliases,
              nextVisitedTypes,
            ),
          ),
        );
      }
      if (type.type !== "TSTypeReference") return false;

      const name = typeReferenceName(type);
      if (name === null) return false;
      const parameter = typeParameterForReference(type);
      const substitution = parameter === null ? undefined : substitutions.get(parameter);
      if (substitution !== undefined) {
        return containsNullish(
          substitution.type,
          substitution.substitutions,
          visitedAliases,
          nextVisitedTypes,
        );
      }

      if (!lexicalTypeParameterNames(type, context.sourceCode.visitorKeys).has(name) && environment !== null) {
        const alias = resolveTypeAlias(type, environment);
        if (alias !== null && !visitedAliases.has(alias)) {
          const nextSubstitutions = new Map(substitutions);
          for (const [index, parameter] of (alias.typeParameters?.params ?? []).entries()) {
            const supplied = type.typeArguments?.params[index];
            const argument = supplied ?? parameter.default;
            if (argument !== null && argument !== undefined) {
              nextSubstitutions.set(parameter, {
                type: argument,
                substitutions: supplied === undefined ? new Map(nextSubstitutions) : substitutions,
              });
            }
          }
          return containsNullish(
            alias.typeAnnotation,
            nextSubstitutions,
            new Set([...visitedAliases, alias]),
            nextVisitedTypes,
          );
        }
      }

      // Inspect type arguments so Promise<T | undefined>, Effect<T | null, ...>,
      // and named containers cannot hide the nullish contract.
      return (
        type.typeArguments?.params.some((argument) =>
          containsNullish(
            argument,
            substitutions,
            visitedAliases,
            nextVisitedTypes,
          ),
        ) ?? false
      );
    };

    const report = (node: ESTree.Node, name: string) => {
      context.report({ node, messageId: "nullishContract", data: { name } });
    };

    const checkFunction = (node: FunctionWithContract) => {
      for (const parameter of node.params) {
        if (isOptionalParameter(parameter)) {
          report(parameter, parameterName(parameter, context.sourceCode.getText(parameter)));
          continue;
        }
        const annotation = parameterAnnotation(parameter);
        if (
          annotation !== null &&
          annotation !== undefined &&
          containsNullish(annotation.typeAnnotation)
        ) {
          report(parameter, parameterName(parameter, context.sourceCode.getText(parameter)));
        }
      }

      const returnType = node.returnType;
      if (
        returnType !== null &&
        returnType !== undefined &&
        containsNullish(returnType.typeAnnotation)
      ) {
        report(returnType.typeAnnotation, "return");
      }
    };

    return {
      Program(node) {
        environment = createTypeEnvironment(node);
      },
      ArrowFunctionExpression: checkFunction,
      FunctionDeclaration: checkFunction,
      FunctionExpression: checkFunction,
      TSCallSignatureDeclaration: checkFunction,
      TSConstructSignatureDeclaration: checkFunction,
      TSConstructorType: checkFunction,
      TSDeclareFunction: checkFunction,
      TSEmptyBodyFunctionExpression: checkFunction,
      TSFunctionType: checkFunction,
      TSMethodSignature: checkFunction,
    };
  },
});
