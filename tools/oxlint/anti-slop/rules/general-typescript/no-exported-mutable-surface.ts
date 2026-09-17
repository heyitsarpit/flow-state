import { defineRule } from "@oxlint/plugins";

import type { ESTree, Scope, SourceCode, Variable } from "@oxlint/plugins";

import { isTestSupportFile } from "../../shared/file-scope.ts";
import { isPathWithin } from "../../shared/module-path.ts";

type RuleOptions = [{ sourceRoots?: string[] }];

const defaultSourceRoots = ["packages/flow-state/src", "packages/flow-state-rewrite/src"] as const;
const mutableCollectionNames = new Set(["Map", "Set"]);
const globalObjectNames = new Set(["global", "globalThis", "self", "window"]);
type IdentifierNode = Extract<ESTree.Node, { type: "Identifier" }>;

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

function resolveVariable(sourceCode: SourceCode, identifier: IdentifierNode): Variable | null {
  let scope: Scope | null = sourceCode.getScope(identifier);
  while (scope !== null) {
    const variable = scope.set.get(identifier.name);
    if (variable !== undefined) return variable;
    scope = scope.upper;
  }
  return null;
}

function isGlobalReference(sourceCode: SourceCode, identifier: IdentifierNode): boolean {
  const variable = resolveVariable(sourceCode, identifier);
  return variable === null || variable.defs.length === 0;
}

function isGlobalObjectExpression(
  sourceCode: SourceCode,
  expression: ESTree.Expression,
  seen: ReadonlySet<Variable> = new Set<Variable>(),
): boolean {
  const value = unwrapExpression(expression);
  if (value.type !== "Identifier") return false;
  if (globalObjectNames.has(value.name) && isGlobalReference(sourceCode, value)) return true;
  const variable = resolveVariable(sourceCode, value);
  if (variable === null || seen.has(variable)) return false;
  const current = variableValues(sourceCode, variable, value.start, seen).at(-1);
  if (current !== undefined)
    return isGlobalObjectExpression(sourceCode, current, new Set(seen).add(variable));
  return false;
}

function isFunctionOrClassValue(
  sourceCode: SourceCode,
  expression: ESTree.Expression,
  seen: ReadonlySet<Variable> = new Set<Variable>(),
): boolean {
  const value = unwrapExpression(expression);
  if (
    value.type === "ArrowFunctionExpression" ||
    value.type === "FunctionExpression" ||
    value.type === "ClassExpression"
  ) {
    return true;
  }
  if (value.type !== "Identifier") return false;
  const variable = resolveVariable(sourceCode, value);
  if (variable === null || seen.has(variable) || variable.defs.length !== 1) return false;
  const nextSeen = new Set(seen).add(variable);
  const current = variableValues(sourceCode, variable, value.start, seen).at(-1);
  if (current !== undefined) return isFunctionOrClassValue(sourceCode, current, nextSeen);
  const definition = variable.defs[0];
  if (
    definition?.type === "Variable" &&
    definition.node.type === "VariableDeclarator" &&
    definition.node.init !== null
  ) {
    return isFunctionOrClassValue(sourceCode, definition.node.init, nextSeen);
  }
  return (
    (definition?.type === "FunctionName" && definition.node.type === "FunctionDeclaration") ||
    (definition?.type === "ClassName" && definition.node.type === "ClassDeclaration")
  );
}

function isOperationNamespace(sourceCode: SourceCode, node: ESTree.ObjectExpression): boolean {
  return (
    node.properties.length > 0 &&
    node.properties.every((property) => {
      if (property.type !== "Property" || property.kind !== "init") return false;
      return property.method || isFunctionOrClassValue(sourceCode, property.value);
    })
  );
}

