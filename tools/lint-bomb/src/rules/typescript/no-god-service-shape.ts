import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { isTestSupportFile } from "../../shared/file-scope.ts";

type RuleOptions = [{ threshold?: number }];
type TypeDeclaration = ESTree.TSInterfaceDeclaration | ESTree.TSTypeAliasDeclaration;
type DeclarationGroup = {
  name: string;
  scope: TypeScope;
  declarations: TypeDeclaration[];
};
type TypeScope = {
  parent: TypeScope | null;
  namespaceExports: TypeScope | null;
  namespaces: Map<string, TypeScope>;
  declarations: Map<string, DeclarationGroup>;
};

const DEFAULT_THRESHOLD = 16;

function optionThreshold(option: unknown): number {
  if (typeof option !== "object" || option === null || Array.isArray(option))
    return DEFAULT_THRESHOLD;
  const threshold = (option as Record<string, unknown>).threshold;
  return typeof threshold === "number" && Number.isInteger(threshold) && threshold > 0
    ? threshold
    : DEFAULT_THRESHOLD;
}

function isServiceLikeName(name: string): boolean {
  return /(?:Service|Repository|Dependencies|Deps|Port|Client)$/u.test(name);
}

function makeScope(parent: TypeScope | null, namespaceExports: TypeScope | null = null): TypeScope {
  return { parent, namespaceExports, namespaces: new Map(), declarations: new Map() };
}

function namespaceSegment(node: ESTree.TSModuleDeclaration | ESTree.TSGlobalDeclaration): string {
  if ("global" in node && node.global) return "global";
  if (node.id.type === "Identifier") return `namespace:${node.id.name}`;
  if (node.id.type === "Literal") return `module:${String(node.id.value)}`;
  const qualified = (name: ESTree.TSQualifiedName): string => {
    const left =
      name.left.type === "TSQualifiedName"
        ? qualified(name.left)
        : name.left.type === "ThisExpression"
          ? "this"
          : name.left.name;
    return `${left}.${name.right.name}`;
  };
  return `namespace:${qualified(node.id)}`;
}

function namespaceSegments(block: ESTree.TSModuleBlock): string[] {
  const segments: string[] = [];
  let child: ESTree.Node = block;
  let current: ESTree.Node | null = block.parent;
  while (current?.type === "TSModuleDeclaration" && current.body === child) {
    segments.unshift(namespaceSegment(current));
    child = current;
    current = current.parent;
  }
  return segments;
}

function getNamespaceScope(parent: TypeScope, segment: string): TypeScope {
  let scope = parent.namespaces.get(segment);
  if (scope === undefined) {
    scope = makeScope(parent);
    parent.namespaces.set(segment, scope);
  }
  return scope;
}

function isNamespaceExport(node: ESTree.Node): boolean {
  if (node.parent?.type === "ExportNamedDeclaration") return true;
  let current: ESTree.Node | null = node;
  while (current !== null) {
    if (current.type === "TSModuleDeclaration" && current.declare) return true;
    current = current.parent;
  }
  return false;
}

function addDeclaration(scope: TypeScope, declaration: TypeDeclaration): void {
  const name = declaration.id.name;
  let group = scope.declarations.get(name);
  if (group === undefined) {
    group = { name, scope, declarations: [] };
    scope.declarations.set(name, group);
  }
  group.declarations.push(declaration);
}

