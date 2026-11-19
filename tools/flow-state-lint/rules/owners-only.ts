import { defineRule } from "@oxlint/plugins";

import { appliesTo, optionsSchema, relativePath } from "./shared.ts";

import type { ESTree } from "@oxlint/plugins";
import type { Options } from "./shared.ts";

// What only the host's Owners may do: run, start or interrupt a fiber, race or time out work, or read a
// Cause or a failed Exit. Every task's Exit is judged once, by the Owner that ran it; a second reader is
// how a cleanup's failure gets misread or lost, and a runner outside an Owner starts a fiber no Owner holds.
const banned: Readonly<Record<string, (member: string) => boolean>> = {
  Effect: (m) =>
    /^(fork|run|race|timeout|catchCause|catchDefect|tapCause|tapDefect|sandbox|matchCause|onError|onExit|ignoreCause)/u.test(
      m,
    ),
  // A Scope is closed by the Owner that holds it, which hears its finalizers' Exit.
  Scope: (m) => m === "close",
  FiberMap: () => true,
  FiberSet: () => true,
  FiberHandle: () => true,
  Fiber: (m) => m.startsWith("interrupt"),
  Cause: (m) =>
    /^(has|find|filter|pretty|squash|interruptors|map|annotat|reasonAnnotations|is(Fail|Die|Interrupt)Reason)/u.test(m),
  Exit: (m) => /^(isFailure|has|filter|find|match|getCause|mapError|mapBoth)/u.test(m),
};

const isBanned = (module: string, member: string) => banned[module]?.(member) === true;

// The assignments that can bind a name to a watched module: plain, and the logical ones.
const assigns = new Set(["=", "??=", "||=", "&&="]);

// Effect's private modules: anything reached there escapes the rule's names.
const isInternal = (source: string) => source === "effect/internal" || source.startsWith("effect/internal/");

// The module an `effect/<Module>` import names, if it is one the rule watches.
const moduleOf = (source: string) => {
  const module = source.startsWith("effect/") ? source.slice("effect/".length) : "";

  return module in banned ? module : undefined;
};

// Whether an import source reaches a watched module: the package, one of its watched modules, or its
// private ones.
const isWatched = (source: string) => source === "effect" || moduleOf(source) !== undefined || isInternal(source);

const nameOf = (node: ESTree.Node) => (node.type === "Identifier" ? node.name : String((node as ESTree.Literal).value));

// The wrappers that leave an expression's value as it is: casts, parentheses and optional chains.
const isWrapper = (node: ESTree.Node) =>
  node.type === "TSAsExpression" ||
  node.type === "TSSatisfiesExpression" ||
  node.type === "TSNonNullExpression" ||
  node.type === "TSTypeAssertion" ||
  node.type === "ParenthesizedExpression" ||
  node.type === "ChainExpression";

// An expression with its wrappers taken off: `(Effect as any)` is `Effect`.
const bare = (node: ESTree.Node): ESTree.Node => (isWrapper(node) ? bare(node.expression) : node);

// The outermost wrapper around an expression, so its parent is where the value is used.
const outermost = (node: ESTree.Node): ESTree.Node =>
  node.parent !== undefined && node.parent !== null && isWrapper(node.parent) ? outermost(node.parent) : node;

// A string known before running: a literal, or a template with no expressions.
const staticText = (node: ESTree.Node | null | undefined) =>
  node === null || node === undefined
    ? undefined
    : node.type === "Literal"
      ? String(node.value)
      : node.type === "TemplateLiteral" && node.expressions.length === 0
        ? (node.quasis[0]?.value.cooked ?? undefined)
        : undefined;

// The key a member access names when it is known before running: `.x`, `["x"]` and `` [`x`] ``.
const staticKey = (node: ESTree.MemberExpression) =>
  node.property.type === "Identifier" && !node.computed ? node.property.name : staticText(node.property);

// A pattern property's key, when it is known before running.
const patternKey = (property: ESTree.Node) =>
  property.type !== "Property"
    ? undefined
    : property.key.type === "Identifier" && !property.computed
      ? property.key.name
      : staticText(property.key);