function mutableCollectionConstructor(
  sourceCode: SourceCode,
  node: ESTree.Expression,
  seen: ReadonlySet<Variable> = new Set<Variable>(),
): "map" | "set" | null {
  const value = unwrapExpression(node);
  if (
    value.type === "Identifier" &&
    isGlobalReference(sourceCode, value) &&
    mutableCollectionNames.has(value.name)
  ) {
    return value.name === "Map" ? "map" : "set";
  }
  if (value.type === "MemberExpression") {
    const name =
      !value.computed && value.property.type === "Identifier"
        ? value.property.name
        : value.computed && value.property.type === "Literal" && typeof value.property.value === "string"
          ? value.property.value
          : null;
    if (
      (name === "Map" || name === "Set") &&
      isGlobalObjectExpression(sourceCode, value.object as ESTree.Expression)
    )
      return name === "Map" ? "map" : "set";
  }
  if (value.type === "ConditionalExpression" || value.type === "LogicalExpression") {
    const left = mutableCollectionConstructor(
      sourceCode,
      value.type === "ConditionalExpression" ? value.consequent : value.left,
      seen,
    );
    return (
      left ??
      mutableCollectionConstructor(
        sourceCode,
        value.type === "ConditionalExpression" ? value.alternate : value.right,
        seen,
      )
    );
  }
  if (value.type !== "Identifier") return null;
  const variable = resolveVariable(sourceCode, value);
  if (variable === null || seen.has(variable)) return null;
  const nextSeen = new Set(seen).add(variable);
  const values = variableValues(sourceCode, variable, value.start, seen);
  const writes = variable.references.filter(
    (reference) =>
      reference.isWrite() &&
      !reference.init &&
      reference.identifier.start <= value.start &&
      reference.writeExpr !== null,
  );
  const lastWrite = writes.at(-1);
  if (lastWrite !== undefined && isConditionalWrite(lastWrite.identifier)) {
    for (const candidate of values) {
      const kind = mutableCollectionConstructor(sourceCode, candidate, nextSeen);
      if (kind !== null) return kind;
    }
    return null;
  }
  const current = values.at(-1);
  return current === undefined ? null : mutableCollectionConstructor(sourceCode, current, nextSeen);
}

function isConditionalWrite(identifier: ESTree.Node): boolean {
  let parent: ESTree.Node | null = identifier.parent;
  while (
    parent !== null &&
    parent.type !== "Program" &&
    parent.type !== "FunctionDeclaration" &&
    parent.type !== "FunctionExpression" &&
    parent.type !== "ArrowFunctionExpression"
  ) {
    if (
      parent.type === "IfStatement" ||
      parent.type === "ConditionalExpression" ||
      parent.type === "LogicalExpression" ||
      parent.type === "SwitchStatement"
    )
      return true;
    parent = parent.parent;
  }
  return false;
}

type BindingPath = ReadonlyArray<
  | { readonly kind: "property"; readonly name: string }
  | { readonly kind: "element"; readonly index: number }
>;

function propertyName(node: ESTree.Node): string | null {
  if (node.type !== "Property") return null;
  if (!node.computed && node.key.type === "Identifier") return node.key.name;
  return node.computed && node.key.type === "Literal" && typeof node.key.value === "string"
    ? node.key.value
    : null;
}

function bindingPath(node: ESTree.Node, name: string, path: BindingPath = []): BindingPath | null {
  if (node.type === "Identifier") return node.name === name ? path : null;
  if (node.type === "AssignmentPattern") return bindingPath(node.left, name, path);
  if (node.type === "RestElement") return null;
  if (node.type === "ObjectPattern") {
    for (const property of node.properties) {
      if (property.type !== "Property") continue;
      const nameForProperty = propertyName(property);
      if (nameForProperty === null) continue;
      const result = bindingPath(property.value, name, [
        ...path,
        { kind: "property", name: nameForProperty },
      ]);
      if (result !== null) return result;
    }
  }
  if (node.type === "ArrayPattern") {
    for (const [index, element] of node.elements.entries()) {
      if (element === null || element.type === "RestElement") continue;
      const result = bindingPath(element, name, [...path, { kind: "element", index }]);
      if (result !== null) return result;
    }
  }
  return null;
}

function isMutableCollectionExpression(
  sourceCode: SourceCode,
  node: ESTree.Expression,
  seen: ReadonlySet<Variable> = new Set<Variable>(),
): boolean {
  const value = unwrapExpression(node);
  if (value.type === "NewExpression")
    return mutableCollectionConstructor(sourceCode, value.callee as ESTree.Expression) !== null;
  if (value.type !== "Identifier") return false;
  const variable = resolveVariable(sourceCode, value);
  if (variable === null || seen.has(variable)) return false;
  const nextSeen = new Set(seen).add(variable);
  const current = variableValues(sourceCode, variable, value.start, seen).at(-1);
  return current !== undefined && isMutableCollectionExpression(sourceCode, current, nextSeen);
}

