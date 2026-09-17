import { defineRule } from "@oxlint/plugins";

import type { ESTree, Scope, SourceCode, Variable } from "@oxlint/plugins";

import { isTestSupportFile } from "../../shared/file-scope.ts";

type StorageKind = "array" | "object" | "map" | "set";
type IdentifierNode = ESTree.IdentifierName | ESTree.IdentifierReference | ESTree.BindingIdentifier;
type Storage = { readonly kind: StorageKind };

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

function firstArgumentExpression(node: ESTree.CallExpression): ESTree.Expression | null {
  const argument = node.arguments[0];
  return argument === undefined || argument.type === "SpreadElement" ? null : argument;
}

function storageKind(node: ESTree.Expression | null): StorageKind | null {
  const expression = node === null ? null : unwrapExpression(node);
  if (expression?.type === "ArrayExpression") return "array";
  if (expression?.type === "ObjectExpression") return "object";
  if (expression?.type === "NewExpression" && expression.callee.type === "Identifier") {
    if (expression.callee.name === "Map") return "map";
    if (expression.callee.name === "Set") return "set";
  }
  if (
    expression?.type === "CallExpression" &&
    expression.callee.type === "MemberExpression" &&
    expression.callee.object.type === "Identifier" &&
    expression.callee.object.name === "Object" &&
    memberName(expression.callee) === "freeze"
  ) {
    const frozenStorage = storageKind(firstArgumentExpression(expression));
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

    return {
      Program() {
        enabled = isPackageSource(context.filename) && !isTestSupportFile(context.filename);
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
          const storage = storageKind(declaration.init);
          const alias = storage === null ? storageForExpression(declaration.init) : null;
          if (storage === null && alias === null) continue;
          if (storage !== null && !programDeclaration) continue;
          const variable = resolveVariable(context.sourceCode, declaration.id);
          if (variable === null) continue;
          const trackedStorage = storage === null ? alias! : { kind: storage };
          mutableStorage.set(variable, trackedStorage);
          if (programDeclaration && storage !== null) {
            if (mutableBinding) reportedStorage.add(trackedStorage);
            else if (storage === "map" || storage === "set") reportStorage(trackedStorage, node);
          }
        }
      },
      AssignmentExpression(node: ESTree.AssignmentExpression) {
        if (!enabled || functionDepth === 0 || node.left.type !== "MemberExpression") return;
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
        if (!enabled || functionDepth === 0 || node.callee.type !== "MemberExpression") return;

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

        const mutatesObject =
          node.callee.object.type === "Identifier" &&
          ((node.callee.object.name === "Object" &&
            (method === "assign" || method === "defineProperty")) ||
            (node.callee.object.name === "Reflect" && method === "set"));
        if (mutatesObject) {
          const targetStorage = storageForExpression(firstArgumentExpression(node));
          if (targetStorage !== null) reportStorage(targetStorage, node);
        }
      },
    };
  },
});
