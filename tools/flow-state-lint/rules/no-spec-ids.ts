import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

// A Spec, Plan or Task id written into production text: the Spec owns its ids and tests cite
// them, so comments and strings in production code never do (Epic constraint: no plan or
// invariant ids in code).
const SPEC = "Actors|WriteLanes|WriteAhead|Turn|Reads|Restore|Compile|Codec|Diagnostics|StaticCli|Inspection|Runtime|Operations|Conformance";

const SPEC_ID = new RegExp(
  `\\b(?:${SPEC})(?:\\s+Spec(?:'s)?)?\\s+[A-Z]\\d+\\b|\\bT\\d+\\b|@(?:task|plan|spec)\\.`,
  "u",
);

type Located = { readonly text: string; readonly loc: ESTree.SourceLocation };

// Consecutive `//` lines read as one comment, so an id split across lines is still one id.
const commentRuns = (comments: ReadonlyArray<ESTree.Comment>): ReadonlyArray<Located> => {
  const runs: Array<Located> = [];

  for (const comment of comments) {
    const last = runs.at(-1);

    if (
      last !== undefined &&
      comment.type === "Line" &&
      comment.loc.start.line === last.loc.end.line + 1
    )
      runs[runs.length - 1] = {
        text: `${last.text} ${comment.value.trim()}`,
        loc: { start: last.loc.start, end: comment.loc.end },
      };
    else runs.push({ text: comment.value, loc: comment.loc });
  }

  return runs;
};

export const noSpecIdsRule = defineRule({
  meta: {
    type: "suggestion",
    docs: { description: "No Spec, Plan or Task ids in production comments or strings." },
    messages: {
      specId:
        "Production text cites the id `{{id}}`. The Spec owns its ids and tests cite them; say what the code guarantees instead.",
    },
    schema: [],
  },
  createOnce(context) {
    const check = (text: string, loc: ESTree.SourceLocation) => {
      const found = SPEC_ID.exec(text);

      if (found !== null) context.report({ loc, messageId: "specId", data: { id: found[0] } });
    };

    return {
      Literal(node: ESTree.Literal) {
        if (typeof node.value === "string") check(node.value, node.loc);
      },
      TemplateElement(node: ESTree.TemplateElement) {
        check(node.value.raw, node.loc);
      },
      "Program:exit"(_node: ESTree.Program) {
        for (const run of commentRuns(context.sourceCode.getAllComments())) check(run.text, run.loc);
      },
    };
  },
});