function isFrozenMutableCollection(sourceCode: SourceCode, node: ESTree.CallExpression): boolean {
  if (
    node.callee.type !== "MemberExpression" ||
    node.callee.object.type !== "Identifier" ||
    node.callee.object.name !== "Object" ||
    !isGlobalReference(sourceCode, node.callee.object) ||
    node.callee.property.type !== "Identifier" ||
    node.callee.property.name !== "freeze"
  ) {
    return false;
  }
  const argument = node.arguments[0];
  return (
    argument !== undefined &&
    argument.type !== "SpreadElement" &&
    isMutableCollectionExpression(sourceCode, argument)
  );
}

function bindingValues(
  sourceCode: SourceCode,
  node: ESTree.Expression,
  path: BindingPath,
  at: number,
  seen: ReadonlySet<Variable>,
): ESTree.Expression[] {
  if (path.length === 0) return [node];
  const value = unwrapExpression(node);
  const [head, ...tail] = path;
  if (value.type === "ConditionalExpression") {
    return [
      ...bindingValues(sourceCode, value.consequent, path, at, seen),
      ...bindingValues(sourceCode, value.alternate, path, at, seen),
    ];
  }
  if (value.type === "LogicalExpression") {
    return [
      ...bindingValues(sourceCode, value.left, path, at, seen),
      ...bindingValues(sourceCode, value.right, path, at, seen),
    ];
  }
  if (value.type === "SequenceExpression") {
    const last = value.expressions.at(-1);
    return last === undefined ? [] : bindingValues(sourceCode, last, path, at, seen);
  }
  if (head?.kind === "property" && value.type === "ObjectExpression") {
    for (const property of [...value.properties].reverse()) {
      if (property.type === "Property" && propertyName(property) === head.name) {
        return bindingValues(sourceCode, property.value, tail, at, seen);
      }
    }
    return [];
  }
  if (head?.kind === "element" && value.type === "ArrayExpression") {
    const element = value.elements[head.index];
    return element === undefined || element === null || element.type === "SpreadElement"
      ? []
      : bindingValues(sourceCode, element, tail, at, seen);
  }
  if (value.type !== "Identifier") return [];
  const variable = resolveVariable(sourceCode, value);
  if (variable === null || seen.has(variable)) return [];
  const nextSeen = new Set(seen).add(variable);
  return variableValues(sourceCode, variable, value.start, seen).flatMap((current) =>
    bindingValues(sourceCode, current, path, at, nextSeen),
  );
}

function variableValues(
  sourceCode: SourceCode,
  variable: Variable,
  at: number,
  seen: ReadonlySet<Variable>,
): ESTree.Expression[] {
  if (seen.has(variable)) return [];
  const nextSeen = new Set(seen).add(variable);
  const values: ESTree.Expression[] = [];
  for (const definition of variable.defs) {
    if (definition.type !== "Variable" || definition.node.type !== "VariableDeclarator") continue;
    if (definition.node.start > at || definition.node.init === null) continue;
    if (definition.node.id.type === "Identifier") values.push(definition.node.init);
    else {
      const path = bindingPath(definition.node.id, variable.name);
      if (path !== null)
        values.push(...bindingValues(sourceCode, definition.node.init, path, at, nextSeen));
    }
  }
  for (const reference of variable.references) {
    if (
      reference.isWrite() &&
      !reference.init &&
      reference.identifier.start <= at &&
      reference.writeExpr !== null
    ) {
      values.push(reference.writeExpr);
    }
  }
  return values;
}

function isMutableSurface(
  sourceCode: SourceCode,
  node: ESTree.Node,
  seen: ReadonlySet<Variable> = new Set<Variable>(),
  at: number = node.start,
): boolean {
  if (
    node.type === "ParenthesizedExpression" ||
    node.type === "TSAsExpression" ||
    node.type === "TSSatisfiesExpression" ||
    node.type === "TSTypeAssertion" ||
    node.type === "TSNonNullExpression" ||
    node.type === "TSInstantiationExpression"
  ) {
    return isMutableSurface(sourceCode, node.expression, seen, at);
  }
  if (node.type === "ObjectExpression") return !isOperationNamespace(sourceCode, node);
  if (node.type === "ArrayExpression") return true;
  if (node.type === "NewExpression" && isMutableCollectionExpression(sourceCode, node)) return true;
  if (node.type === "CallExpression" && isFrozenMutableCollection(sourceCode, node)) return true;
  if (node.type === "ConditionalExpression") {
    return (
      isMutableSurface(sourceCode, node.consequent, seen, at) ||
      isMutableSurface(sourceCode, node.alternate, seen, at)
    );
  }
  if (node.type === "LogicalExpression") {
    return (
      isMutableSurface(sourceCode, node.left, seen, at) ||
      isMutableSurface(sourceCode, node.right, seen, at)
    );
  }
  if (node.type === "SequenceExpression") {
    const last = node.expressions.at(-1);
    return last !== undefined && isMutableSurface(sourceCode, last, seen, at);
  }
  if (node.type === "Identifier") {
    const variable = resolveVariable(sourceCode, node);
    if (variable === null || seen.has(variable)) return false;
    const nextSeen = new Set(seen).add(variable);
    return variableValues(sourceCode, variable, at, seen).some((value) =>
      isMutableSurface(sourceCode, value, nextSeen, value.start),
    );
  }
  return false;
}

