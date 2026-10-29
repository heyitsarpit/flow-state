// merge 4's Issues domain (merge-4-entities/proposal.md:119-132), ported. One line changed: setLike's
// `likes`, which was a JavaScript function (`i.likes + (… ? 0 : … ? 1 : -1)`), is now an operator expression.
import { add, asc, desc, domain, entity, eq, read, when, write } from "../flow.ts";
import { createIssue, issuesInProject, removeIssue, renameIssue, setLike } from "./ops.ts";
import type { IssueRow } from "./ops.ts";

export const Issue = entity<IssueRow>()({ id: "issues/Issue", primaryKey: ["id"] });

export const Issues = domain("issues", {
  list: read(issuesInProject)
    .list(Issue, ({ result }) => result.issues)
    .where(({ input, record }) => eq(record.projectId, input.projectId))
    .orderBy(({ record }) => [desc(record.number), asc(record.id)]),
  setLike: write(setLike).one(Issue).predicts(({ input }) => Issue.patch(input.key, {
    liked: input.liked,
    likes: (i) => add(i.likes, when(eq(input.liked, i.liked), 0, when(input.liked, 1, -1))),
  })),
  rename: write(renameIssue).one(Issue).predicts(({ input }) => Issue.patch(input.key, { title: input.title })),
  remove: write(removeIssue).predicts(({ input }) => Issue.delete(input.key)),
  create: write(createIssue).one(Issue),
});
