import { defineRule } from "@oxlint/plugins";

import { appliesTo, optionsSchema, relativePath } from "./shared.ts";

import type { ESTree } from "@oxlint/plugins";
import type { Options } from "./shared.ts";

// What only the host's Owners may do: run, start or interrupt a fiber, race or time out work, or read a
// Cause or a failed Exit. Every task's Exit is judged once, by the Owner that ran it; a second reader is
// how a cleanup's failure gets misread or lost, and a runner outside an Owner starts a fiber no Owner holds.
const banned: Readonly<Record<string, (member: string) => boolean>> = {
  Effect: (m) =>
    /^(fork|run|race|timeout|catchCause|catchDefect|tapCause|tapDefect|sandbox|matchCause|onError|onExit)/u.test(m),
  FiberMap: () => true,
  FiberSet: () => true,
  FiberHandle: () => true,
  Fiber: (m) => m.startsWith("interrupt"),
  Cause: (m) =>
    /^(has|find|filter|pretty|squash|interruptors|map|annotat|reasonAnnotations|is(Fail|Die|Interrupt)Reason)/u.test(m),
  Exit: (m) => /^(isFailure|has|filter|find|match|getCause|mapError|mapBoth)/u.test(m),
};

const isBanned = (module: string, member: string) => banned[module]?.(member) === true;

// Effect's private modules: anything reached there escapes the rule's names.
const isInternal = (source: string) => source === "effect/internal" || source.startsWith("effect/internal/");

const importedName = (specifier: ESTree.ImportSpecifier) =>
  specifier.imported.type === "Identifier" ? specifier.imported.name : String(specifier.imported.value);

// The module an `effect/<Module>` import names, if it is one the rule watches.
const moduleOf = (source: string) => {
  const module = source.startsWith("effect/") ? source.slice("effect/".length) : "";

  return module in banned ? module : undefined;
};

// Whether an import source reaches a watched module: the package, one of its watched modules, or its
// private ones.
const isWatched = (source: string) => source === "effect" || moduleOf(source) !== undefined || isInternal(source);

// An expression with its casts and parentheses taken off: `(Effect as any)` is `Effect`.
const bare = (node: ESTree.Node): ESTree.Node =>
  node.type === "TSAsExpression" ||
  node.type === "TSSatisfiesExpression" ||
  node.type === "TSNonNullExpression" ||
  node.type === "TSTypeAssertion" ||
  node.type === "ParenthesizedExpression" ||
  node.type === "ChainExpression"
    ? bare(node.expression)
    : node;

// The key a member access names when it is known before running: `.x`, `["x"]` and `` [`x`] ``.
const staticKey = (node: ESTree.MemberExpression) => {
  const key = node.property;

  if (key.type === "Identifier" && !node.computed) return key.name;
  if (key.type === "Literal") return String(key.value);

  return key.type === "TemplateLiteral" && key.expressions.length === 0
    ? (key.quasis[0]?.value.cooked ?? undefined)
    : undefined;
};

// A pattern property's key, when it is known before running.
const patternKey = (property: ESTree.Node) =>
  property.type !== "Property"
    ? undefined
    : property.key.type === "Identifier" && !property.computed
      ? property.key.name
      : property.key.type === "Literal"
        ? String(property.key.value)
        : undefined;