/** Keep mutable object and array storage behind its owner instead of exposing a writable handle. */
export const noExportedMutableSurfaceRule = defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow directly exported mutable object and array storage. Public mutation should remain behind its owning service or factory.",
    },
    messages: {
      exportedMutableSurface:
        "Do not export mutable object or array storage directly. Expose operations or a read-only snapshot, and keep mutation behind the owning service or factory.",
    },
    schema: [
      {
        type: "object",
        properties: {
          sourceRoots: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ sourceRoots: [...defaultSourceRoots] }] satisfies RuleOptions,
  },
  createOnce(context) {
    const report = (node: ESTree.Node) =>
      context.report({ node, messageId: "exportedMutableSurface" });
    const exportedVariables = new Set<Variable>();
    const reportedVariables = new Set<Variable>();
    let sourceFile = false;

    return {
      Program(node: ESTree.Program) {
        const option = context.options?.[0];
        const rawSourceRoots =
          typeof option === "object" && option !== null && !Array.isArray(option)
            ? option.sourceRoots
            : undefined;
        const sourceRoots =
          Array.isArray(rawSourceRoots) &&
          rawSourceRoots.every((root): root is string => typeof root === "string")
            ? rawSourceRoots
            : defaultSourceRoots;
        sourceFile =
          sourceRoots.some((root) => isPathWithin(context.filename, root)) &&
          !isTestSupportFile(context.filename);
        if (!sourceFile) return;
        for (const statement of node.body) {
          if (statement.type === "ExportNamedDeclaration") {
            if (statement.declaration?.type === "VariableDeclaration") {
              for (const declarator of statement.declaration.declarations) {
                if (declarator.id.type === "Identifier") {
                  const variable = resolveVariable(context.sourceCode, declarator.id);
                  if (variable !== null) exportedVariables.add(variable);
                }
                if (
                  declarator.init !== null &&
                  isMutableSurface(context.sourceCode, declarator.init)
                ) {
                  report(declarator.init);
                  if (declarator.id.type === "Identifier") {
                    const variable = resolveVariable(context.sourceCode, declarator.id);
                    if (variable !== null) reportedVariables.add(variable);
                  }
                }
              }
            }
            if (statement.source === null && statement.exportKind !== "type") {
              for (const specifier of statement.specifiers) {
                if (specifier.exportKind === "type") continue;
                if (
                  specifier.local.type === "Identifier" &&
                  isMutableSurface(
                    context.sourceCode,
                    specifier.local,
                    new Set<Variable>(),
                    Number.POSITIVE_INFINITY,
                  )
                )
                  report(specifier);
              }
            }
          } else if (statement.type === "ExportDefaultDeclaration") {
            const declaration = statement.declaration;
            if (declaration.type === "Identifier") {
              if (isMutableSurface(context.sourceCode, declaration)) report(declaration);
            } else if (
              declaration.type !== "FunctionDeclaration" &&
              declaration.type !== "ClassDeclaration"
            ) {
              if (isMutableSurface(context.sourceCode, declaration)) report(declaration);
            }
          }
        }
      },
      AssignmentExpression(node: ESTree.AssignmentExpression) {
        if (!sourceFile || node.left.type !== "Identifier") return;
        const variable = resolveVariable(context.sourceCode, node.left);
        if (
          variable !== null &&
          exportedVariables.has(variable) &&
          !reportedVariables.has(variable) &&
          isMutableSurface(context.sourceCode, node.right)
        ) {
          report(node.right);
          reportedVariables.add(variable);
        }
      },
    };
  },
});
