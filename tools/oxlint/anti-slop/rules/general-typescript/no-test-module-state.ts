import { defineRule } from "@oxlint/plugins";

import type { ESTree, Scope, SourceCode, Variable } from "@oxlint/plugins";

import { isTestSupportFile } from "../../shared/file-scope.ts";
import { isPathWithin } from "../../shared/module-path.ts";

type RuleOptions = [{ sourceRoots?: string[] }];
type IdentifierNode = ESTree.IdentifierName | ESTree.IdentifierReference | ESTree.BindingIdentifier;
type StorageKind = "array" | "object" | "map" | "set";
type Storage = { readonly kind: StorageKind };
type ObjectMutator = "assign" | "defineProperty" | "reflectSet";

const defaultSourceRoots = ["packages/flow-state-rewrite/src"] as const;
const globalNamespaceNames = new Set(["global", "globalThis", "self", "window"]);
const mutableCollectionNames = new Set(["Map", "Set"]);

const mutatingArrayMethods = new Set([
  "copyWithin",
  "fill",
  "pop",
  "push",
  "reverse",
  "shift",
  "sort",
  "splice",
  "unshift",
]);
const mutatingMapMethods = new Set(["clear", "delete", "set"]);
const mutatingSetMethods = new Set(["add", "clear", "delete"]);

