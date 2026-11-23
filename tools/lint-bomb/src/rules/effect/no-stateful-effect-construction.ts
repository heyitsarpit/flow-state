import { defineRule } from "@oxlint/plugins";

import { resolveVariable } from "../../shared/scope.ts";

import type { ESTree, SourceCode, Variable } from "@oxlint/plugins";

import {
  importedEffectFunctionName,
  isImportedFromEffect,
} from "../../shared/effect/effect-import.ts";
import { memberName, unwrapExpression } from "../../shared/effect/effect-call.ts";
import {
  isEffectDeferredCallbackArgument,
  isEagerEffectWorkflowCallback,
  isEffectDeferredCallback,
  isSelfRecursiveFunctionReference,
} from "../../shared/effect/effect-workflow.ts";
import { isTestFile } from "../../shared/file-scope.ts";

type FunctionNode = ESTree.ArrowFunctionExpression | ESTree.Function;

type FunctionState = {
  readonly node: FunctionNode;
  readonly effectReturning: boolean;
  readonly lazyCallback: boolean;
  readonly eagerCallback: boolean;
  readonly eagerNodes: ReadonlySet<ESTree.Node>;
};

// Constructor calls return an Effect; namespace membership alone is insufficient evidence.
const effectConstructors = new Set([
  "succeed",
  "sync",
  "suspend",
  "gen",
  "fail",
  "failCause",
  "die",
  "try",
  "tryPromise",
  "promise",
  "sleep",
  "yieldNow",
]);
const nativeMutators = {
  Map: new Set(["set", "delete", "clear"]),
  Set: new Set(["add", "delete", "clear"]),
  Array: new Set([
    "copyWithin",
    "fill",
    "pop",
    "push",
    "reverse",
    "shift",
    "sort",
    "splice",
    "unshift",
  ]),
};

function isEffectType(sourceCode: SourceCode, type: ESTree.TSType): boolean {
  if (type.type === "TSParenthesizedType") return isEffectType(sourceCode, type.typeAnnotation);
  if (type.type !== "TSTypeReference") return false;
  return type.typeName.type === "Identifier"
    ? isImportedFromEffect(sourceCode, type.typeName, new Set(["Effect"]))
    : type.typeName.type === "TSQualifiedName" &&
        type.typeName.right.name === "Effect" &&
        type.typeName.left.type === "Identifier" &&
        isImportedFromEffect(sourceCode, type.typeName.left, new Set(["Effect"]));
}

function isEffectCall(sourceCode: SourceCode, expression: ESTree.Expression): boolean {
  const value = unwrapExpression(expression);
  if (value.type !== "CallExpression") return false;
  const callee = unwrapExpression(value.callee);
  if (callee.type !== "MemberExpression") return false;
  const method = memberName(callee);
  return (
    (effectConstructors.has(method ?? "") &&
      isImportedFromEffect(sourceCode, callee.object, new Set(["Effect"]))) ||
    (method === "make" &&
      isImportedFromEffect(
        sourceCode,
        callee.object,
        new Set(["Deferred", "Queue", "Scope", "Ref"]),
      ))
  );
}

function isEffectReturningExpression(
  sourceCode: SourceCode,
  expression: ESTree.Expression,
  seen = new Set<ESTree.Node>(),
): boolean {
  const value = unwrapExpression(expression);
  if (seen.has(value)) return false;
  seen.add(value);
  if (isEffectCall(sourceCode, value)) return true;
  if (
    value.type === "MemberExpression" &&
    new Set(["void", "never", "interrupt"]).has(memberName(value) ?? "") &&
    isImportedFromEffect(sourceCode, value.object, new Set(["Effect"]))
  )
    return true;
  if (value.type !== "ArrowFunctionExpression" && value.type !== "FunctionExpression") return false;
  if (value.body === null) return false;
  if (
    value.returnType !== null &&
    value.returnType !== undefined &&
    isEffectType(sourceCode, value.returnType.typeAnnotation)
  ) {
    return true;
  }
  if (value.body.type !== "BlockStatement")
    return isEffectReturningExpression(sourceCode, value.body, seen);
  return value.body.body.some(
    (statement) =>
      statement.type === "ReturnStatement" &&
      statement.argument !== null &&
      isEffectReturningExpression(sourceCode, statement.argument, seen),
  );
}

