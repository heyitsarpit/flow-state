// The previous build of stale.ts, still running: the order was ascending then. Never given to the reader.
import { asc, domain, eq, read } from "../flow.ts";
import { issuesInProject } from "./ops.ts";
import { Issue } from "./issues.ts";

export const Stale = domain("stale", {
  list: read(issuesInProject)
    .list(Issue, ({ result }) => result.issues)
    .where(({ input, record }) => eq(record.projectId, input.projectId))
    .orderBy(({ record }) => [asc(record.number), asc(record.id)]),
});
