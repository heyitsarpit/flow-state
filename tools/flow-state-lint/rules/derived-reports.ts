import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

// The reports an act determines: built only by evidenceOf, never beside the act.
const DERIVED = new Set(["Minted", "Sent", "Lane", "Ended"]);

export const derivedReportsRule = defineRule({
  meta: {
    type: "problem",
    docs: { description: "Reports an act determines are built only in evidenceOf." },
    messages: {
      derived:
        "`{{kind}}` is a report an act determines: derive it in evidenceOf (src/core/evidence-of.ts), not beside the act.",
    },
    schema: [],
  },
  createOnce(context) {
    // Local names bound to the Evidence constructors, under any alias.
    let names = new Set<string>();

    return {
      Program() {
        names = new Set();
      },
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        if (!String(node.source.value).endsWith("/evidence.ts")) return;

        for (const s of node.specifiers)
          if (
            s.type === "ImportSpecifier" &&
            s.imported.type === "Identifier" &&
            s.imported.name === "Evidence"
          )
            names.add(s.local.name);
          else if (s.type === "ImportNamespaceSpecifier") names.add(`${s.local.name}.Evidence`);
      },
      MemberExpression(node: ESTree.MemberExpression) {
        const owner = context.sourceCode.getText(node.object);

        if (!names.has(owner)) return;

        const kind =
          node.property.type === "Identifier" && !node.computed
            ? node.property.name
            : node.property.type === "Literal"
              ? String(node.property.value)
              : "";

        if (DERIVED.has(kind)) context.report({ node, messageId: "derived", data: { kind } });
      },
      Property(node: ESTree.Property) {
        const key =
          node.key.type === "Identifier" ? node.key.name : String((node.key as ESTree.Literal).value);

        if (
          key === "_tag" &&
          node.value.type === "Literal" &&
          DERIVED.has(String(node.value.value))
        )
          context.report({ node, messageId: "derived", data: { kind: String(node.value.value) } });
      },
    };
  },
});