function isEffectReturningFunction(sourceCode: SourceCode, node: FunctionNode): boolean {
  if (
    node.returnType !== null &&
    node.returnType !== undefined &&
    isEffectType(sourceCode, node.returnType.typeAnnotation)
  ) {
    return true;
  }
  if (node.body === null) return false;
  if (node.body.type !== "BlockStatement")
    return isEffectReturningExpression(sourceCode, node.body);
  return node.body.body.some(
    (statement) =>
      statement.type === "ReturnStatement" &&
      statement.argument !== null &&
      isEffectReturningExpression(sourceCode, statement.argument),
  );
}

function isLazyEffectCallback(sourceCode: SourceCode, node: FunctionNode): boolean {
  if (isEffectDeferredCallback(sourceCode, node)) return true;
  const variable = localFunctionBinding(sourceCode, node);
  if (variable === null || variable.defs.length !== 1) return false;
  let deferredReadCount = 0;
  for (const reference of variable.references) {
    if (reference.isWrite()) {
      if (!reference.init) return false;
      continue;
    }
    if (!reference.isRead()) continue;
    if (isEffectDeferredCallbackArgument(sourceCode, reference.identifier)) {
      deferredReadCount += 1;
      continue;
    }
    if (
      node.type === "FunctionDeclaration" &&
      isSelfRecursiveFunctionReference(sourceCode, reference.identifier, node)
    )
      continue;
    return false;
  }
  return deferredReadCount > 0;
}

function localFunctionBinding(sourceCode: SourceCode, node: FunctionNode): Variable | null {
  if (node.type === "FunctionDeclaration") {
    if (
      node.id === null ||
      node.parent.type === "ExportNamedDeclaration" ||
      node.parent.type === "ExportDefaultDeclaration"
    )
      return null;
    const variable = resolveVariable(sourceCode, node.id);
    return variable?.defs.length === 1 &&
      variable.defs[0]?.type === "FunctionName" &&
      variable.defs[0].node === node
      ? variable
      : null;
  }

  let parent: ESTree.Node = node.parent;
  while (
    parent.type === "ParenthesizedExpression" ||
    parent.type === "TSAsExpression" ||
    parent.type === "TSSatisfiesExpression" ||
    parent.type === "TSTypeAssertion" ||
    parent.type === "TSNonNullExpression" ||
    parent.type === "TSInstantiationExpression"
  ) {
    parent = parent.parent;
  }
  if (
    parent.type !== "VariableDeclarator" ||
    parent.init === null ||
    parent.id.type !== "Identifier" ||
    unwrapExpression(parent.init) !== node ||
    parent.parent.type !== "VariableDeclaration" ||
    parent.parent.kind !== "const"
  ) {
    return null;
  }
  if (
    parent.parent.parent.type === "ExportNamedDeclaration" ||
    parent.parent.parent.type === "ExportDefaultDeclaration"
  )
    return null;
  const variable = resolveVariable(sourceCode, parent.id);
  return variable?.defs.length === 1 &&
    variable.defs[0]?.type === "Variable" &&
    variable.defs[0].node === parent
    ? variable
    : null;
}

function rootIdentifier(expression: ESTree.Expression): ESTree.IdentifierReference | null {
  let current = unwrapExpression(expression);
  while (current.type === "MemberExpression") {
    current = unwrapExpression(current.object);
  }
  return current.type === "Identifier" ? current : null;
}

function isCaptured(
  sourceCode: SourceCode,
  expression: ESTree.Expression,
  state: FunctionState,
): boolean {
  const identifier = rootIdentifier(expression);
  if (identifier === null) return false;
  const variable = resolveVariable(sourceCode, identifier);
  if (variable === null) return true;
  let owner: ESTree.Node | null = variable.scope.block;
  while (owner !== null) {
    if (
      owner.type === "FunctionDeclaration" ||
      owner.type === "FunctionExpression" ||
      owner.type === "ArrowFunctionExpression"
    )
      break;
    owner = owner.parent;
  }
  return owner !== state.node;
}

