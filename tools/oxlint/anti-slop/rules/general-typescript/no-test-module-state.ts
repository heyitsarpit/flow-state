import { defineRule } from "@oxlint/plugins";

import type { ESTree, Scope, SourceCode, Variable } from "@oxlint/plugins";

import { isTestSupportFile } from "../../shared/file-scope.ts";
import { isPathWithin } from "../../shared/module-path.ts";

type RuleOptions = [{ sourceRoots?: string[] }];
type IdentifierNode = ESTree.IdentifierName | ESTree.IdentifierReference | ESTree.BindingIdentifier;
type StorageKind = "array" | "object" | "map" | "set";
type Storage = { readonly kind: StorageKind };

const defaultSourceRoots = ["packages/flow-state-rewrite/src"] as const;

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
      },
      AssignmentExpression(node: ESTree.AssignmentExpression) {
        if (!enabled || node.left.type !== "MemberExpression") return;
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
        if (!enabled || node.callee.type !== "MemberExpression") return;
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
        const objectMethod = memberName(node.callee);
        const mutatesObject =
          node.callee.object.type === "Identifier" &&
          ((node.callee.object.name === "Object" &&
            (objectMethod === "assign" || objectMethod === "defineProperty")) ||
            (node.callee.object.name === "Reflect" && objectMethod === "set"));
        if (mutatesObject) {
          const storage = storageForExpression(firstArgumentExpression(node));
          if (storage !== null) reportStorage(storage, node);
        }
      },
    };
  },
});
