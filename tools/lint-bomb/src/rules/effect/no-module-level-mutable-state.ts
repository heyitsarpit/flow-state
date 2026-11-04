import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode, Variable } from "@oxlint/plugins";

import { resolveVariable } from "../../shared/scope.ts";
import { isConfiguredBoundaryFile } from "../../shared/file-scope.ts";
import { configuredPath, isPathWithin } from "../../shared/module-path.ts";
import { memberName, unwrapExpression } from "../../shared/effect/effect-call.ts";

type RuleOptions = [
  {
    readonly sourceRoots?: string[];
    readonly applicationFiles?: string[];
    readonly allowedFiles?: string[];
    readonly allowedDirectories?: string[];
  },
];

type CollectionKind = "array" | "map" | "set";
type FunctionNode = ESTree.ArrowFunctionExpression | ESTree.Function;

type FunctionFrame = {
  readonly initializationOnly: boolean;
};

const arrayMutators = new Set([
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

const mapMutators = new Set(["clear", "delete", "set"]);
const setMutators = new Set(["add", "clear", "delete"]);

function isIdentifier(node: ESTree.Node): node is ESTree.IdentifierReference {
  return node.type === "Identifier";
}

function bindingFor(sourceCode: SourceCode, node: ESTree.Node): Variable | null {
  const expression = unwrapExpression(node as ESTree.Expression);
  return isIdentifier(expression) ? resolveVariable(sourceCode, expression) : null;
}

function isBindingStable(variable: Variable): boolean {
  return !variable.references.some((reference) => reference.isWrite() && !reference.init);
}

function collectionKindForExpression(
  sourceCode: SourceCode,
  expression: ESTree.Expression,
  visited = new Set<Variable>(),
): CollectionKind | null {
  const value = unwrapExpression(expression);
  if (value.type === "ArrayExpression") return "array";
  if (value.type === "NewExpression" && value.callee.type === "Identifier") {
    const constructor = resolveVariable(sourceCode, value.callee);
    if (constructor !== null && constructor.defs.length > 0) return null;
    if (value.callee.name === "Map") return "map";
    if (value.callee.name === "Set") return "set";
    if (value.callee.name === "Array") return "array";
    return null;
  }
  if (value.type !== "Identifier") return null;
  const variable = resolveVariable(sourceCode, value);
  return variable === null ? null : collectionKindForVariable(sourceCode, variable, visited);
}

function collectionKindForVariable(
  sourceCode: SourceCode,
  variable: Variable,
  visited = new Set<Variable>(),
): CollectionKind | null {
  if (visited.has(variable) || !isBindingStable(variable)) return null;
  visited.add(variable);
  const definitions = variable.defs.filter(
    (definition) => definition.type === "Variable" && definition.node.type === "VariableDeclarator",
  );
  if (definitions.length !== 1) return null;
  const definition = definitions[0];
  if (
    definition === undefined ||
    definition.node.type !== "VariableDeclarator" ||
    definition.node.id.type !== "Identifier"
  )
    return null;
  const parent = definition.node.parent;
  if (parent.type !== "VariableDeclaration" || definition.node.init === null) return null;
  return collectionKindForExpression(sourceCode, definition.node.init, visited);
}

function isModuleMutableScalar(variable: Variable): boolean {
  return (
    variable.scope.type === "module" &&
    variable.defs.some(
      (definition) =>
        definition.type === "Variable" &&
        definition.node.type === "VariableDeclarator" &&
        definition.node.id.type === "Identifier" &&
        definition.node.parent.type === "VariableDeclaration" &&
        (definition.node.parent.kind === "let" || definition.node.parent.kind === "var"),
    )
  );
}

function directIifeCall(node: FunctionNode): ESTree.CallExpression | null {
  if (node.type === "FunctionDeclaration" || node.generator || node.async) return null;
  let expression: ESTree.Node = node;
  while (
    expression.parent !== null &&
    (expression.parent.type === "ParenthesizedExpression" ||
      expression.parent.type === "TSAsExpression" ||
      expression.parent.type === "TSSatisfiesExpression" ||
      expression.parent.type === "TSNonNullExpression" ||
      expression.parent.type === "TSInstantiationExpression")
  ) {
    expression = expression.parent;
  }
  const call = expression.parent;
  if (call === null || call.type !== "CallExpression" || unwrapExpression(call.callee) !== node)
    return null;
  return call;
}

function isFunctionNode(node: ESTree.Node): node is FunctionNode {
  return (
    node.type === "ArrowFunctionExpression" ||
    node.type === "FunctionExpression" ||
    node.type === "FunctionDeclaration"
  );
}

function initializationCaller(node: ESTree.Node): FunctionNode | null | false {
  let current = node.parent;
  while (current !== null && current.type !== "Program") {
    if (current.type === "PropertyDefinition") return false;
    if (isFunctionNode(current)) return current;
    current = current.parent;
  }
  return current === null ? false : null;
}

function functionBinding(sourceCode: SourceCode, node: FunctionNode): Variable | null {
  if (node.type === "FunctionDeclaration") {
    if (node.id === null) return null;
    const identifier = node.id;
    const binding = sourceCode
      .getDeclaredVariables(node)
      .find((variable) => variable.name === identifier.name);
    return binding?.defs.length === 1 && binding.defs[0]?.node === node ? binding : null;
  }

  let expression: ESTree.Node = node;
  while (
    expression.parent !== null &&
    (expression.parent.type === "ParenthesizedExpression" ||
      expression.parent.type === "TSAsExpression" ||
      expression.parent.type === "TSSatisfiesExpression" ||
      expression.parent.type === "TSNonNullExpression" ||
      expression.parent.type === "TSInstantiationExpression")
  ) {
    expression = expression.parent;
  }
  const declarator = expression.parent;
  if (
    declarator === null ||
    declarator.type !== "VariableDeclarator" ||
    declarator.init !== expression ||
    declarator.id.type !== "Identifier"
  )
    return null;
  const identifier = declarator.id;
  const binding = sourceCode
    .getDeclaredVariables(declarator)
    .find((variable) => variable.name === identifier.name);
  return binding?.defs.length === 1 && binding.defs[0]?.node === declarator ? binding : null;
}

function isExportDeclaration(node: ESTree.Node | null): boolean {
  return node?.type === "ExportNamedDeclaration" || node?.type === "ExportDefaultDeclaration";
}

function isExportedDeclarationIdentifier(node: ESTree.Node): boolean {
  if (!isIdentifier(node)) return false;
  const identifier = node;
  const declaration = identifier.parent;
  if (declaration?.type === "FunctionDeclaration" && declaration.id === identifier)
    return isExportDeclaration(declaration.parent);
  if (declaration?.type === "VariableDeclarator" && declaration.id === identifier) {
    const variableDeclaration = declaration.parent;
    return (
      variableDeclaration.type === "VariableDeclaration" &&
      isExportDeclaration(variableDeclaration.parent)
    );
  }
  return false;
}

function isExportedReference(node: ESTree.Node): boolean {
  if (!isIdentifier(node)) return false;
  const identifier = node;
  if (identifier.parent?.type === "ExportSpecifier" && identifier.parent.local === identifier)
    return true;

  let current: ESTree.Node = identifier;
  while (
    current.parent !== null &&
    (current.parent.type === "ParenthesizedExpression" ||
      current.parent.type === "TSAsExpression" ||
      current.parent.type === "TSSatisfiesExpression" ||
      current.parent.type === "TSNonNullExpression" ||
      current.parent.type === "TSInstantiationExpression")
  ) {
    current = current.parent;
  }
  return (
    current.parent?.type === "ExportDefaultDeclaration" && current.parent.declaration === current
  );
}

function isExportedBinding(variable: Variable): boolean {
  return (
    variable.identifiers.some(isExportedDeclarationIdentifier) ||
    variable.references.some((reference) => isExportedReference(reference.identifier))
  );
}

function isDirectCallReference(reference: Variable["references"][number]): boolean {
  const parent = reference.identifier.parent;
  return (
    parent !== null && parent.type === "CallExpression" && parent.callee === reference.identifier
  );
}

function isDirectTopLevelIife(sourceCode: SourceCode, node: FunctionNode): boolean {
  const call = directIifeCall(node);
  if (call === null) return false;
  let current: ESTree.Node | null = call.parent;
  while (current !== null && current.type !== "Program") {
    if (
      current.type === "ArrowFunctionExpression" ||
      current.type === "FunctionExpression" ||
      current.type === "FunctionDeclaration" ||
      current.type === "MethodDefinition" ||
      current.type === "PropertyDefinition"
    )
      return false;
    current = current.parent;
  }
  return current !== null && sourceCode.ast === current;
}

function classMethodInitializationBinding(
  sourceCode: SourceCode,
  node: FunctionNode,
): {
  readonly bindings: readonly Variable[];
  readonly methodName: string;
  readonly methodNames: ReadonlySet<string>;
} | null {
  if (node.type !== "FunctionExpression") return null;
  const method = node.parent;
  const classBody = method?.parent;
  const declaration = classBody?.parent;
  if (
    method?.type !== "MethodDefinition" ||
    method.kind !== "method" ||
    !method.static ||
    method.computed ||
    method.key.type !== "Identifier" ||
    method.value !== node ||
    classBody?.type !== "ClassBody" ||
    (declaration?.type !== "ClassDeclaration" && declaration?.type !== "ClassExpression")
  ) {
    return null;
  }
  let bindings: Variable[];
  let bindingDefinitions = new Set<ESTree.Node>([declaration]);
  if (declaration.type === "ClassDeclaration") {
    const identifier = declaration.id;
    if (identifier === null || isExportDeclaration(declaration.parent)) return null;
    bindings = sourceCode
      .getDeclaredVariables(declaration)
      .filter((variable) => variable.name === identifier.name);
  } else {
    let expression: ESTree.Node = declaration;
    while (
      expression.parent !== null &&
      (expression.parent.type === "ParenthesizedExpression" ||
        expression.parent.type === "TSAsExpression" ||
        expression.parent.type === "TSSatisfiesExpression" ||
        expression.parent.type === "TSNonNullExpression" ||
        expression.parent.type === "TSInstantiationExpression")
    ) {
      expression = expression.parent;
    }
    const declarator = expression.parent;
    const variableDeclaration = declarator?.parent;
    if (
      declarator?.type !== "VariableDeclarator" ||
      declarator.init !== expression ||
      declarator.id.type !== "Identifier" ||
      variableDeclaration?.type !== "VariableDeclaration" ||
      variableDeclaration.kind !== "const" ||
      isExportDeclaration(variableDeclaration.parent)
    ) {
      return null;
    }
    const identifier = declarator.id;
    const outerBinding = sourceCode
      .getDeclaredVariables(declarator)
      .find((variable) => variable.name === identifier.name);
    if (outerBinding === undefined) return null;
    bindings = [outerBinding];
    bindingDefinitions = new Set([declarator, declaration]);
    const classIdentifier = declaration.id;
    if (classIdentifier !== null) {
      const innerBinding = sourceCode
        .getDeclaredVariables(declaration)
        .find((variable) => variable.name === classIdentifier.name);
      if (innerBinding === undefined) return null;
      bindings.push(innerBinding);
    }
  }
  if (
    bindings.length === 0 ||
    bindings.some((binding) => {
      const definitionNode = binding.defs[0]?.node;
      return (
        binding.defs.length !== 1 ||
        definitionNode === undefined ||
        !bindingDefinitions.has(definitionNode) ||
        !isBindingStable(binding) ||
        isExportedBinding(binding)
      );
    })
  ) {
    return null;
  }
  const methodNames = new Set(
    classBody.body.flatMap((member) =>
      member.type === "MethodDefinition" &&
      member.kind === "method" &&
      member.static &&
      !member.computed &&
      member.key.type === "Identifier"
        ? [member.key.name]
        : [],
    ),
  );
  return { bindings, methodName: method.key.name, methodNames };
}

function isClassMethodCalledOnlyDuringInitialization(
  sourceCode: SourceCode,
  node: FunctionNode,
  memo: Map<FunctionNode, boolean>,
  visiting: Set<Variable>,
  visitingMethods: Set<FunctionNode>,
): boolean {
  const methodBinding = classMethodInitializationBinding(sourceCode, node);
  if (methodBinding === null || visitingMethods.has(node)) return false;
  const { bindings, methodName, methodNames } = methodBinding;
  const references = bindings.flatMap((binding) =>
    binding.references.filter((reference) => !reference.init),
  );
  if (references.length === 0) return false;

  const methodReferences: Variable["references"][number][] = [];
  for (const reference of references) {
    const member = reference.identifier.parent;
    const call = member?.parent;
    if (
      member?.type !== "MemberExpression" ||
      member.object !== reference.identifier ||
      member.computed ||
      member.property.type !== "Identifier" ||
      !methodNames.has(member.property.name) ||
      call?.type !== "CallExpression" ||
      call.callee !== member
    ) {
      return false;
    }
    if (member.property.name === methodName) methodReferences.push(reference);
  }
  if (methodReferences.length === 0) return false;

  visitingMethods.add(node);
  let initializationOnly = true;
  for (const reference of methodReferences) {
    const caller = initializationCaller(reference.identifier);
    if (
      caller === false ||
      (caller !== null &&
        !isInitializationOnlyFunction(sourceCode, caller, memo, visiting, visitingMethods))
    ) {
      initializationOnly = false;
      break;
    }
  }
  visitingMethods.delete(node);
  return initializationOnly;
}

function isInitializationOnlyFunction(
  sourceCode: SourceCode,
  node: FunctionNode,
  memo: Map<FunctionNode, boolean>,
  visiting = new Set<Variable>(),
  visitingMethods = new Set<FunctionNode>(),
): boolean {
  const cached = memo.get(node);
  if (cached !== undefined) return cached;
  if (node.async || node.generator) {
    memo.set(node, false);
    return false;
  }
  if (node.parent?.type === "MethodDefinition") {
    const initializationOnly = isClassMethodCalledOnlyDuringInitialization(
      sourceCode,
      node,
      memo,
      visiting,
      visitingMethods,
    );
    memo.set(node, initializationOnly);
    return initializationOnly;
  }
  if (isDirectTopLevelIife(sourceCode, node)) {
    memo.set(node, true);
    return true;
  }

  const iifeCall = directIifeCall(node);
  if (iifeCall !== null) {
    const caller = initializationCaller(iifeCall);
    if (
      caller !== false &&
      caller !== null &&
      isInitializationOnlyFunction(sourceCode, caller, memo, visiting, visitingMethods)
    ) {
      memo.set(node, true);
      return true;
    }
  }

  const binding = functionBinding(sourceCode, node);
  const references = binding?.references.filter((reference) => !reference.init) ?? [];
  if (
    binding === null ||
    references.length === 0 ||
    !isBindingStable(binding) ||
    isExportedBinding(binding) ||
    visiting.has(binding)
  ) {
    memo.set(node, false);
    return false;
  }

  visiting.add(binding);
  let initializationOnly = true;
  for (const reference of references) {
    if (!isDirectCallReference(reference)) {
      initializationOnly = false;
      break;
    }
    const caller = initializationCaller(reference.identifier);
    if (
      caller === false ||
      (caller !== null &&
        !isInitializationOnlyFunction(sourceCode, caller, memo, visiting, visitingMethods))
    ) {
      initializationOnly = false;
      break;
    }
  }
  visiting.delete(binding);
  memo.set(node, initializationOnly);
  return initializationOnly;
}

function isArrayIndexWrite(member: ESTree.MemberExpression): boolean {
  if (!member.computed) return false;
  const property = member.property;
  if (property.type === "Literal") {
    if (typeof property.value === "number")
      return Number.isInteger(property.value) && property.value >= 0;
    if (typeof property.value === "string") return /^(?:0|[1-9]\d*)$/u.test(property.value);
    return false;
  }
  return true;
}

function assignmentTargetLeaves(node: ESTree.Node): ESTree.Node[] {
  if (node.type === "ArrayPattern") {
    return node.elements.flatMap((element) => element === null ? [] : assignmentTargetLeaves(element));
  }
  if (node.type === "ObjectPattern") {
    return node.properties.flatMap((property) => assignmentTargetLeaves(
      property.type === "RestElement" ? property.argument : property.value,
    ));
  }
  if (node.type === "AssignmentPattern") return assignmentTargetLeaves(node.left);
  if (node.type === "RestElement") return assignmentTargetLeaves(node.argument);
  return [node];
}

function assignmentTargetIdentifier(node: ESTree.Node): ESTree.IdentifierReference | null {
  return isIdentifier(node) ? node : null;
}

/** Review supported module-owned mutable storage only inside configured application files. */
export const noModuleLevelMutableStateRule = defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Review module-level mutable application state in configured files; syntax identifies supported bindings and writes, not the intended sharing policy.",
    },
    messages: {
      moduleState:
        "This module-level state is mutated by application operations. Allocate it inside its owning Service Layer and expose domain operations.",
    },
    schema: [
      {
        type: "object",
        properties: {
          sourceRoots: { type: "array", items: { type: "string", minLength: 1 } },
          applicationFiles: { type: "array", items: { type: "string", minLength: 1 } },
          allowedFiles: { type: "array", items: { type: "string", minLength: 1 } },
          allowedDirectories: { type: "array", items: { type: "string", minLength: 1 } },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{}] satisfies RuleOptions,
  },
  createOnce(context) {
    let sourceCode: SourceCode | undefined;
    let applicationFile = false;
    let boundaryFile = false;
    const moduleScalars = new Set<Variable>();
    const moduleCollections = new Map<Variable, CollectionKind>();
    const localCollections = new Map<Variable, CollectionKind>();
    const initializationOnlyFunctions = new Map<FunctionNode, boolean>();
    const functions: FunctionFrame[] = [];

    const collectionForIdentifier = (node: ESTree.Node): CollectionKind | null => {
      if (sourceCode === undefined) return null;
      const variable = bindingFor(sourceCode, node);
      if (variable === null) return null;
      return moduleCollections.get(variable) ?? localCollections.get(variable) ?? null;
    };
    const report = (node: ESTree.Node) => {
      if (
        !applicationFile ||
        boundaryFile ||
        functions.length === 0 ||
        functions.at(-1)?.initializationOnly === true
      )
        return;
      context.report({ node, messageId: "moduleState" });
    };
    const visitFunction = (node: FunctionNode) => {
      functions.push({
        initializationOnly:
          sourceCode !== undefined &&
          isInitializationOnlyFunction(sourceCode, node, initializationOnlyFunctions),
      });
    };
    const leaveFunction = () => {
      functions.pop();
    };
    const checkScalarWrite = (node: ESTree.Node) => {
      const identifier = assignmentTargetIdentifier(node);
      if (identifier === null || sourceCode === undefined) return false;
      const variable = resolveVariable(sourceCode, identifier);
      if (variable === null || !moduleScalars.has(variable)) return false;
      report(node.parent ?? node);
      return true;
    };
    const checkCollectionWrite = (node: ESTree.Node) => {
      if (node.type !== "MemberExpression") return false;
      const kind = collectionForIdentifier(node.object);
      if (kind !== "array") return false;
      const property = memberName(node);
      if (property !== "length" && !isArrayIndexWrite(node)) return false;
      report(node.parent ?? node);
      return true;
    };

    return {
      Program(node: ESTree.Program) {
        moduleScalars.clear();
        moduleCollections.clear();
        localCollections.clear();
        initializationOnlyFunctions.clear();
        functions.length = 0;
        applicationFile = false;
        boundaryFile = false;
        sourceCode = context.sourceCode;
        const option = context.options?.[0] as RuleOptions[0] | undefined;
        const roots = Array.isArray(option?.sourceRoots) ? option.sourceRoots : [];
        const applicationFiles = Array.isArray(option?.applicationFiles)
          ? option.applicationFiles
          : [];
        applicationFile =
          roots.some((root) => isPathWithin(context.filename, root, context.cwd)) ||
          applicationFiles.some(
            (file) =>
              configuredPath(context.filename, context.cwd) === configuredPath(file, context.cwd),
          );
        boundaryFile = isConfiguredBoundaryFile(context.filename, option, context.cwd);
        if (!applicationFile || boundaryFile) return;

        const moduleScope = sourceCode.scopeManager.scopes.find(
          (scope) => scope.type === "module" && scope.block === node,
        );
        if (moduleScope === undefined) return;
        for (const variable of moduleScope.variables) {
          if (isModuleMutableScalar(variable)) moduleScalars.add(variable);
          const kind = collectionKindForVariable(sourceCode, variable);
          if (kind !== null) moduleCollections.set(variable, kind);
        }
      },
      ArrowFunctionExpression: visitFunction,
      "ArrowFunctionExpression:exit": leaveFunction,
      FunctionExpression: visitFunction,
      "FunctionExpression:exit": leaveFunction,
      FunctionDeclaration: visitFunction,
      "FunctionDeclaration:exit": leaveFunction,
      VariableDeclarator(node: ESTree.VariableDeclarator) {
        if (
          !applicationFile ||
          boundaryFile ||
          sourceCode === undefined ||
          node.id.type !== "Identifier" ||
          node.init === null
        )
          return;
        const identifier = node.id;
        const target = sourceCode
          .getDeclaredVariables(node)
          .find((variable) => variable.name === identifier.name);
        if (
          target === undefined ||
          target.scope.type === "module" ||
          localCollections.has(target) ||
          !isBindingStable(target)
        )
          return;
        const alias = unwrapExpression(node.init);
        if (alias.type !== "Identifier") return;
        const kind = collectionForIdentifier(alias);
        if (kind !== null) localCollections.set(target, kind);
      },
      AssignmentExpression(node: ESTree.AssignmentExpression) {
        if (
          !applicationFile ||
          boundaryFile ||
          functions.length === 0 ||
          functions.at(-1)?.initializationOnly === true
        )
          return;
        for (const target of assignmentTargetLeaves(node.left)) {
          if (!checkScalarWrite(target)) checkCollectionWrite(target);
        }
      },
      UpdateExpression(node: ESTree.UpdateExpression) {
        if (
          !applicationFile ||
          boundaryFile ||
          functions.length === 0 ||
          functions.at(-1)?.initializationOnly === true
        )
          return;
        if (!checkScalarWrite(node.argument as ESTree.Node))
          checkCollectionWrite(node.argument as ESTree.Node);
      },
      CallExpression(node: ESTree.CallExpression) {
        if (
          !applicationFile ||
          boundaryFile ||
          functions.length === 0 ||
          functions.at(-1)?.initializationOnly === true
        )
          return;
        const callee = unwrapExpression(node.callee);
        if (callee.type !== "MemberExpression") return;
        const receiver = collectionForIdentifier(callee.object);
        const method = memberName(callee);
        if (method === null) return;
        const isMutator =
          receiver === "map"
            ? mapMutators.has(method)
            : receiver === "set"
              ? setMutators.has(method)
              : receiver === "array" && arrayMutators.has(method);
        if (isMutator) report(node);
      },
    };
  },
});