function isMutatingCall(
  sourceCode: SourceCode,
  node: ESTree.CallExpression,
  state: FunctionState,
): boolean {
  const callee = unwrapExpression(node.callee);
  if (callee.type !== "MemberExpression") return false;
  const receiver = unwrapExpression(callee.object);
  const method = memberName(callee);
  if (receiver.type !== "Identifier" || method === null || !isCaptured(sourceCode, receiver, state))
    return false;
  const variable = resolveVariable(sourceCode, receiver);
  if (
    variable === null ||
    variable.defs.length !== 1 ||
    variable.references.some((reference) => reference.isWrite() && !reference.init)
  )
    return false;
  const definition = variable.defs[0];
  if (
    definition.type !== "Variable" ||
    definition.node.type !== "VariableDeclarator" ||
    definition.node.init === null
  )
    return false;
  const initial = unwrapExpression(definition.node.init);
  if (initial.type === "ArrayExpression") return nativeMutators.Array.has(method);
  if (initial.type !== "NewExpression" || initial.callee.type !== "Identifier") return false;
  const constructor = resolveVariable(sourceCode, initial.callee);
  if (constructor !== null && constructor.defs.length > 0) return false;
  switch (initial.callee.name) {
    case "Map":
      return nativeMutators.Map.has(method);
    case "Set":
      return nativeMutators.Set.has(method);
    case "Array":
      return nativeMutators.Array.has(method);
    default:
      return false;
  }
}

function isInsideEffectSucceed(sourceCode: SourceCode, node: ESTree.Node): boolean {
  let current: ESTree.Node | null = node.parent;
  while (current !== null && current.type !== "Program") {
    if (
      current.type === "FunctionDeclaration" ||
      current.type === "FunctionExpression" ||
      current.type === "ArrowFunctionExpression"
    )
      return false;
    if (current.type === "CallExpression") {
      const callee = unwrapExpression(current.callee);
      if (
        callee.type === "MemberExpression" &&
        memberName(callee) === "succeed" &&
        isImportedFromEffect(sourceCode, callee.object, new Set(["Effect"]))
      )
        return true;
    }
    current = current.parent;
  }
  return false;
}

function isSynchronousSuccessYield(sourceCode: SourceCode, node: ESTree.YieldExpression): boolean {
  if (!node.delegate || node.argument === null) return false;
  const argument = unwrapExpression(node.argument);
  if (
    argument.type === "CallExpression" &&
    importedEffectFunctionName(
      sourceCode,
      argument.callee,
      new Set(["Effect"]),
      new Set(["succeed"]),
    ) === "succeed"
  ) {
    return true;
  }
  return (
    argument.type === "MemberExpression" &&
    memberName(argument) === "void" &&
    isImportedFromEffect(sourceCode, argument.object, new Set(["Effect"]))
  );
}

function childNodes(node: ESTree.Node): ESTree.Node[] {
  const children: ESTree.Node[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (
      key === "parent" ||
      key === "loc" ||
      key === "range" ||
      key === "tokens" ||
      key === "comments"
    )
      continue;
    if (Array.isArray(value)) {
      for (const child of value) {
        if (isNode(child)) children.push(child);
      }
    } else if (isNode(value)) {
      children.push(value);
    }
  }
  return children.sort((left, right) => left.start - right.start);
}

function isNode(value: unknown): value is ESTree.Node {
  return typeof value === "object" && value !== null && "type" in value;
}

function mergePrefixes(...prefixes: readonly ReadonlySet<boolean>[]): Set<boolean> {
  return new Set(prefixes.flatMap((prefix) => [...prefix]));
}

function isLoopStatement(node: ESTree.Node): boolean {
  return (
    node.type === "DoWhileStatement" ||
    node.type === "ForInStatement" ||
    node.type === "ForOfStatement" ||
    node.type === "ForStatement" ||
    node.type === "WhileStatement"
  );
}

function isBreakForSwitch(
  node: ESTree.BreakStatement,
  switchNode: ESTree.SwitchStatement,
): boolean {
  if (node.label !== null) {
    let labeledNode: ESTree.Node = switchNode;
    let current: ESTree.Node | null = switchNode.parent;
    while (current?.type === "LabeledStatement" && current.body === labeledNode) {
      if (current.label.name === node.label.name) return true;
      labeledNode = current;
      current = current.parent;
    }
    return false;
  }
  let current: ESTree.Node | null = node.parent;
  while (current !== null) {
    if (current.type === "SwitchStatement" || isLoopStatement(current)) {
      return current === switchNode;
    }
    if (
      current.type === "ArrowFunctionExpression" ||
      current.type === "FunctionDeclaration" ||
      current.type === "FunctionExpression"
    ) {
      return false;
    }
    current = current.parent;
  }
  return false;
}

