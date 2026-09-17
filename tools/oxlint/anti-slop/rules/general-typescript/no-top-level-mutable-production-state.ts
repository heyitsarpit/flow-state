import { defineRule } from "@oxlint/plugins";

import type { ESTree, Scope, SourceCode, Variable } from "@oxlint/plugins";

import { isTestSupportFile } from "../../shared/file-scope.ts";
import { isPathWithin } from "../../shared/module-path.ts";

type RuleOptions = [{ sourceRoots?: string[] }];
type StorageKind = "array" | "object" | "map" | "set";
type IdentifierNode = ESTree.IdentifierName | ESTree.IdentifierReference | ESTree.BindingIdentifier;
type Storage = { readonly kind: StorageKind };
type ObjectMutator = "assign" | "defineProperty" | "reflectSet";

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
const globalObjectNames = new Set(["global", "globalThis", "self", "window"]);
const mutableCollectionNames = new Set(["Map", "Set"]);

function isProgramDeclaration(node: ESTree.VariableDeclaration): boolean {
  return node.parent.type === "Program" || node.parent.type === "ExportNamedDeclaration";
}

function isPackageSource(filename: string): boolean {
  const normalized = filename.replaceAll("\\", "/");
  return /\/packages\/[^/]+\/src\//u.test(normalized);
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
  if (globalObjectNames.has(value.name) && isGlobalReference(sourceCode, value)) return true;
  const variable = resolveVariable(sourceCode, value);
  if (variable === null || seen.has(variable)) return false;
  const declarator = variableDeclarator(variable);
  if (declarator?.id.type !== "Identifier" || declarator.init === null) return false;
  return isGlobalObjectExpression(sourceCode, declarator.init, new Set(seen).add(variable));
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

function variableValues(variable: Variable, at: number): ESTree.Expression[] {
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

function mutableCollectionConstructor(
  sourceCode: SourceCode,
  expression: ESTree.Expression,
  seen: ReadonlySet<Variable> = new Set<Variable>(),
): "map" | "set" | null {
  const value = unwrapExpression(expression);
  if (value.type === "MemberExpression") {
    const name = memberName(value);
    if (
      (name === "Map" || name === "Set") &&
      isGlobalObjectExpression(sourceCode, value.object as ESTree.Expression)
    )
      return name === "Map" ? "map" : "set";
    return null;
  }
  if (value.type === "Identifier") {
    if (mutableCollectionNames.has(value.name) && isGlobalReference(sourceCode, value))
      return value.name === "Map" ? "map" : "set";
    const variable = resolveVariable(sourceCode, value);
    if (variable === null || seen.has(variable)) return null;
    const values = variableValues(variable, value.start);
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
        const kind = mutableCollectionConstructor(
          sourceCode,
          candidate,
          new Set(seen).add(variable),
        );
        if (kind !== null) return kind;
      }
      return null;
    }
    const current = values.at(-1);
    return current === undefined
      ? null
      : mutableCollectionConstructor(sourceCode, current, new Set(seen).add(variable));
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
  return null;
}

function firstArgumentExpression(node: ESTree.CallExpression): ESTree.Expression | null {
  const argument = node.arguments[0];
  return argument === undefined || argument.type === "SpreadElement" ? null : argument;
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
    const current = variableValues(variable, expression.start).at(-1);
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

/** Keep mutable production state behind an explicit service, resource, or host owner. */
export const noTopLevelMutableProductionStateRule = defineRule({
  meta: {
    type: "suggestion",
      docs: {
        description:
          "Disallow top-level mutable production variables and Map/Set containers. Mutable caches and registries need an explicit owner and lifetime.",
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
    messages: {
      topLevelMutable:
        "Do not keep mutable production state at module scope. Move mutable Map/Set caches and registries into an owning factory or service; keep module-local WeakMap/WeakSet stores only for object identity or provenance.",
    },
  },
  createOnce(context) {
    let enabled = false;
    // Module initialization may assemble a literal; captured writes are the persistent ownerless state signal.
    let functionDepth = 0;
    const mutableStorage = new Map<Variable, Storage>();
    const mutatorAliases = new Map<Variable, ObjectMutator>();
    const namespaceAliases = new Map<Variable, "Object" | "Reflect">();
    const reportedStorage = new Set<Storage>();
    const reportStorage = (storage: Storage, node: ESTree.Node) => {
      if (reportedStorage.has(storage)) return;
      reportedStorage.add(storage);
      context.report({ node, messageId: "topLevelMutable" });
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
      if (value.type === "Identifier") {
        if (
          (value.name === "Object" || value.name === "Reflect") &&
          isGlobalReference(context.sourceCode, value)
        )
          return value.name;
        const variable = resolveVariable(context.sourceCode, value);
        if (variable === null || seen.has(variable)) return null;
        const namespace = namespaceAliases.get(variable);
        if (namespace !== undefined) return namespace;
        const declarator = variableDeclarator(variable);
        if (declarator?.id.type !== "Identifier" || declarator.init === null) return null;
        return globalNamespaceForExpression(declarator.init, new Set(seen).add(variable));
      }
      if (
        value.type === "MemberExpression" &&
        (memberName(value) === "Object" || memberName(value) === "Reflect") &&
        isGlobalObjectExpression(context.sourceCode, value.object as ESTree.Expression)
      )
        return memberName(value) as "Object" | "Reflect";
      return null;
    };
    const mutatorForExpression = (
      expression: ESTree.Expression | null,
      seen: ReadonlySet<Variable> = new Set<Variable>(),
    ): ObjectMutator | null => {
      if (expression === null) return null;
      const value = unwrapExpression(expression);
      if (value.type === "MemberExpression") {
        const namespace = globalNamespaceForExpression(value.object, seen);
        const method = memberName(value);
        if (namespace === "Object" && method === "assign") return "assign";
        if (namespace === "Object" && method === "defineProperty") return "defineProperty";
        if (namespace === "Reflect" && method === "set") return "reflectSet";
        return null;
      }
      if (value.type !== "Identifier") return null;
      const variable = resolveVariable(context.sourceCode, value);
      if (variable === null || seen.has(variable)) return null;
      return mutatorAliases.get(variable) ?? null;
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
            : null;
        enabled =
          (sourceRoots === null
            ? isPackageSource(context.filename)
            : sourceRoots.some((root) => isPathWithin(context.filename, root))) &&
          !isTestSupportFile(context.filename);
      },
      FunctionDeclaration() {
        functionDepth += 1;
      },
      "FunctionDeclaration:exit"() {
        functionDepth -= 1;
      },
      FunctionExpression() {
        functionDepth += 1;
      },
      "FunctionExpression:exit"() {
        functionDepth -= 1;
      },
      ArrowFunctionExpression() {
        functionDepth += 1;
      },
      "ArrowFunctionExpression:exit"() {
        functionDepth -= 1;
      },
      VariableDeclaration(node: ESTree.VariableDeclaration) {
        if (!enabled || node.declare === true) return;

        const programDeclaration = isProgramDeclaration(node);
        const mutableBinding = node.kind !== "const";
        if (programDeclaration && mutableBinding) {
          context.report({ node, messageId: "topLevelMutable" });
        }

        for (const declaration of node.declarations) {
          if (declaration.id.type !== "Identifier") continue;
          const variable = resolveVariable(context.sourceCode, declaration.id);
          if (variable === null) continue;
          const namespace = globalNamespaceForExpression(declaration.init);
          if (namespace === null) namespaceAliases.delete(variable);
          else namespaceAliases.set(variable, namespace);
          const mutator = mutatorForExpression(declaration.init);
          if (mutator === null) mutatorAliases.delete(variable);
          else mutatorAliases.set(variable, mutator);
          const storage = storageKind(context.sourceCode, declaration.init);
          const alias = storage === null ? storageForExpression(declaration.init) : null;
          if (storage === null && alias === null) continue;
          if (storage !== null && !programDeclaration) continue;
          const trackedStorage = storage === null ? alias! : { kind: storage };
          mutableStorage.set(variable, trackedStorage);
          if (programDeclaration && storage !== null) {
            if (mutableBinding) reportedStorage.add(trackedStorage);
            else if (storage === "map" || storage === "set") reportStorage(trackedStorage, node);
          }
        }
      },
      AssignmentExpression(node: ESTree.AssignmentExpression) {
        if (!enabled || functionDepth === 0) return;
        if (node.left.type === "Identifier") {
          const variable = resolveVariable(context.sourceCode, node.left);
          if (variable === null) return;
          const mutator = mutatorForExpression(node.right);
          if (mutator === null) mutatorAliases.delete(variable);
          else mutatorAliases.set(variable, mutator);
          const namespace = globalNamespaceForExpression(node.right);
          if (namespace === null) namespaceAliases.delete(variable);
          else namespaceAliases.set(variable, namespace);
          return;
        }
        if (node.left.type !== "MemberExpression") return;
        const storage = storageForExpression(node.left);
        if (storage !== null) reportStorage(storage, node);
      },
      UpdateExpression(node: ESTree.UpdateExpression) {
        if (!enabled || functionDepth === 0 || node.argument.type !== "MemberExpression") return;
        const storage = storageForExpression(node.argument);
        if (storage !== null) reportStorage(storage, node);
      },
      UnaryExpression(node: ESTree.UnaryExpression) {
        if (
          !enabled ||
          functionDepth === 0 ||
          node.operator !== "delete" ||
          node.argument.type !== "MemberExpression"
        )
          return;
        const storage = storageForExpression(node.argument);
        if (storage !== null) reportStorage(storage, node);
      },
      CallExpression(node: ESTree.CallExpression) {
        if (!enabled || functionDepth === 0) return;
        if (node.callee.type !== "MemberExpression") {
          if (mutatorForExpression(node.callee) !== null) {
            const targetStorage = storageForExpression(firstArgumentExpression(node));
            if (targetStorage !== null) reportStorage(targetStorage, node);
          }
          return;
        }

        const method = memberName(node.callee);
        const storage = storageForExpression(node.callee);
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
          const targetStorage = storageForExpression(firstArgumentExpression(node));
          if (targetStorage !== null) reportStorage(targetStorage, node);
        }
      },
    };
  },
});
