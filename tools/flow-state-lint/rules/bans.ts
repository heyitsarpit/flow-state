import { defineRule } from "@oxlint/plugins";

import { appliesTo, optionsSchema, propertyName, relativePath } from "./shared.ts";

import type { ESTree } from "@oxlint/plugins";
import type { Options } from "./shared.ts";

// One rule per ban. Each covers all of packages/flow-state-v3 unless its options narrow it (see
// shared.ts); vite.config.ts lists them, so where a rule applies is read in one place.
const GLOBAL_OBJECTS = new Set(["global", "globalThis", "window"]);

const EFFECT_MODULES = new Set(["effect", "effect/Effect"]);

type Ban = {
  readonly description: string;
  readonly message: string;
  // Bare global names, also caught as `globalThis.name`, `global.name` and `window.name`.
  readonly globals: ReadonlyArray<string>;
  // `object.property` uses; `object` is a global (Math, JSON), or `Effect`, which is resolved
  // through the imports: any binding of the Effect module, under any name.
  readonly properties: ReadonlyArray<readonly [object: string, property: string]>;
};

const inTypePosition = (node: ESTree.Node) =>
  node.parent?.type === "TSTypeReference" ||
  node.parent?.type === "TSQualifiedName" ||
  node.parent?.type === "TSTypeQuery";

const importedName = (specifier: ESTree.ImportSpecifier) =>
  specifier.imported.type === "Identifier"
    ? specifier.imported.name
    : String(specifier.imported.value);

const banRule = (ban: Ban) =>
  defineRule({
    meta: {
      type: "problem",
      docs: { description: ban.description },
      messages: { banned: "`{{name}}` is banned here. {{reason}}" },
      schema: optionsSchema,
    },
    createOnce(context) {
      const globals = new Set(ban.globals);
      const effectProperties = new Set(
        ban.properties.filter(([object]) => object === "Effect").map(([, name]) => name),
      );

      // Local names bound to the Effect module (`import * as E from "effect/Effect"`, `import {
      // Effect as Fx } from "effect"`), and to the package itself (`import * as E from "effect"`,
      // where `E.Effect` is the module).
      let effectModule = new Set<string>();
      let effectPackage = new Set<string>();

      const report = (node: ESTree.Node, name: string) =>
        context.report({ node, messageId: "banned", data: { name, reason: ban.message } });

      const isEffectModule = (object: ESTree.Expression) =>
        (object.type === "Identifier" && (object.name === "Effect" || effectModule.has(object.name))) ||
        (object.type === "MemberExpression" &&
          object.object.type === "Identifier" &&
          effectPackage.has(object.object.name) &&
          propertyName(object) === "Effect");

      // `globalThis.Math.random` and `globalThis["Math"].random` read as `Math.random`.
      const globalOwner = (object: ESTree.Expression) => {
        if (object.type === "Identifier") return object.name;

        if (
          object.type === "MemberExpression" &&
          object.object.type === "Identifier" &&
          GLOBAL_OBJECTS.has(object.object.name)
        )
          return propertyName(object);

        return "";
      };

      return {
        before() {
          const rel = relativePath(context.filename);
          const given: Options = context.options[0] ?? {};

          effectModule = new Set();
          effectPackage = new Set();

          return rel !== undefined && appliesTo(rel, given);
        },
        ImportDeclaration(node: ESTree.ImportDeclaration) {
          const source = String(node.source.value);

          if (!EFFECT_MODULES.has(source)) return;

          for (const specifier of node.specifiers)
            if (specifier.type === "ImportNamespaceSpecifier")
              (source === "effect" ? effectPackage : effectModule).add(specifier.local.name);
            else if (specifier.type === "ImportDefaultSpecifier") effectModule.add(specifier.local.name);
            else if (importedName(specifier) === "Effect" && source === "effect")
              effectModule.add(specifier.local.name);
            else if (source === "effect/Effect" && effectProperties.has(importedName(specifier)))
              report(specifier, `Effect.${importedName(specifier)}`);
        },
        // A bare global is a reference no module or function scope resolves: it falls through to
        // the global scope. A type position (`x: Date`) is not a use.
        Program() {
          const root = context.sourceCode.scopeManager.globalScope;

          if (root === null) return;

          const declaredGlobals = [...root.set.values()].filter((v) => v.defs.length === 0);
          const references = [...root.through, ...declaredGlobals.flatMap((v) => v.references)];
          const seen = new Set<ESTree.Node>();

          for (const { identifier } of references)
            if (
              globals.has(identifier.name) &&
              !seen.has(identifier) &&
              !inTypePosition(identifier)
            ) {
              seen.add(identifier);
              report(identifier, identifier.name);
            }
        },
        MemberExpression(node: ESTree.MemberExpression) {
          const property = propertyName(node);

          if (
            node.object.type === "Identifier" &&
            GLOBAL_OBJECTS.has(node.object.name) &&
            globals.has(property) &&
            !globals.has(node.object.name)
          )
            report(node, `${node.object.name}.${property}`);

          const owner = globalOwner(node.object);

          if (ban.properties.some(([object, name]) => object === owner && name === property))
            report(node, `${owner}.${property}`);

          if (effectProperties.has(property) && isEffectModule(node.object))
            report(node, `Effect.${property}`);
        },
      };
    },
  });

export const bans = {
  "no-json-stringify": banRule({
    description: "No JSON.stringify.",
    message:
      "Not for equality or keys, files or display: use the value's Schema codec, Schema.toEquivalence, or Effect's formatter.",
    globals: [],
    properties: [["JSON", "stringify"]],
  }),
  "no-entropy": banRule({
    description: "No Math.random or crypto.",
    message:
      "Runs are deterministic: ids come from the runtime's mint and the world's seed, so a story, replay or search reproduces.",
    globals: ["crypto"],
    properties: [["Math", "random"]],
  }),
  "no-clock": banRule({
    description: "No Date or performance.",
    message: "Use Effect's Clock, or the fake world's clock: a run must reproduce from its seed.",
    globals: ["Date", "performance"],
    properties: [],
  }),
  "no-timers": banRule({
    description: "No setTimeout, clearTimeout, setInterval or queueMicrotask.",
    message:
      "Use Effect's Clock, Scheduler and Effect.sleep, or the fake world's tasks: the core returns work as data for the driver.",
    globals: ["setTimeout", "clearTimeout", "setInterval", "queueMicrotask"],
    properties: [],
  }),
  "no-host-apis": banRule({
    description: "No window, document, navigator, indexedDB, localStorage or sessionStorage.",
    message: "Host APIs belong in src/host: the freeze bug, the bfcache lock, Safari's false oncomplete.",
    globals: ["window", "document", "navigator", "indexedDB", "localStorage", "sessionStorage"],
    properties: [],
  }),
  "no-effect-runtime": banRule({
    description: "No Effect runtime or Promise in the core.",
    message:
      "The core is pure and synchronous: it returns work as data and the host runs it (0.2 ms turns; Effect.try costs 170 ns against 7 ns).",
    globals: ["Promise"],
    properties: ["gen", "runSync", "runPromise", "runFork", "try", "tryPromise"].map(
      (name) => ["Effect", name] as const,
    ),
  }),
};