function hasTypeParameterNamed(declaration: TypeDeclaration, name: string): boolean {
  let current: ESTree.Node | null = declaration;
  while (current !== null) {
    const typeParameters = (
      current as ESTree.Node & { typeParameters?: ESTree.TSTypeParameterDeclaration | null }
    ).typeParameters;
    if (typeParameters?.params.some((parameter) => parameter.name.name === name)) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function findDeclarationGroup(scope: TypeScope, name: string): DeclarationGroup | null {
  let current: TypeScope | null = scope;
  while (current !== null) {
    const group = current.declarations.get(name);
    if (group !== undefined) return group;
    current = current.parent;
  }
  return null;
}

function findNamespaceScope(scope: TypeScope, name: string): TypeScope | null {
  let current: TypeScope | null = scope;
  while (current !== null) {
    const namespace = current.namespaces.get(`namespace:${name}`);
    if (namespace !== undefined) return namespace;
    current = current.parent;
  }
  return null;
}

function typeNameSegments(
  name: ESTree.IdentifierReference | ESTree.TSQualifiedName | ESTree.ThisExpression,
): string[] | null {
  if (name.type === "Identifier") return [name.name];
  if (name.type !== "TSQualifiedName") return null;
  const left = typeNameSegments(name.left);
  return left === null ? null : [...left, name.right.name];
}

function heritageSegments(expression: ESTree.Expression): string[] | null {
  if (expression.type === "Identifier") return [expression.name];
  if (
    expression.type !== "MemberExpression" ||
    expression.computed ||
    expression.property.type !== "Identifier"
  )
    return null;
  const parent = heritageSegments(expression.object as ESTree.Expression);
  return parent === null ? null : [...parent, expression.property.name];
}

function findReferencedGroup(scope: TypeScope, segments: string[]): DeclarationGroup | null {
  const [first, ...rest] = segments;
  if (first === undefined) return null;
  if (rest.length === 0) return findDeclarationGroup(scope, first);
  let namespace = findNamespaceScope(scope, first);
  for (const segment of rest.slice(0, -1)) {
    namespace = namespace?.namespaces.get(`namespace:${segment}`) ?? null;
  }
  const name = rest.at(-1);
  return namespace === null || name === undefined
    ? null
    : (namespace.declarations.get(name) ?? null);
}

function acceptsTypeArgumentCount(group: DeclarationGroup, count: number): boolean {
  return group.declarations.some((declaration) => {
    const parameters = declaration.typeParameters?.params ?? [];
    const firstDefault = parameters.findIndex((parameter) => parameter.default !== null);
    const required = firstDefault === -1 ? parameters.length : firstDefault;
    return count >= required && count <= parameters.length;
  });
}

/** Warn when a capability contract has grown into a dependency bag. */
export const noGodServiceShapeRule = defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Warn when a service-like contract has too many members. Prefer cohesive ports over god dependency bags.",
    },
    messages: {
      godServiceShape:
        "`{{name}}` has {{members}} type members, including properties, methods, and signatures. Review whether this service-like contract groups one cohesive capability. Split independent authority or lifetimes into explicit contracts and compose Service Layers where appropriate; keep operations together when shared invariants require one owner. Member count alone does not justify a split.",
    },
    schema: [
      {
        type: "object",
        properties: { threshold: { type: "integer", minimum: 1 } },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ threshold: DEFAULT_THRESHOLD }] satisfies RuleOptions,
  },
  createOnce(context) {
    let threshold = DEFAULT_THRESHOLD;
    let inProductionSource = false;
    let rootScope: TypeScope | null = null;
    const scopeStack: TypeScope[] = [];
    const groups: DeclarationGroup[] = [];
    let declarationScopes = new WeakMap<TypeDeclaration, TypeScope>();
    const add = (declaration: TypeDeclaration) => {
      const scope = scopeStack.at(-1) ?? rootScope;
      if (scope === null) return;
      const owner = isNamespaceExport(declaration)
        ? scope.namespaceExports ?? scope
        : scope;
      let group = owner.declarations.get(declaration.id.name);
      if (group === undefined) {
        addDeclaration(owner, declaration);
        group = owner.declarations.get(declaration.id.name);
        if (group === undefined) return;
        groups.push(group);
      } else {
        group.declarations.push(declaration);
      }
      declarationScopes.set(declaration, scope);
    };
    const countGroup = (group: DeclarationGroup, visited = new Set<DeclarationGroup>()): number => {
      if (visited.has(group)) return 0;
      visited.add(group);
      return group.declarations.reduce((total, declaration) => {
        if (declaration.type === "TSInterfaceDeclaration") {
          return (
            total +
            declaration.body.body.length +
            declaration.extends.reduce(
              (members, item) => members + countType(item, declaration, visited),
              0,
            )
          );
        }
        return total + countType(declaration.typeAnnotation, declaration, visited);
      }, 0);
    };
    const countType = (
      type: ESTree.TSType | ESTree.TSInterfaceHeritage,
      declaration: TypeDeclaration,
      visited = new Set<DeclarationGroup>(),
    ): number => {
      if (type.type === "TSInterfaceHeritage") {
        const segments = heritageSegments(type.expression);
        if (segments === null || hasTypeParameterNamed(declaration, segments[0] ?? "")) return 0;
        const scope = declarationScopes.get(declaration);
        if (scope === undefined) return 0;
        const group = findReferencedGroup(scope, segments);
        return group !== null &&
          acceptsTypeArgumentCount(group, type.typeArguments?.params.length ?? 0)
          ? countGroup(group, visited)
          : 0;
      }
      if (type.type === "TSParenthesizedType" || type.type === "TSTypeOperator")
        return countType(type.typeAnnotation, declaration, visited);
      if (type.type === "TSIntersectionType")
        return type.types.reduce(
          (total, member) => total + countType(member, declaration, visited),
          0,
        );
      if (type.type === "TSTypeLiteral") return type.members.length;
      if (type.type !== "TSTypeReference") return 0;
      const segments = typeNameSegments(type.typeName);
      if (segments === null) return 0;
      const name = segments[0] ?? "";
      if (hasTypeParameterNamed(declaration, name)) return 0;
      const scope = declarationScopes.get(declaration);
      if (scope === undefined) return 0;
      const group = findReferencedGroup(scope, segments);
      if (group !== null) {
        return acceptsTypeArgumentCount(group, type.typeArguments?.params.length ?? 0)
          ? countGroup(group, visited)
          : 0;
      }
      return name === "Readonly" && type.typeArguments?.params.length === 1
        ? countType(type.typeArguments.params[0], declaration, visited)
        : 0;
    };
    const check = (name: string, members: number, node: ESTree.Node) => {
      if (inProductionSource && isServiceLikeName(name) && members > threshold) {
        context.report({
          node,
          messageId: "godServiceShape",
          data: { name, members },
        });
      }
    };

    return {
      Program() {
        groups.length = 0;
        scopeStack.length = 0;
        declarationScopes = new WeakMap();
        threshold = optionThreshold(context.options?.[0]);
        inProductionSource = !isTestSupportFile(context.filename);
        rootScope = makeScope(null);
        scopeStack.push(rootScope);
      },
      BlockStatement() {
        const parent = scopeStack.at(-1);
        if (parent !== undefined) scopeStack.push(makeScope(parent));
      },
      "BlockStatement:exit"() {
        scopeStack.pop();
      },
      TSModuleBlock(node: ESTree.TSModuleBlock) {
        let scope = scopeStack.at(-1) ?? rootScope;
        if (scope === null) return;
        let declaration: ESTree.Node = node;
        while (declaration.parent?.type === "TSModuleDeclaration") declaration = declaration.parent;
        if (isNamespaceExport(declaration)) scope = scope.namespaceExports ?? scope;
        for (const segment of namespaceSegments(node)) scope = getNamespaceScope(scope, segment);
        scopeStack.push(makeScope(scope, scope));
      },
      "TSModuleBlock:exit"() {
        scopeStack.pop();
      },
      TSInterfaceDeclaration(node: ESTree.TSInterfaceDeclaration) {
        add(node);
      },
      TSTypeAliasDeclaration(node: ESTree.TSTypeAliasDeclaration) {
        add(node);
      },
      "Program:exit"() {
        for (const group of groups) {
          if (group.declarations.every((declaration) => declaration.declare)) continue;
          const declaration = group.declarations[0];
          if (declaration !== undefined) check(group.name, countGroup(group), declaration);
        }
      },
    };
  },
});