function visitEagerPrefix(
  sourceCode: SourceCode,
  node: ESTree.Node,
  callback: FunctionNode,
  prefixes: ReadonlySet<boolean>,
  eagerNodes: Set<ESTree.Node>,
  switchNode: ESTree.SwitchStatement | null = null,
  switchBreakPrefixes: Set<boolean> | null = null,
  labeledBreakPrefixes: ReadonlyMap<string, Set<boolean>> = new Map(),
): Set<boolean> {
  if (prefixes.size === 0) return new Set();
  if (
    node !== callback &&
    (node.type === "ArrowFunctionExpression" ||
      node.type === "FunctionExpression" ||
      node.type === "FunctionDeclaration")
  )
    return new Set(prefixes);

  const visit = (child: ESTree.Node, input = prefixes) =>
    visitEagerPrefix(
      sourceCode,
      child,
      callback,
      input,
      eagerNodes,
      switchNode,
      switchBreakPrefixes,
      labeledBreakPrefixes,
    );
  const visitSequence = (nodes: readonly ESTree.Node[], input = prefixes) => {
    let current = new Set(input);
    for (const child of nodes) {
      current = visit(child, current);
      if (current.size === 0) break;
    }
    return current;
  };

  if (node.type === "BlockStatement" || node.type === "Program") {
    return visitSequence(node.body);
  }
  if (node.type === "LabeledStatement") {
    const exits = new Set<boolean>();
    const labels = new Map(labeledBreakPrefixes);
    labels.set(node.label.name, exits);
    const remaining = visitEagerPrefix(
      sourceCode,
      node.body,
      callback,
      prefixes,
      eagerNodes,
      switchNode,
      switchBreakPrefixes,
      labels,
    );
    return mergePrefixes(remaining, exits);
  }
  if (node.type === "IfStatement") {
    const afterTest = visit(node.test);
    return mergePrefixes(
      visit(node.consequent, afterTest),
      node.alternate === null ? afterTest : visit(node.alternate, afterTest),
    );
  }
  if (node.type === "ConditionalExpression") {
    const afterTest = visit(node.test);
    return mergePrefixes(visit(node.consequent, afterTest), visit(node.alternate, afterTest));
  }
  if (node.type === "LogicalExpression") {
    const afterLeft = visit(node.left);
    return mergePrefixes(afterLeft, visit(node.right, afterLeft));
  }
  if (node.type === "SwitchStatement") {
    const afterDiscriminant = visit(node.discriminant);
    const directEntries: Set<boolean>[] = [];
    let unmatchedPrefix = new Set(afterDiscriminant);
    let defaultIndex = -1;
    for (const [index, item] of node.cases.entries()) {
      if (item.test === null) {
        defaultIndex = index;
        directEntries.push(new Set());
      } else {
        unmatchedPrefix = visit(item.test, unmatchedPrefix);
        directEntries.push(new Set(unmatchedPrefix));
      }
    }
    if (defaultIndex !== -1) directEntries[defaultIndex] = new Set(unmatchedPrefix);

    let fallthrough = new Set<boolean>();
    const switchExits = new Set<boolean>();
    const visitSwitchSequence = (
      statements: readonly ESTree.Statement[],
      input: ReadonlySet<boolean>,
      breaks: Set<boolean>,
    ) => {
      let current = new Set(input);
      for (const statement of statements) {
        current = visitEagerPrefix(
          sourceCode,
          statement,
          callback,
          current,
          eagerNodes,
          node,
          breaks,
          labeledBreakPrefixes,
        );
        if (current.size === 0) break;
      }
      return current;
    };
    for (const [index, item] of node.cases.entries()) {
      const entry = mergePrefixes(directEntries[index] ?? [], fallthrough);
      const branchBreaks = new Set<boolean>();
      fallthrough = visitSwitchSequence(item.consequent, entry, branchBreaks);
      for (const prefix of branchBreaks) switchExits.add(prefix);
    }

    const outcomes = mergePrefixes(switchExits, fallthrough);
    return defaultIndex === -1 ? mergePrefixes(outcomes, unmatchedPrefix) : outcomes;
  }
  if (node.type === "ForStatement") {
    let afterTest = prefixes;
    if (node.init !== null) afterTest = visit(node.init, afterTest);
    if (node.test !== null) afterTest = visit(node.test, afterTest);
    const afterBody = visit(node.body, afterTest);
    const afterUpdate = node.update === null ? afterBody : visit(node.update, afterBody);
    return mergePrefixes(afterTest, afterUpdate);
  }
  if (node.type === "WhileStatement") {
    const afterTest = visit(node.test);
    return mergePrefixes(afterTest, visit(node.body, afterTest));
  }
  if (node.type === "DoWhileStatement") {
    return visit(node.test, visit(node.body));
  }
  if (node.type === "ForInStatement" || node.type === "ForOfStatement") {
    const afterRight = visit(node.right);
    return mergePrefixes(afterRight, visit(node.body, afterRight));
  }
  if (node.type === "ReturnStatement" || node.type === "ThrowStatement") {
    if (node.argument !== null) visit(node.argument);
    return new Set();
  }
  if (node.type === "BreakStatement") {
    const labeledExits =
      node.label === null ? undefined : labeledBreakPrefixes.get(node.label.name);
    if (labeledExits !== undefined) {
      for (const prefix of prefixes) labeledExits.add(prefix);
      return new Set();
    }
    if (switchNode !== null && switchBreakPrefixes !== null && isBreakForSwitch(node, switchNode)) {
      for (const prefix of prefixes) switchBreakPrefixes.add(prefix);
    }
    return new Set();
  }
  if (node.type === "ContinueStatement") return new Set();
  if (node.type === "YieldExpression") {
    const afterArgument = node.argument === null ? new Set(prefixes) : visit(node.argument);
    return isSynchronousSuccessYield(sourceCode, node) && afterArgument.size > 0
      ? afterArgument
      : afterArgument.size > 0
        ? new Set([false])
        : afterArgument;
  }

  const output = visitSequence(childNodes(node));
  if (
    output.has(true) &&
    (node.type === "AssignmentExpression" ||
      node.type === "UpdateExpression" ||
      node.type === "CallExpression")
  )
    eagerNodes.add(node);
  return output;
}