function isProgramDeclaration(node: ESTree.VariableDeclaration): boolean {
  return node.parent.type === "Program" || node.parent.type === "ExportNamedDeclaration";
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

function variableDeclarator(variable: Variable): ESTree.VariableDeclarator | null {
  for (const definition of variable.defs) {
    if (definition.type === "Variable" && definition.node.type === "VariableDeclarator")
      return definition.node;
  }
  return null;
}

function isGlobalReference(sourceCode: SourceCode, identifier: IdentifierNode): boolean {
  const variable = resolveVariable(sourceCode, identifier);
  return variable === null || variable.defs.length === 0;
}

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

function isGlobalObjectExpression(
  sourceCode: SourceCode,
  expression: ESTree.Expression,
  seen: ReadonlySet<Variable> = new Set<Variable>(),
): boolean {
  const value = unwrapExpression(expression);
  if (value.type !== "Identifier") return false;
  if (globalNamespaceNames.has(value.name) && isGlobalReference(sourceCode, value)) return true;
  const variable = resolveVariable(sourceCode, value);
  if (variable === null || seen.has(variable)) return false;
  const declarator = variableDeclarator(variable);
  if (declarator?.id.type !== "Identifier" || declarator.init === null) return false;
  return isGlobalObjectExpression(sourceCode, declarator.init, new Set(seen).add(variable));
}

function variableValues(sourceCode: SourceCode, variable: Variable, at: number): ESTree.Expression[] {
  const values: ESTree.Expression[] = [];
  for (const definition of variable.defs) {
    if (
      definition.type === "Variable" &&
      definition.node.type === "VariableDeclarator" &&
      definition.node.id.type === "Identifier" &&
      definition.node.start <= at &&
      definition.node.init !== null
    )
      values.push(definition.node.init);
  }
  for (const reference of variable.references) {
    if (
      reference.isWrite() &&
      !reference.init &&
      reference.identifier.start <= at &&
      reference.writeExpr !== null
    )
      values.push(reference.writeExpr);
  }
  return values;
}

function mutableCollectionConstructor(
  sourceCode: SourceCode,
  node: ESTree.Expression,
  seen: ReadonlySet<Variable> = new Set<Variable>(),
): "map" | "set" | null {
  const value = unwrapExpression(node);
  if (
    value.type === "Identifier" &&
    mutableCollectionNames.has(value.name) &&
    isGlobalReference(sourceCode, value)
  )
    return value.name === "Map" ? "map" : "set";
  if (value.type === "MemberExpression") {
    const name = memberName(value);
    if (
      (name === "Map" || name === "Set") &&
      isGlobalObjectExpression(sourceCode, value.object as ESTree.Expression)
    )
      return name === "Map" ? "map" : "set";
    return null;
  }
  if (value.type === "ConditionalExpression" || value.type === "LogicalExpression") {
    const left = mutableCollectionConstructor(
      sourceCode,
      value.type === "ConditionalExpression" ? value.consequent : value.left,
      seen,
    );
    return left ?? mutableCollectionConstructor(
      sourceCode,
      value.type === "ConditionalExpression" ? value.alternate : value.right,
      seen,
    );
  }
  if (value.type !== "Identifier") return null;
  const variable = resolveVariable(sourceCode, value);
  if (variable === null || seen.has(variable)) return null;
  const current = variableValues(sourceCode, variable, value.start).at(-1);
  return current === undefined
    ? null
    : mutableCollectionConstructor(sourceCode, current, new Set(seen).add(variable));
}

function storageKind(
  sourceCode: SourceCode,
  node: ESTree.Expression | null,
  seen: ReadonlySet<Variable> = new Set<Variable>(),
): StorageKind | null {
  const expression = node === null ? null : unwrapExpression(node);
  if (expression?.type === "ConditionalExpression" || expression?.type === "LogicalExpression") {
    const left = storageKind(
      sourceCode,
      expression.type === "ConditionalExpression" ? expression.consequent : expression.left,
      seen,
    );
    const right = storageKind(
      sourceCode,
      expression.type === "ConditionalExpression" ? expression.alternate : expression.right,
      seen,
    );
    if (left === "map" || right === "map") return "map";
    if (left === "set" || right === "set") return "set";
    return left ?? right;
  }
  if (expression?.type === "ArrayExpression") return "array";
  if (expression?.type === "ObjectExpression") return "object";
  if (expression?.type === "Identifier") {
    const variable = resolveVariable(sourceCode, expression);
    if (variable === null || seen.has(variable)) return null;
    const current = variableValues(sourceCode, variable, expression.start).at(-1);
    return current === undefined
      ? null
      : storageKind(sourceCode, current, new Set(seen).add(variable));
  }
  if (expression?.type === "NewExpression") {
    const constructor = mutableCollectionConstructor(sourceCode, expression.callee as ESTree.Expression);
    if (constructor !== null) return constructor;
  }
  if (
    expression?.type === "CallExpression" &&
    expression.callee.type === "MemberExpression" &&
    expression.callee.object.type === "Identifier" &&
    expression.callee.object.name === "Object" &&
    isGlobalReference(sourceCode, expression.callee.object) &&
    memberName(expression.callee) === "freeze"
  ) {
    const frozenStorage = storageKind(sourceCode, firstArgumentExpression(expression), seen);
    return frozenStorage === "map" || frozenStorage === "set" ? frozenStorage : null;
  }
  return null;
}

function rootIdentifier(node: ESTree.Expression): ESTree.IdentifierReference | null {
  let current = unwrapExpression(node);
  while (current.type === "MemberExpression") {
    if (current.object.type === "Super") return null;
    current = unwrapExpression(current.object);
  }
  return current.type === "Identifier" ? current : null;
}

function memberName(node: ESTree.MemberExpression): string | null {
  if (!node.computed && node.property.type === "Identifier") return node.property.name;
  if (
    node.computed &&
    node.property.type === "Literal" &&
    typeof node.property.value === "string"
  ) {
    return node.property.value;
  }
  return null;
}

function propertyName(node: ESTree.Node): string | null {
  if (node.type !== "Property") return null;
  if (!node.computed && node.key.type === "Identifier") return node.key.name;
  return node.computed && node.key.type === "Literal" && typeof node.key.value === "string"
    ? node.key.value
    : null;
}

function bindingIdentifiers(
  node: ESTree.Node,
  result: IdentifierNode[] = [],
): IdentifierNode[] {
  if (node.type === "Identifier") result.push(node);
  else if (node.type === "AssignmentPattern") bindingIdentifiers(node.left, result);
  else if (node.type === "RestElement") bindingIdentifiers(node.argument, result);
  else if (node.type === "ArrayPattern") {
    for (const element of node.elements) if (element !== null) bindingIdentifiers(element, result);
  } else if (node.type === "ObjectPattern") {
    for (const property of node.properties) {
      bindingIdentifiers(property.type === "Property" ? property.value : property.argument, result);
    }
  }
  return result;
}

type BindingPath = ReadonlyArray<
  | { readonly kind: "property"; readonly name: string }
  | { readonly kind: "element"; readonly index: number }
  | { readonly kind: "rest" }
>;

function bindingPath(node: ESTree.Node, name: string, path: BindingPath = []): BindingPath | null {
  if (node.type === "Identifier") return node.name === name ? path : null;
  if (node.type === "AssignmentPattern") return bindingPath(node.left, name, path);
  if (node.type === "RestElement")
    return bindingPath(node.argument, name, [...path, { kind: "rest" }]);
  if (node.type === "ObjectPattern") {
    for (const property of node.properties) {
      if (property.type === "Property") {
        const key = propertyName(property);
        if (key === null) continue;
        const result = bindingPath(property.value, name, [
          ...path,
          { kind: "property", name: key },
        ]);
        if (result !== null) return result;
      } else {
        const result = bindingPath(property.argument, name, [...path, { kind: "rest" }]);
        if (result !== null) return result;
      }
    }
  }
  if (node.type === "ArrayPattern") {
    for (const [index, element] of node.elements.entries()) {
      if (element === null) continue;
      const result = bindingPath(element, name, [...path, { kind: "element", index }]);
      if (result !== null) return result;
    }
  }
  return null;
}

function bindingExpressions(
  sourceCode: SourceCode,
  expression: ESTree.Expression,
  path: BindingPath,
  seen: ReadonlySet<Variable> = new Set<Variable>(),
): ESTree.Expression[] {
  if (path.length === 0) return [expression];
  const value = unwrapExpression(expression);
  if (value.type === "AssignmentExpression")
    return bindingExpressions(sourceCode, value.right, path, seen);
  if (value.type === "ConditionalExpression") {
    return [
      ...bindingExpressions(sourceCode, value.consequent, path, seen),
      ...bindingExpressions(sourceCode, value.alternate, path, seen),
    ];
  }
  if (value.type === "LogicalExpression") {
    return [
      ...bindingExpressions(sourceCode, value.left, path, seen),
      ...bindingExpressions(sourceCode, value.right, path, seen),
    ];
  }
  if (value.type === "SequenceExpression") {
    const last = value.expressions.at(-1);
    return last === undefined ? [] : bindingExpressions(sourceCode, last, path, seen);
  }
  const [head, ...tail] = path;
  if (head?.kind === "property" && value.type === "ObjectExpression") {
    const spreadValues: ESTree.Expression[] = [];
    for (const property of [...value.properties].reverse()) {
      if (property.type === "Property" && propertyName(property) === head.name)
        return bindingExpressions(sourceCode, property.value, tail, seen);
      if (property.type === "SpreadElement")
        spreadValues.push(...bindingExpressions(sourceCode, property.argument, path, seen));
    }
    return spreadValues;
  }
  if (head?.kind === "element" && value.type === "ArrayExpression") {
    const element = value.elements[head.index];
    return element === undefined || element === null || element.type === "SpreadElement"
      ? []
      : bindingExpressions(sourceCode, element, tail, seen);
  }
  if (head?.kind === "rest")
    return value.type === "ObjectExpression" || value.type === "ArrayExpression" ? [value] : [];
  if (value.type !== "Identifier") return [];
  const variable = resolveVariable(sourceCode, value);
  if (variable === null || seen.has(variable)) return [];
  const nextSeen = new Set(seen).add(variable);
  const expressions: ESTree.Expression[] = [];
  for (const definition of variable.defs) {
    if (
      definition.type === "Variable" &&
      definition.node.type === "VariableDeclarator" &&
      definition.node.id.type === "Identifier" &&
      definition.node.init !== null
    ) {
      expressions.push(...bindingExpressions(sourceCode, definition.node.init, path, nextSeen));
    }
  }
  return expressions;
}

function objectMutatorName(name: string | null, method: string | null): ObjectMutator | null {
  if (name === "Object" && method === "assign") return "assign";
  if (name === "Object" && method === "defineProperty") return "defineProperty";
  if (name === "Reflect" && method === "set") return "reflectSet";
  return null;
}

function firstArgumentExpression(node: ESTree.CallExpression): ESTree.Expression | null {
  const argument = node.arguments[0];
  return argument === undefined || argument.type === "SpreadElement" ? null : argument;
}

/** Keep mutable test state fresh for each fixture instead of sharing it across tests. */
export const noTestModuleStateRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow shared mutable test state at module scope; fixtures need fresh counters and stateful containers.",
    },
    messages: {
      moduleState:
        "Move mutable test state inside makeFixture or beforeEach so every test gets fresh counters, object/array storage, and Map/Set containers; retain WeakMap/WeakSet only for intentional identity or provenance stores.",
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
    let enabled = false;
    const mutableStorage = new Map<Variable, Storage>();
    const mutatorAliases = new Map<Variable, ObjectMutator>();
    const namespaceAliases = new Map<Variable, "Object" | "Reflect">();
    const reportedStorage = new Set<Storage>();
    const reportStorage = (storage: Storage, node: ESTree.Node) => {
      if (reportedStorage.has(storage)) return;
      reportedStorage.add(storage);
      context.report({ node, messageId: "moduleState" });
    };
    const storageForExpression = (expression: ESTree.Expression | null): Storage | null => {
      if (expression === null) return null;
      const root = rootIdentifier(expression);
      if (root === null) return null;
      const variable = resolveVariable(context.sourceCode, root);
      return variable === null ? null : (mutableStorage.get(variable) ?? null);
    };
    const globalNamespaceForExpression = (
      expression: ESTree.Expression | null,
      seen: ReadonlySet<Variable> = new Set<Variable>(),
    ): "Object" | "Reflect" | null => {
      if (expression === null) return null;
      const value = unwrapExpression(expression);
      if (
        value.type === "MemberExpression" &&
        (memberName(value) === "Object" || memberName(value) === "Reflect") &&
        isGlobalObjectExpression(context.sourceCode, value.object as ESTree.Expression)
      )
        return memberName(value) as "Object" | "Reflect";
      if (value.type !== "Identifier") return null;
      if ((value.name === "Object" || value.name === "Reflect") &&
        isGlobalReference(context.sourceCode, value)) return value.name;
      const variable = resolveVariable(context.sourceCode, value);
      if (variable === null || seen.has(variable)) return null;
      const namespace = namespaceAliases.get(variable);
      if (namespace !== undefined) return namespace;
      const declarator = variableDeclarator(variable);
      if (declarator?.id.type !== "Identifier" || declarator.init === null) return null;
      return globalNamespaceForExpression(declarator.init, new Set(seen).add(variable));
    };
    const mutatorForExpression = (
      expression: ESTree.Expression | null,
      seen: ReadonlySet<Variable> = new Set<Variable>(),
    ): ObjectMutator | null => {
      if (expression === null) return null;
      const value = unwrapExpression(expression);
      if (value.type === "MemberExpression")
        return objectMutatorName(globalNamespaceForExpression(value.object), memberName(value));
      if (value.type !== "Identifier") return null;
      const variable = resolveVariable(context.sourceCode, value);
      if (variable === null || seen.has(variable)) return null;
      return mutatorAliases.get(variable) ?? null;
    };
    const recordDestructuredMutators = (
      declaration: ESTree.VariableDeclarator,
    ): void => {
      if (declaration.id.type !== "ObjectPattern" || declaration.init === null) return;
      const source = globalNamespaceForExpression(declaration.init);
      if (source === null) {
        if (!isGlobalObjectExpression(context.sourceCode, declaration.init)) return;
        for (const property of declaration.id.properties) {
          if (property.type !== "Property") continue;
          const namespace = propertyName(property);
          if (namespace !== "Object" && namespace !== "Reflect") continue;
          for (const identifier of bindingIdentifiers(property.value)) {
            const variable = resolveVariable(context.sourceCode, identifier);
            if (variable !== null) namespaceAliases.set(variable, namespace);
          }
        }
        return;
      }
      for (const property of declaration.id.properties) {
        if (property.type !== "Property") continue;
        const mutator = objectMutatorName(source, propertyName(property));
        if (mutator === null) continue;
        for (const identifier of bindingIdentifiers(property.value)) {
          const variable = resolveVariable(context.sourceCode, identifier);
          if (variable !== null) mutatorAliases.set(variable, mutator);
        }
      }
    };
    const destructuredStorageBindings = (
      declaration: ESTree.VariableDeclarator,
    ): Array<{ variable: Variable; storage: Storage }> => {
      if (declaration.id.type === "Identifier" || declaration.init === null) return [];
      const bindings: Array<{ variable: Variable; storage: Storage }> = [];
      for (const identifier of bindingIdentifiers(declaration.id)) {
        const variable = resolveVariable(context.sourceCode, identifier);
        const path = bindingPath(declaration.id, identifier.name);
        if (variable === null || path === null) continue;
        for (const expression of bindingExpressions(context.sourceCode, declaration.init, path)) {
          const kind = storageKind(context.sourceCode, expression);
          const storage =
            kind === null ? storageForExpression(expression) : { kind };
          if (storage !== null) {
            bindings.push({ variable, storage });
            break;
          }
        }
      }
      return bindings;
    };

    return {
      Program() {
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
        enabled =
          sourceRoots.some((root) => isPathWithin(context.filename, root)) &&
          isTestSupportFile(context.filename);
      },
      VariableDeclaration(node: ESTree.VariableDeclaration) {
        if (!enabled || node.declare === true) return;

        const programDeclaration = isProgramDeclaration(node);
        const hasMutableBinding = node.kind === "let" || node.kind === "var";
        if (programDeclaration && hasMutableBinding) {
          context.report({ node, messageId: "moduleState" });
        }
        let reportedDeclaration = hasMutableBinding;
        for (const declaration of node.declarations) {
          recordDestructuredMutators(declaration);
          if (declaration.id.type === "Identifier") {
            const storage = storageKind(context.sourceCode, declaration.init);
            const alias = storage === null ? storageForExpression(declaration.init) : null;
            const mutator = mutatorForExpression(declaration.init);
            const variable = resolveVariable(context.sourceCode, declaration.id);
            if (variable === null) continue;
            const namespace = globalNamespaceForExpression(declaration.init);
            if (namespace === null) namespaceAliases.delete(variable);
            else namespaceAliases.set(variable, namespace);
            if (storage !== null && !programDeclaration) continue;
            if (storage !== null || alias !== null) {
              const trackedStorage = storage === null ? alias! : { kind: storage };
              mutableStorage.set(variable, trackedStorage);
              if (programDeclaration && storage !== null) {
                if (hasMutableBinding) {
                  reportedStorage.add(trackedStorage);
                } else if (storage === "map" || storage === "set") {
                  if (reportedDeclaration) reportedStorage.add(trackedStorage);
                  else {
                    reportStorage(trackedStorage, node);
                    reportedDeclaration = true;
                  }
                }
              }
            }
            if (mutator !== null) mutatorAliases.set(variable, mutator);
            continue;
          }
          if (!programDeclaration) continue;
          for (const { variable, storage } of destructuredStorageBindings(declaration)) {
            mutableStorage.set(variable, storage);
            if (storage.kind !== "map" && storage.kind !== "set") continue;
            if (hasMutableBinding || reportedDeclaration) reportedStorage.add(storage);
            else {
              reportStorage(storage, node);
              reportedDeclaration = true;
            }
          }
        }
      },
      AssignmentExpression(node: ESTree.AssignmentExpression) {
        if (!enabled) return;
        if (node.left.type === "Identifier") {
          const variable = resolveVariable(context.sourceCode, node.left);
          if (variable === null) return;
          const storage =
            storageKind(context.sourceCode, node.right) ?? storageForExpression(node.right);
          if (storage === null) mutableStorage.delete(variable);
          else mutableStorage.set(variable, storage);
          const mutator = mutatorForExpression(node.right);
          if (mutator === null) mutatorAliases.delete(variable);
          else mutatorAliases.set(variable, mutator);
          const namespace = globalNamespaceForExpression(node.right);
          if (namespace === null) namespaceAliases.delete(variable);
          else namespaceAliases.set(variable, namespace);
          return;
        }
        if (node.left.type !== "MemberExpression") return;
        const root = rootIdentifier(node.left);
        if (root === null) return;
        const storage = storageForExpression(root);
        if (storage !== null) reportStorage(storage, node);
      },
      UpdateExpression(node: ESTree.UpdateExpression) {
        if (!enabled || node.argument.type !== "MemberExpression") return;
        const root = rootIdentifier(node.argument);
        if (root === null) return;
        const storage = storageForExpression(root);
        if (storage !== null) reportStorage(storage, node);
      },
      UnaryExpression(node: ESTree.UnaryExpression) {
        if (!enabled || node.operator !== "delete" || node.argument.type !== "MemberExpression")
          return;
        const root = rootIdentifier(node.argument);
        if (root === null) return;
        const storage = storageForExpression(root);
        if (storage !== null) reportStorage(storage, node);
      },
      CallExpression(node: ESTree.CallExpression) {
        if (!enabled) return;
        const method = node.callee.type === "MemberExpression" ? memberName(node.callee) : null;
        const storage =
          node.callee.type === "MemberExpression" ? storageForExpression(node.callee) : null;
        if (
          storage !== null &&
          (((storage.kind === "array" || storage.kind === "object") &&
            mutatingArrayMethods.has(method ?? "")) ||
            (storage.kind === "map" && mutatingMapMethods.has(method ?? "")) ||
            (storage.kind === "set" && mutatingSetMethods.has(method ?? "")))
        ) {
          reportStorage(storage, node);
          return;
        }
        if (mutatorForExpression(node.callee) !== null) {
          const storage = storageForExpression(firstArgumentExpression(node));
          if (storage !== null) reportStorage(storage, node);
        }
      },
    };
  },
});
