import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { defineRule } from "@oxlint/plugins";
import { parseSync } from "oxc-parser";

import { propertyName, relativePath } from "./shared.ts";

import type { ESTree } from "@oxlint/plugins";

// What a definition declares: the names of its schedules, or `unknown` when its declaration is no
// object literal of plain keys (`schedules: Pay.schedules`), which the rule never judges.
type Declared = ReadonlySet<string> | "unknown";

// The names a schedule map places, or `unknown` when a part of it cannot be read here.
type Placed = ReadonlyArray<string> | "unknown";

// The old form's names: the keyed wrapper's types and the wide key.
const OLD_TYPES = new Set(["KeyedConfig", "KeyedSchedule", "ScheduleKey", "ScheduleParts", "ErasedEntry"]);

// FLOW_STATE_ALLOW_UNKNOWN: an ESTree node of this file or of a parsed sibling, read by its shape.
type AnyNode = { readonly type: string; readonly [key: string]: unknown };

const isNode = (value: unknown): value is AnyNode =>
  typeof value === "object" && value !== null && typeof (value as { type?: unknown }).type === "string";

const keyName = (key: unknown, computed: unknown): string | undefined => {
  if (computed === true || !isNode(key)) return undefined;

  if (key.type === "Identifier") return String(key["name"]);

  return key.type === "Literal" && typeof key["value"] === "string" ? key["value"] : undefined;
};

// The calls whose first argument declares: a definition, and a trait or a subroutine, which also take
// their own body.
const DECLARERS = new Set(["definition", "trait", "subroutine"]);

const SELF_BODIED = new Set(["trait", "subroutine"]);

// A call of `definition(...)`, `trait(...)` or `subroutine(...)`: its config object, when it is a literal.
const definitionConfig = (node: unknown) =>
  isNode(node) &&
  node.type === "CallExpression" &&
  isNode(node["callee"]) &&
  node["callee"].type === "Identifier" &&
  DECLARERS.has(String(node["callee"]["name"])) &&
  Array.isArray(node["arguments"]) &&
  isNode(node["arguments"][0]) &&
  node["arguments"][0].type === "ObjectExpression"
    ? node["arguments"][0]
    : undefined;

// What one definition config declares.
const declaredBy = (config: AnyNode): Declared => {
  const properties = Array.isArray(config["properties"]) ? config["properties"] : [];
  const schedules = properties.find(
    (p): p is AnyNode =>
      isNode(p) && p.type === "Property" && keyName(p["key"], p["computed"]) === "schedules",
  );

  if (schedules === undefined) return new Set();

  const value = schedules["value"];

  if (!isNode(value) || value.type !== "ObjectExpression" || !Array.isArray(value["properties"]))
    return "unknown";

  const names = value["properties"].map((p) =>
    isNode(p) && p.type === "Property" ? keyName(p["key"], p["computed"]) : undefined,
  );

  return names.every((name) => name !== undefined) ? new Set(names) : "unknown";
};

// The top-level `const Name = init` declarations of a program, exported or not.
const topLevel = (program: AnyNode) => {
  const found = new Map<string, unknown>();
  const body = Array.isArray(program["body"]) ? program["body"] : [];

  for (const statement of body) {
    const declaration =
      isNode(statement) && statement.type === "ExportNamedDeclaration"
        ? statement["declaration"]
        : statement;

    if (isNode(declaration) && declaration.type === "VariableDeclaration")
      for (const d of Array.isArray(declaration["declarations"]) ? declaration["declarations"] : [])
        if (isNode(d) && isNode(d["id"]) && d["id"].type === "Identifier")
          found.set(String(d["id"]["name"]), d["init"]);
  }

  return found;
};

// What the definition a sibling file exports under `name` declares; unknown when it cannot be read.
const siblingDeclared = (from: string, source: string, name: string): Declared => {
  const base = resolve(dirname(from), source);

  for (const path of [base, `${base}.ts`, base.replace(/\.js$/u, ".ts")]) {
    const text = (() => {
      try {
        return readFileSync(path, "utf8");
      } catch {
        return undefined;
      }
    })();

    if (text === undefined) continue;

    const config = definitionConfig(topLevel(parseSync(path, text).program as AnyNode).get(name));

    return config === undefined ? "unknown" : declaredBy(config);
  }

  return "unknown";
};

// A call of `machine(definition, body)` or `x.machine(definition, body)`, or of a trait or a
// subroutine, whose body is its second argument too.
const isMachineCall = (node: ESTree.CallExpression) =>
  node.callee.type === "Identifier"
    ? node.callee.name === "machine" || SELF_BODIED.has(node.callee.name)
    : node.callee.type === "MemberExpression" && propertyName(node.callee) === "machine";