function eagerCallbackNodes(sourceCode: SourceCode, callback: FunctionNode): Set<ESTree.Node> {
  const nodes = new Set<ESTree.Node>();
  if (callback.body !== null && callback.body.type === "BlockStatement") {
    visitEagerPrefix(sourceCode, callback.body, callback, new Set([true]), nodes);
  }
  return nodes;
}

function eagerResourceExpression(
  sourceCode: SourceCode,
  expression: ESTree.Expression,
  deferredBody: FunctionNode | null = null,
  seen = new Set<Variable>(),
): boolean {
  const value = unwrapExpression(expression);
  if (value.type === "Identifier") {
    const variable = resolveVariable(sourceCode, value);
    if (
      variable === null ||
      seen.has(variable) ||
      variable.defs.length !== 1 ||
      variable.references.some((reference) => reference.isWrite() && !reference.init)
    )
      return false;
    const definition = variable.defs[0];
    if (
      definition?.type !== "Variable" ||
      definition.parent?.type !== "VariableDeclaration" ||
      definition.parent.kind !== "const" ||
      definition.node.type !== "VariableDeclarator" ||
      definition.node.init === null
    )
      return false;
    if (deferredBody !== null) {
      let parent: ESTree.Node | null = definition.node;
      while (parent !== null) {
        if (parent === deferredBody) return false;
        parent = parent.parent;
      }
    }
    return eagerResourceExpression(
      sourceCode,
      definition.node.init,
      deferredBody,
      new Set([...seen, variable]),
    );
  }
  return (
    value.type === "NewExpression" ||
    (value.type === "CallExpression" &&
      !isEffectCall(sourceCode, value) &&
      importedEffectFunctionName(
        sourceCode,
        value.callee,
        new Set(["Effect"]),
        effectConstructors,
      ) === null)
  );
}

