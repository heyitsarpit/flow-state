import { defineRule } from "@oxlint/plugins";

import { resolveVariable } from "../../shared/scope.ts";
import { isShadowedByTypeParameter } from "../../shared/dictionary-types.ts";

import type { ESTree, SourceCode, Variable } from "@oxlint/plugins";

import { boundaryOptionsSchema, isEffectHostBoundaryFile } from "../../shared/file-scope.ts";
import type { BoundaryOptions } from "../../shared/file-scope.ts";

const unsafeMethodNames = new Set(["interruptUnsafe", "pollUnsafe"]);

type TypeEnvironment = Readonly<{
  sourceCode: SourceCode;
  fiberImports: ReadonlySet<ESTree.Node>;
}>;

function createTypeEnvironment(program: ESTree.Program, sourceCode: SourceCode): TypeEnvironment {
  const fiberImports = new Set<ESTree.Node>();

  for (const statement of program.body) {
    if (
      statement.type === "ImportDeclaration" &&
      (statement.source.value === "effect" || statement.source.value.startsWith("effect/"))
    ) {
      for (const specifier of statement.specifiers) {
        if (specifier.type === "ImportNamespaceSpecifier") {
          fiberImports.add(specifier);
          continue;
        }
        if (
          specifier.type === "ImportSpecifier" &&
          (specifier.imported.type === "Identifier"
            ? specifier.imported.name
            : specifier.imported.value) === "Fiber"
        ) {
          fiberImports.add(specifier);
        }
      }
      continue;
    }
  }

  return { fiberImports, sourceCode };
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
  if (isShadowedByTypeParameter(type.typeName.name, type)) return type;
  const binding = resolveVariable(environment.sourceCode, type.typeName);
  const definition = binding?.defs.find((entry) => entry.node.type === "TSTypeAliasDeclaration");
  const alias =
    definition?.node.type === "TSTypeAliasDeclaration" ? definition.node.typeAnnotation : undefined;
  if (alias === undefined || seen.has(type.typeName.name)) return type;
  return unwrapType(alias, environment, new Set([...seen, type.typeName.name]));
}

function isFiberImport(identifier: ESTree.IdentifierReference, environment: TypeEnvironment): boolean {
  if (isShadowedByTypeParameter(identifier.name, identifier)) return false;
  const binding = resolveVariable(environment.sourceCode, identifier);
  return binding?.defs.some((definition) => environment.fiberImports.has(definition.node)) ?? false;
}

function isFiberType(type: ESTree.TSType, environment: TypeEnvironment): boolean {
  const resolved = unwrapType(type, environment);
  if (resolved.type !== "TSTypeReference") return false;
  if (resolved.typeName.type === "Identifier") {
    return isFiberImport(resolved.typeName, environment);
  }
  if (resolved.typeName.type !== "TSQualifiedName") return false;
  if (
    resolved.typeName.left.type === "TSQualifiedName" &&
    resolved.typeName.left.left.type === "Identifier" &&
    isFiberImport(resolved.typeName.left.left, environment) &&
    resolved.typeName.left.right.type === "Identifier" &&
    resolved.typeName.left.right.name === "Fiber" &&
    resolved.typeName.right.type === "Identifier" &&
    resolved.typeName.right.name === "Fiber"
  ) {
    return true;
  }
  return (
    resolved.typeName.left.type === "Identifier" &&
    isFiberImport(resolved.typeName.left, environment) &&
    resolved.typeName.right.type === "Identifier" &&
    resolved.typeName.right.name === "Fiber"
  );
}

function propertyType(
  type: ESTree.TSType | ESTree.TSInterfaceHeritage,
  propertyName: string,
  environment: TypeEnvironment,
  seen = new Set<ESTree.Node>(),
): ESTree.TSType | null {
  if (type.type === "TSInterfaceHeritage") {
    if (type.expression.type !== "Identifier") return null;
    if (isShadowedByTypeParameter(type.expression.name, type)) return null;
    const binding = resolveVariable(environment.sourceCode, type.expression);
    const definition = binding?.defs.find((entry) => entry.node.type === "TSInterfaceDeclaration");
    if (definition?.node.type !== "TSInterfaceDeclaration") return null;
    const declaration = definition.node;
    if (seen.has(declaration)) return null;
    const nextSeen = new Set([...seen, declaration]);
    for (const member of declaration.body.body) {
      if (
        member.type === "TSPropertySignature" &&
        !member.computed &&
        member.key.type === "Identifier" &&
        member.key.name === propertyName &&
        member.typeAnnotation !== null
      )
        return member.typeAnnotation.typeAnnotation;
    }
    for (const parent of declaration.extends) {
      const result = propertyType(parent, propertyName, environment, nextSeen);
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
      if (
        member.type === "TSPropertySignature" &&
        memberName === propertyName &&
        member.typeAnnotation !== null
      ) {
        return member.typeAnnotation.typeAnnotation;
      }
    }
    return null;
  }
  if (resolved.type !== "TSTypeReference" || resolved.typeName.type !== "Identifier") return null;
  const name = resolved.typeName.name;
  if (isShadowedByTypeParameter(name, resolved)) return null;
  const binding = resolveVariable(environment.sourceCode, resolved.typeName);
  const typeDefinition = binding?.defs.find(
    (entry) => entry.node.type === "TSInterfaceDeclaration",
  );
  if (typeDefinition?.node.type !== "TSInterfaceDeclaration") return null;
  const declaration = typeDefinition.node;
  if (seen.has(declaration)) return null;
  const nextSeen = new Set([...seen, declaration]);
  for (const member of declaration.body.body) {
    if (member.type !== "TSPropertySignature") continue;
    const memberName =
      !member.computed && member.key.type === "Identifier"
        ? member.key.name
        : member.computed && member.key.type === "Literal" && typeof member.key.value === "string"
          ? member.key.value
          : null;
    if (memberName === propertyName && member.typeAnnotation !== null)
      return member.typeAnnotation.typeAnnotation;
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
      ["Array", "ReadonlyArray", "ReadonlySet", "Set"].includes(resolvedCollection.typeName.name) &&
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
  return ownerType === null ? null : propertyType(ownerType, propertyName, environment);
}

/** Keep Effect Fiber unsafe runtime hooks inside explicit host/runtime owners. */
export const noUnsafeFiberMethodsRule = defineRule({
  meta: {
    schema: boundaryOptionsSchema,
    type: "problem",
    docs: {
      description:
        "Disallow direct calls to Effect Fiber unsafe methods outside explicit runtime boundaries.",
    },
    messages: {
      unsafeFiberMethod:
        "Fiber.{{method}} is a runtime hook. Use Fiber.await or Fiber.join to wait, and Fiber.interrupt to cancel. Keep required nonblocking runtime inspection at the configured host boundary; waiting is not equivalent to polling.",
    },
  },
  createOnce(context) {
    let allowedBoundary = false;
    let environment: TypeEnvironment | null = null;

    return {
      Program(node: ESTree.Program) {
        allowedBoundary = isEffectHostBoundaryFile(
          context.filename,
          context.options[0] as BoundaryOptions | undefined,
          context.cwd,
        );
        environment = createTypeEnvironment(node, context.sourceCode);
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