// Where a watched name may stand without handing the module on: a member access on it (checked there), a
// name or pattern bound to it (watched under that name), a type, an import, or a key that is not a
// reference at all.
const isTracked = (at: ESTree.Node, name: ESTree.Node) => {
  const parent = at.parent;

  if (parent === undefined || parent === null) return true;

  // A key that names a property, field or method is not a reference.
  if (
    "key" in parent &&
    parent.key === name &&
    !("computed" in parent && parent.computed) &&
    !("shorthand" in parent && parent.shorthand)
  )
    return true;

  switch (parent.type) {
    case "MemberExpression":
      return parent.object === at || (parent.property === name && !parent.computed);
    case "VariableDeclarator":
      return parent.id === name || parent.id.type === "Identifier" || parent.id.type === "ObjectPattern";
    case "AssignmentExpression":
      return parent.left === name || parent.left.type === "Identifier" || parent.left.type === "ObjectPattern";
    case "AssignmentPattern":
      return parent.left === name;
    case "ImportSpecifier":
    case "ImportDefaultSpecifier":
    case "ImportNamespaceSpecifier":
    case "TSQualifiedName":
    case "TSTypeReference":
    case "TSTypeQuery":
      return true;
    default:
      return (
        (parent.type === "FunctionDeclaration" ||
          parent.type === "FunctionExpression" ||
          parent.type === "ArrowFunctionExpression") &&
        parent.params.includes(name as ESTree.ParamPattern)
      );
  }
};