export const ownersOnlyRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Only the host's Owners run, fork, interrupt, race or time out work, or read a Cause.",
    },
    messages: {
      owned:
        "`{{name}}` belongs to the Owners module: fork through an Owner, which judges the task's Exit once and hands you an Ending.",
    },
    schema: optionsSchema,
  },
  createOnce(context) {
    // Local names bound to a watched module (`Effect`, `import { Effect as Fx }`, `import * as E from
    // "effect/Effect"`, `const E = Effect`), and to the package itself (`import * as Pkg from "effect"`).
    let modules = new Map<string, string>();
    let packages = new Set<string>();

    const report = (node: ESTree.Node, name: string) =>
      context.report({ node, messageId: "owned", data: { name } });

    // The watched module an expression is, if it is one: a local name bound to it, or `Pkg.Effect`.
    const moduleNamed = (node: ESTree.Node): string | undefined => {
      const object = bare(node);

      if (object.type === "Identifier") return modules.get(object.name);
      if (object.type !== "MemberExpression") return undefined;

      const parent = bare(object.object);
      const key = staticKey(object);

      return parent.type === "Identifier" && packages.has(parent.name) && key !== undefined && key in banned
        ? key
        : undefined;
    };

    const isPackage = (node: ESTree.Node) => {
      const object = bare(node);

      return object.type === "Identifier" && packages.has(object.name);
    };

    // A name given a module (`const E = Effect`) or the package (`const P = Pkg`) watches it under that
    // name; a pattern taking members out of either is checked member by member.
    const bind = (target: ESTree.Node, value: ESTree.Node) => {
      const module = moduleNamed(value);

      if (target.type === "Identifier") {
        if (module !== undefined) modules.set(target.name, module);
        else if (isPackage(value)) packages.add(target.name);

        return;
      }

      if (target.type !== "ObjectPattern") return;

      for (const property of target.properties) {
        const key = patternKey(property);

        if (module !== undefined && (key === undefined || isBanned(module, key)))
          report(property, `${module}.${key ?? "[…]"}`);
        // `const { Effect: Fx } = Pkg`: the module under the pattern's name.
        else if (
          isPackage(value) &&
          key !== undefined &&
          key in banned &&
          property.type === "Property" &&
          property.value.type === "Identifier"
        )
          modules.set(property.value.name, key);
      }
    };

    return {
      before() {
        const rel = relativePath(context.filename);
        const given: Options = context.options[0] ?? {};
        modules = new Map(Object.keys(banned).map((name) => [name, name]));
        packages = new Set();

        return rel !== undefined && appliesTo(rel, given);
      },
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        const source = String(node.source.value);
        const module = moduleOf(source);

        if (isInternal(source)) return report(node, source);

        for (const specifier of node.specifiers) {
          const name = specifier.type === "ImportSpecifier" ? importedName(specifier) : "*";

          // `import * as E`, `import E` and `import { default as E }`: the whole module or package.
          if (name === "*" || name === "default") {
            if (source === "effect") packages.add(specifier.local.name);
            else if (module !== undefined) modules.set(specifier.local.name, module);

            continue;
          }

          if (source === "effect" && name in banned) modules.set(specifier.local.name, name);
          // `import { forkDetach } from "effect/Effect"`: the member itself, under any name.
          else if (module !== undefined && isBanned(module, name)) report(specifier, `${module}.${name}`);
        }
      },
      // `import("effect/Effect")`: a module reached at run time escapes every name the rule watches.
      ImportExpression(node: ESTree.ImportExpression) {
        const source = bare(node.source);

        if (source.type === "Literal" && isWatched(String(source.value))) report(node, String(source.value));
      },
      // `export { forkDetach } from "effect/Effect"`: a banned member handed on under another module's name.
      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        const source = node.source === null ? undefined : String(node.source.value);

        if (source === undefined) return;
        if (isInternal(source)) return report(node, source);

        const module = moduleOf(source);

        for (const specifier of node.specifiers) {
          const local = specifier.local.type === "Identifier" ? specifier.local.name : String(specifier.local.value);

          if (module !== undefined && (local === "default" || isBanned(module, local)))
            report(specifier, `${module}.${local}`);
        }
      },
      // `export * from "effect/Effect"`: every banned member handed on at once.
      ExportAllDeclaration(node: ESTree.ExportAllDeclaration) {
        const source = String(node.source.value);

        if (moduleOf(source) !== undefined || isInternal(source)) report(node, source);
      },
      MemberExpression(node: ESTree.MemberExpression) {
        const member = staticKey(node);

        if (member === "interruptUnsafe") return report(node, member);

        const module = moduleNamed(node.object);

        if (module === undefined) return;

        // `Effect[name]`: a key known only at run time may be any banned member.
        if (member === undefined) return report(node, `${module}[…]`);
        if (isBanned(module, member)) report(node, `${module}.${member}`);
      },
      VariableDeclarator(node: ESTree.VariableDeclarator) {
        if (node.init !== null) bind(node.id, node.init);
      },
      AssignmentExpression(node: ESTree.AssignmentExpression) {
        if (node.operator === "=") bind(node.left, node.right);
      },
    };
  },
});
