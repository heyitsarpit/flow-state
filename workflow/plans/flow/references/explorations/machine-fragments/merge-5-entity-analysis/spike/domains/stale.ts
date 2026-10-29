// The source as it is now: a lint-clean declaration. main.ts records it from stale.previous-build.ts, the
// code that is actually running, to exercise DomainSourceMismatch (a stale build).
import { asc, desc, domain, eq, read } from "../flow.ts";
import { issuesInProject } from "./ops.ts";
import { Issue } from "./issues.ts";

export const Stale = domain("stale", {
  list: read(issuesInProject)
    .list(Issue, ({ result }) => result.issues)
    .where(({ input, record }) => eq(record.projectId, input.projectId))
    .orderBy(({ record }) => [desc(record.number), asc(record.id)]),
});