function hasEagerAcquire(sourceCode: SourceCode, node: ESTree.CallExpression): boolean {
  if (
    importedEffectFunctionName(
      sourceCode,
      node.callee,
      new Set(["Effect"]),
      new Set(["acquireRelease", "acquireUseRelease"]),
    ) === null
  )
    return false;
  const acquire = node.arguments[0];
  if (acquire === undefined || acquire.type === "SpreadElement") return false;
  const value = unwrapExpression(acquire);
  if (value.type !== "CallExpression") return false;
  const method = importedEffectFunctionName(
    sourceCode,
    value.callee,
    new Set(["Effect"]),
    new Set(["succeed", "sync"]),
  );
  const argument = value.arguments[0];
  if (method === null || argument === undefined || argument.type === "SpreadElement") return false;
  if (method === "succeed") return eagerResourceExpression(sourceCode, argument);
  const body = unwrapExpression(argument);
  if (
    (body.type !== "ArrowFunctionExpression" && body.type !== "FunctionExpression") ||
    body.body === null
  )
    return false;
  const returned =
    body.body.type === "BlockStatement"
      ? body.body.body.length === 1 && body.body.body[0]?.type === "ReturnStatement"
        ? body.body.body[0].argument
        : null
      : body.body;
  return returned?.type === "Identifier" && eagerResourceExpression(sourceCode, returned, body);
}

/** Warn on direct captured writes and recognized native collection mutations before execution. */
export const noStatefulEffectConstructionRule = defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Warn on captured writes and directly recognized native collection mutations made while constructing an Effect-returning function.",
    },
    messages: {
      acquisition: "Review this resource-producing expression evaluated before acquisition. Construct the resource inside the acquire Effect: Effect.sync for nonthrowing synchronous creation, Effect.try for throwing creation, or Effect.tryPromise for Promise interop. Keep intentional ownership transfers explicit; moving an existing handle into a thunk does not create it lazily.",
      construction:
        "Review this captured-state write during Effect construction. For execution-time mutation, use the owner's Effect-native operation, Effect.sync for a synchronous operation, or an executed Effect.gen/Effect.fn generator. Use Effect.suspend for an Effect-producing factory. Keep fresh local builders plain and do not wrap already-lazy constructors such as Deferred.make or Scope.make. Mutable initial values must be allocated in the intended execution or Layer lifetime.",
    },
  },
  createOnce(context) {
    const functions: FunctionState[] = [];
    const enterFunction = (node: FunctionNode) => {
      const eagerCallback = isEagerEffectWorkflowCallback(context.sourceCode, node);
      functions.push({
        node,
        effectReturning: isEffectReturningFunction(context.sourceCode, node) || eagerCallback,
        lazyCallback: isLazyEffectCallback(context.sourceCode, node),
        eagerCallback,
        eagerNodes: eagerCallback ? eagerCallbackNodes(context.sourceCode, node) : new Set(),
      });
    };
    const exitFunction = () => {
      functions.pop();
    };
    const reportIfConstruction = (node: ESTree.Node, captured: boolean) => {
      const state = functions.at(-1);
      if (
        state === undefined ||
        !state.effectReturning ||
        state.lazyCallback ||
        (state.eagerCallback && !state.eagerNodes.has(node)) ||
        !captured
      )
        return;
      context.report({ node, messageId: "construction" });
    };

    return {
      ArrowFunctionExpression: enterFunction,
      "ArrowFunctionExpression:exit": exitFunction,
      FunctionExpression: enterFunction,
      "FunctionExpression:exit": exitFunction,
      FunctionDeclaration: enterFunction,
      "FunctionDeclaration:exit": exitFunction,
      AssignmentExpression(node: ESTree.AssignmentExpression) {
        if (isTestFile(context.filename) || isInsideEffectSucceed(context.sourceCode, node)) return;
        const state = functions.at(-1);
        if (state !== undefined)
          reportIfConstruction(
            node,
            isCaptured(context.sourceCode, node.left as ESTree.Expression, state),
          );
      },
      UpdateExpression(node: ESTree.UpdateExpression) {
        if (isTestFile(context.filename) || isInsideEffectSucceed(context.sourceCode, node)) return;
        const state = functions.at(-1);
        if (state !== undefined)
          reportIfConstruction(
            node,
            isCaptured(context.sourceCode, node.argument as ESTree.Expression, state),
          );
      },
      CallExpression(node: ESTree.CallExpression) {
        if (isTestFile(context.filename)) return;
        if (hasEagerAcquire(context.sourceCode, node)) context.report({ node, messageId: "acquisition" });
        const state = functions.at(-1);
        if (
          state !== undefined &&
          state.effectReturning &&
          !state.lazyCallback &&
          (!state.eagerCallback || state.eagerNodes.has(node)) &&
          isMutatingCall(context.sourceCode, node, state)
        ) {
          context.report({ node, messageId: "construction" });
        }
      },
    };
  },
});