// What a binding holds: one watched module, or the whole package.
type Held = { readonly module: string } | { readonly package: true };

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
    // Local names bound to a watched module (`import { Effect }`, `import { Effect as Fx }`, `import * as E
    // from "effect/Effect"`, `const E = Effect`), and to the package itself (`import * as Pkg from "effect"`).
    let modules = new Map<string, string>();
    let packages = new Set<string>();

    const report = (node: ESTree.Node, name: string) =>
      context.report({ node, messageId: "owned", data: { name } });

    // What an expression holds, if it is watched: a local name bound to a module or the package, or
    // `Pkg.Effect`.
    const heldBy = (node: ESTree.Node): Held | undefined => {
      const object = bare(node);

      if (object.type === "Identifier") {
        const module = modules.get(object.name);

        return module !== undefined ? { module } : packages.has(object.name) ? { package: true } : undefined;
      }

      if (object.type !== "MemberExpression") return undefined;

      const parent = heldBy(object.object);
      const key = staticKey(object);

      return parent !== undefined && "package" in parent && key !== undefined && key in banned
        ? { module: key }
        : undefined;
    };

    // A name given what an expression holds watches it under that name; a pattern taking members out
    // is checked member by member, and a nested pattern under the package watches each module it takes.
    const bind = (target: ESTree.Node, held: Held) => {
      if (target.type === "AssignmentPattern") return bind(target.left, held);

      if (target.type === "Identifier") {
        if ("module" in held) modules.set(target.name, held.module);
        else packages.add(target.name);

        return;
      }

      if (target.type !== "ObjectPattern") return;

      for (const property of target.properties) {
        const key = patternKey(property);
        const where = "module" in held ? held.module : "effect";

        if (key === undefined) report(property, `${where}[…]`);
        else if ("module" in held) {
          if (isBanned(held.module, key)) report(property, `${held.module}.${key}`);
        } else if (key in banned && property.type === "Property") bind(property.value, { module: key });
      }
    };

    // A watched source reached by a form the rule cannot follow: refused outright.
    const refuseSource = (node: ESTree.Node, source: string | undefined) => {
      if (source === undefined) report(node, "import(…)");
      else if (isWatched(source)) report(node, source);
    };

    // A watched module used as a value anywhere the rule does not follow it: passed, spread, stored,
    // returned or exported.
    const checkEscape = (node: ESTree.Node, name: string) => {
      const at = outermost(node);

      if (!isTracked(at, node)) report(node, `${name} as a value`);
    };

    return {
      before() {
        const rel = relativePath(context.filename);
        const given: Options = context.options[0] ?? {};
        modules = new Map();
        packages = new Set();

        return rel !== undefined && appliesTo(rel, given);
      },
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        const source = String(node.source.value);
        const module = moduleOf(source);

        if (isInternal(source)) return report(node, source);

        for (const specifier of node.specifiers) {
          const name = specifier.type === "ImportSpecifier" ? nameOf(specifier.imported) : "*";

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
      // `import E = require("effect/Effect")`.
      TSImportEqualsDeclaration(node: ESTree.TSImportEqualsDeclaration) {
        const reference = node.moduleReference;

        if (reference.type === "TSExternalModuleReference") refuseSource(node, staticText(reference.expression) ?? "");
      },
      // `import("effect/Effect")`: a module reached at run time escapes every name the rule watches, and
      // so does a source known only at run time.
      ImportExpression(node: ESTree.ImportExpression) {
        refuseSource(node, staticText(bare(node.source)));
      },
      // `require("effect/Effect")`.
      CallExpression(node: ESTree.CallExpression) {
        if (node.callee.type === "Identifier" && node.callee.name === "require")
          refuseSource(node, staticText(node.arguments[0]) ?? "");
      },
      // `export { forkDetach } from "effect/Effect"`, `export { Effect } from "effect"` and `export { E }`
      // of a watched name: a module or member handed on under another file's names.
      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        const source = node.source === null ? undefined : String(node.source.value);

        if (source !== undefined && isInternal(source)) return report(node, source);

        const module = source === undefined ? undefined : moduleOf(source);

        for (const specifier of node.specifiers) {
          const local = nameOf(specifier.local);

          const handsOn =
            source === undefined
              ? modules.has(local) || packages.has(local)
              : source === "effect"
                ? local in banned
                : module !== undefined && (local === "default" || isBanned(module, local));

          if (handsOn) report(specifier, source === undefined ? local : `${source}.${local}`);
        }
      },
      // `export * from "effect/Effect"` and `export * as Pkg from "effect"`: every banned member at once.
      ExportAllDeclaration(node: ESTree.ExportAllDeclaration) {
        const source = String(node.source.value);

        if (isWatched(source)) report(node, source);
      },
      Identifier(node: ESTree.Node) {
        if (node.type === "Identifier" && (modules.has(node.name) || packages.has(node.name)))
          checkEscape(node, node.name);
      },
      MemberExpression(node: ESTree.MemberExpression) {
        const member = staticKey(node);

        if (member === "interruptUnsafe") return report(node, member);

        // A failed Exit's or an error's Cause read by value, which no import shows: the rule has no types, so
        // every `.cause` read outside the Owners counts.
        if (member === "cause") return report(node, ".cause");

        const held = heldBy(node.object);

        if (held === undefined) return;

        if ("package" in held) {
          // `Pkg.Effect` handed on as a value, and `Pkg[name]`, which may be any watched module.
          if (member === undefined) return report(node, "effect[…]");
          if (member in banned) checkEscape(node, `effect.${member}`);

          return;
        }

        // `Effect[name]`: a key known only at run time may be any banned member.
        if (member === undefined) return report(node, `${held.module}[…]`);
        if (isBanned(held.module, member)) report(node, `${held.module}.${member}`);
      },
      VariableDeclarator(node: ESTree.VariableDeclarator) {
        const held = node.init === null ? undefined : heldBy(node.init);

        if (held === undefined) return;

        // `export const E = Effect`: the module handed on under another file's names.
        if (node.parent?.parent?.type === "ExportNamedDeclaration") report(node, "an exported alias");
        bind(node.id, held);
      },
      AssignmentExpression(node: ESTree.AssignmentExpression) {
        const held = assigns.has(node.operator) ? heldBy(node.right) : undefined;

        if (held !== undefined) bind(node.left, held);
      },
    };
  },
});