// A schedule placed in a machine body is declared on its definition, and the old form is gone: a
// plain body `schedules:` block whose definition declares none of its names, `Flow.keyed`, the keyed
// wrapper and its types. The definition is read in the same file or in the sibling file it is
// imported from. A refusal test that writes the old form on purpose keeps it with
// `// oxlint-disable-next-line flow-state/no-undeclared-schedule -- reason`.
export const noUndeclaredScheduleRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Every schedule a machine body places is declared on its definition; the old keyed form is gone.",
    },
    messages: {
      undeclared:
        "The schedule {{name}} is not declared on its definition: add `schedules: { {{name}}: { key?, pausedBy?, restartOn? } }` to the definition.",
      old: "{{name}} is the old schedule form: declare the schedule on the definition and place it as a plain object.",
    },
    schema: [
      {
        type: "object",
        properties: { outside: { type: "boolean" } },
        additionalProperties: false,
      },
    ],
  },
  createOnce(context) {
    let locals = new Map<string, unknown>();
    let imports = new Map<string, { readonly source: string; readonly name: string }>();
    let machines: Array<ESTree.CallExpression> = [];
    let maps: Array<ESTree.Property> = [];

    // What the definition a machine call names declares.
    const declaredOf = (call: ESTree.CallExpression): Declared => {
      const own = definitionConfig(call);

      if (own !== undefined) return declaredBy(own);

      const first = call.arguments[0];

      if (first?.type !== "Identifier") return "unknown";

      const local = definitionConfig(locals.get(first.name));

      if (local !== undefined) return declaredBy(local);

      const imported = imports.get(first.name);

      return imported !== undefined && imported.source.startsWith(".")
        ? siblingDeclared(context.filename, imported.source, imported.name)
        : "unknown";
    };

    // The names an object literal places, its spreads and an identifier read from this file.
    const namesOf = (value: unknown): Placed => {
      const object =
        isNode(value) && value.type === "Identifier" ? locals.get(String(value["name"])) : value;

      if (!isNode(object) || object.type !== "ObjectExpression" || !Array.isArray(object["properties"]))
        return "unknown";

      const names: Array<string> = [];

      for (const p of object["properties"]) {
        const part: Placed =
          isNode(p) && p.type === "SpreadElement"
            ? namesOf(p["argument"])
            : isNode(p) && p.type === "Property"
              ? [keyName(p["key"], p["computed"]) ?? ""]
              : "unknown";

        if (part === "unknown") return "unknown";

        names.push(...part);
      }

      return names;
    };

    // The machine call whose body holds a node, if one does.
    const enclosing = (node: ESTree.Node) => {
      for (let at: ESTree.Node | null | undefined = node; at; at = at.parent) {
        const up = at.parent;

        if (up?.type === "CallExpression" && isMachineCall(up) && up.arguments[1] === at) return up;
      }

      return undefined;
    };

    // The machine calls a schedule map outside every body belongs to: those whose body names the
    // function it is built in (`const on = (send) => ({ schedules })` called as `on(E.T)`).
    const callersOf = (node: ESTree.Node) => {
      for (let at: ESTree.Node | null | undefined = node; at; at = at.parent) {
        const up = at.parent;

        if (
          (at.type === "ArrowFunctionExpression" || at.type === "FunctionExpression") &&
          up?.type === "VariableDeclarator" &&
          up.id.type === "Identifier"
        ) {
          const name = up.id.name;

          return machines.filter((call) => {
            const body = call.arguments[1];

            return body !== undefined && new RegExp(`\\b${name}\\b`, "u").test(context.sourceCode.getText(body));
          });
        }
      }

      return [];
    };

    const undeclared = (placed: Placed, declared: Declared) => {
      if (declared === "unknown") return [];

      if (placed === "unknown") return declared.size === 0 ? ["?"] : [];

      return placed.filter((name) => !declared.has(name));
    };

    return {
      before() {
        const options: { readonly outside?: boolean } = context.options[0] ?? {};

        locals = new Map();
        imports = new Map();
        machines = [];
        maps = [];

        return options.outside === true || relativePath(context.filename) !== undefined;
      },
      Program(node: ESTree.Program) {
        locals = topLevel(node as unknown as AnyNode);

        for (const statement of node.body)
          if (statement.type === "ImportDeclaration")
            for (const specifier of statement.specifiers)
              if (specifier.type === "ImportSpecifier")
                imports.set(specifier.local.name, {
                  source: String(statement.source.value),
                  name:
                    specifier.imported.type === "Identifier"
                      ? specifier.imported.name
                      : String(specifier.imported.value),
                });

        for (const statement of node.body)
          if (statement.type === "VariableDeclaration")
            for (const d of statement.declarations)
              if (d.id.type === "Identifier" && d.init !== null) locals.set(d.id.name, d.init);
      },
      VariableDeclarator(node: ESTree.VariableDeclarator) {
        if (node.id.type === "Identifier" && node.init !== null && !locals.has(node.id.name))
          locals.set(node.id.name, node.init);
      },
      CallExpression(node: ESTree.CallExpression) {
        if (isMachineCall(node)) machines.push(node);
      },
      Property(node: ESTree.Property) {
        if (keyName(node.key, node.computed) === "~flow" && node.value.type === "Literal")
          if (node.value.value === "keyed")
            context.report({ node, messageId: "old", data: { name: "The keyed wrapper" } });

        if (keyName(node.key, node.computed) !== "schedules") return;

        const holder = node.parent;

        if (holder?.type !== "ObjectExpression" || definitionConfig(holder.parent) === holder) return;

        const value = node.value;

        if (value.type === "ObjectExpression" || value.type === "Identifier") maps.push(node);
      },
      MemberExpression(node: ESTree.MemberExpression) {
        if (node.object.type === "Identifier" && node.object.name === "Flow" && propertyName(node) === "keyed")
          context.report({ node, messageId: "old", data: { name: "Flow.keyed" } });
      },
      TSTypeReference(node: ESTree.TSTypeReference) {
        if (node.typeName.type === "Identifier" && OLD_TYPES.has(node.typeName.name))
          context.report({ node, messageId: "old", data: { name: node.typeName.name } });
      },
      "Program:exit"() {
        for (const map of maps) {
          const placed = namesOf(map.value);
          const owner = enclosing(map);
          const calls = owner === undefined ? callersOf(map) : [owner];
          const names = calls.flatMap((call) => undeclared(placed, declaredOf(call)));

          if (names.length > 0)
            context.report({ node: map, messageId: "undeclared", data: { name: names[0] ?? "?" } });
        }
      },
    };
  },
});
