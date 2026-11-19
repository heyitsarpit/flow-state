import { defineRule } from "@oxlint/plugins";

import { appliesTo, optionsSchema, propertyName, relativePath } from "./shared.ts";

import type { ESTree } from "@oxlint/plugins";
import type { Options } from "./shared.ts";

// What only the host's Owners may do: start or interrupt a fiber, race or time out work, or read a
// Cause or a failed Exit. Every task's Exit is judged once, by the Owner that ran it; a second
// reader is how a cleanup's failure gets misread or lost.
const banned: Readonly<Record<string, (member: string) => boolean>> = {
  Effect: (m) => /^(fork|runFork|runCallback|race|timeout)/u.test(m),
  FiberMap: () => true,
  FiberSet: () => true,
  FiberHandle: () => true,
  Fiber: (m) => m.startsWith("interrupt"),
  Cause: (m) => m.startsWith("has") || m.startsWith("find"),
  Exit: (m) => m === "isFailure",
};

const isBanned = (module: string, member: string) => banned[module]?.(member) === true;

const importedName = (specifier: ESTree.ImportSpecifier) =>
  specifier.imported.type === "Identifier" ? specifier.imported.name : String(specifier.imported.value);

// The module an `effect/<Module>` import names, if it is one the rule watches.
const moduleOf = (source: string) => {
  const module = source.startsWith("effect/") ? source.slice("effect/".length) : "";

  return module in banned ? module : undefined;
};

export const ownersOnlyRule = defineRule({
  meta: {
    type: "problem",
    docs: { description: "Only the host's Owners fork, interrupt, race or time out work, or read a Cause." },
    messages: {
      owned:
        "`{{name}}` belongs to the Owners module: fork through an Owner, which judges the task's Exit once and hands you an Ending.",
    },
    schema: optionsSchema,
  },
  createOnce(context) {
    // Local names bound to a watched module (`Effect`, `import { Effect as Fx }`, `import * as E from
    // "effect/Effect"`), and to the package itself (`import * as Pkg from "effect"`).
    let modules = new Map<string, string>();
    let packages = new Set<string>();

    const report = (node: ESTree.Node, name: string) =>
      context.report({ node, messageId: "owned", data: { name } });

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

        for (const specifier of node.specifiers) {
          if (specifier.type === "ImportNamespaceSpecifier" || specifier.type === "ImportDefaultSpecifier") {
            if (source === "effect") packages.add(specifier.local.name);
            else if (module !== undefined) modules.set(specifier.local.name, module);

            continue;
          }

          const name = importedName(specifier);

          if (source === "effect" && name in banned) modules.set(specifier.local.name, name);
          // `import { forkDetach } from "effect/Effect"`: the member itself, under any name.
          else if (module !== undefined && isBanned(module, name)) report(specifier, `${module}.${name}`);
        }
      },
      MemberExpression(node: ESTree.MemberExpression) {
        const member = propertyName(node);

        if (member === "interruptUnsafe") return report(node, member);

        const object = node.object;

        const module =
          object.type === "Identifier"
            ? modules.get(object.name)
            : object.type === "MemberExpression" &&
                object.object.type === "Identifier" &&
                packages.has(object.object.name)
              ? propertyName(object)
              : undefined;

        if (module !== undefined && isBanned(module, member)) report(node, `${module}.${member}`);
      },
      VariableDeclarator(node: ESTree.VariableDeclarator) {
        // `const { forkDetach } = Effect`: a banned member taken out of its module.
        const module = node.init?.type === "Identifier" ? modules.get(node.init.name) : undefined;

        if (module === undefined || node.id.type !== "ObjectPattern") return;

        for (const property of node.id.properties)
          if (property.type === "Property" && property.key.type === "Identifier" && isBanned(module, property.key.name))
            report(property, `${module}.${property.key.name}`);
      },
    };
  },
});
